// autoFlashloanExecutor.ts
import { Connection, Keypair, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import { ArbitrageSignal, TradeLog } from './types';
import { executeSale } from './marketplaceInstructions';
import { pnlLogger } from './pnlLogger';
import { config } from './config';
import bs58 from 'bs58';
import { SolendMarket, SolendAction } from '@solendprotocol/solend-sdk';

const connection = new Connection(config.rpcUrl, 'confirmed');
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

const MAX_CONCURRENT_TRADES = 2;

export async function executeFlashloanTrade(signal: ArbitrageSignal): Promise<TradeLog | null> {
  try {
    // Initialize Solend market
    const market = await SolendMarket.initialize(connection, 'mainnet-beta');
    await market.loadReserves();

    const solReserve = market.reserves.find(r => r.asset === 'SOL');
    if (!solReserve) throw new Error('SOL reserve not found');

    const borrowAmount = signal.targetListing.price.add(config.feeBufferLamports);

    // Pre-simulate sale transaction
    const simTx = await executeSale({
      connection,
      payerKeypair: payer,
      listing: signal.targetListing,
      bid: signal.targetBid,
    });

    if (!simTx.signature) throw new Error('Simulation failed: sale transaction not valid');

    // Execute flashloan with callback
    const flashloanResult = await SolendAction.flashLoan({
      connection,
      market,
      payer,
      reserve: solReserve,
      amount: borrowAmount.toNumber() / 1e9,
      callback: async () => {
        return await executeSale({
          connection,
          payerKeypair: payer,
          listing: signal.targetListing,
          bid: signal.targetBid,
        });
      },
    });

    const txSig = flashloanResult?.signature || '';
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

  for (let i = 0; i < signals.length; i += MAX_CONCURRENT_TRADES) {
    const batch = signals.slice(i, i + MAX_CONCURRENT_TRADES);
    const batchResults = await Promise.all(batch.map(signal => executeFlashloanTrade(signal)));
    results.push(...batchResults);
  }

  return results;
}
