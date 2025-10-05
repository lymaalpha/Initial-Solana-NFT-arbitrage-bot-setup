import { Connection, Keypair, Transaction } from '@solana/web3.js';
import { pnlLogger } from './pnlLogger';
import { ArbitrageSignal, TradeLog } from './types';
import { executeSale } from './marketplaceInstructions';
import { config } from './config';
import { SolendAction, SolendMarket } from '@solendprotocol/solend-sdk';
import BN from 'bn.js';
import bs58 from 'bs58';

const connection = new Connection(config.rpcUrl, 'confirmed');
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

export async function executeFlashloanTrade(signal: ArbitrageSignal): Promise<TradeLog | null> {
  try {
    const market = await SolendMarket.initialize({ connection, cluster: 'mainnet-beta' });
    const borrowAmountSOL = signal.targetListing.price.toNumber() / 1e9;
    const wsolReserve = market.reserves.find(r => r.config.mint === 'So11111111111111111111111111111111111111112');
    if (!wsolReserve) throw new Error('WSOL reserve not found');

    const flashLoanTx = new Transaction();
    const flashLoanIx = SolendAction.createFlashLoanIx({
      sourceReserve: wsolReserve,
      amount: borrowAmountSOL,
      receiver: payer.publicKey,
      programId: market.programId,
    });
    flashLoanTx.add(flashLoanIx);

    const saleResponse = await executeSale({ connection, payerKeypair: payer, listing: signal.targetListing, bid: signal.targetBid });
    const txSig = saleResponse.response.signature || '';

    pnlLogger.logPnL(signal, txSig, 'executed');

    return {
      timestamp: Date.now(),
      mint: signal.targetListing.mint,
      buyPrice: signal.targetListing.price,
      sellPrice: signal.targetBid.price,
      netProfit: signal.estimatedNetProfit,
      currency: signal.targetListing.currency,
      txSig,
      type: 'executed',
      executorType: 'flash_loan',
    };
  } catch (err: any) {
    pnlLogger.logPnL(signal, undefined, 'failed');
    pnlLogger.logError(err, { signal });
    return null;
  }
}

export async function executeBatch(signals: ArbitrageSignal[]): Promise<(TradeLog | null)[]> {
  const results: (TradeLog | null)[] = [];
  for (const signal of signals) results.push(await executeFlashloanTrade(signal));
  return results;
}
