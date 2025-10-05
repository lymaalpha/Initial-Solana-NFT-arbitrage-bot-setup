import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { SolendMarket } from '@solendprotocol/solend-sdk';
import { ArbitrageSignal, TradeLog } from './types';
import { buildExecuteSaleTransaction } from './marketplaceInstructions';
import { pnlLogger } from './pnlLogger';
import { config } from './config';
import BN from 'bn.js';
import bs58 from 'bs58';

const connection = new Connection(config.rpcUrl, 'confirmed');
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));
const FLASHLOAN_RESERVE = new PublicKey('So11111111111111111111111111111111111111112');

export async function executeMarketplaceArbitrage(signal: ArbitrageSignal): Promise<{ buySig?: string; sellSig?: string }> {
  const tx = await buildExecuteSaleTransaction({
    connection,
    payerKeypair: payer,
    listing: signal.targetListing,
    bid: signal.targetBid
  });

  const simResult = await connection.simulateTransaction(tx);
  if (simResult.value.err) throw new Error(`Simulation failed: ${simResult.value.err}`);

  let txSig: string | undefined;
  if (!config.simulateOnly) {
    txSig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: 'confirmed', maxRetries: 3 });
  } else {
    txSig = `sim_tx_${Date.now()}`;
  }

  pnlLogger.logInfo(`Marketplace arb executed: ${txSig}`);
  return { buySig: txSig, sellSig: txSig };
}

export async function executeFlashloanArbitrage(signal: ArbitrageSignal): Promise<TradeLog | null> {
  try {
    pnlLogger.logInfo(`Executing flashloan arb for ${signal.targetListing.mint}`);

    const market = await SolendMarket.initialize({ connection, cluster: 'devnet' });
    await market.loadReserves();

    const borrowLamports = signal.targetListing.price.add(config.feeBufferLamports);
    const borrowSOL = borrowLamports.toNumber() / 1e9;

    pnlLogger.logInfo(`Borrowing ${borrowSOL.toFixed(3)} SOL from Solend...`);

    await market.flashLoan({
      amount: borrowSOL,
      reserve: FLASHLOAN_RESERVE,
      receiver: payer.publicKey,
      callback: async () => {
        const { buySig, sellSig } = await executeMarketplaceArbitrage(signal);
        pnlLogger.logInfo(`Buy: ${buySig} | Sell: ${sellSig}`);
      },
    });

    const tradeLog: TradeLog = {
      timestamp: Date.now(),
      mint: signal.targetListing.mint,
      buyPrice: signal.targetListing.price,
      sellPrice: signal.targetBid.price,
      netProfit: signal.estimatedNetProfit,
      currency: signal.targetListing.currency,
      txSig: undefined,
      type: 'executed',
      notes: `Confidence: ${signal.confidence}`,
      executorType: 'flash_loan'
    };

    await pnlLogger.logTrade(tradeLog);
    return tradeLog;
  } catch (err: any) {
    pnlLogger.logError(err, { mint: signal.targetListing.mint });

    const tradeLog: TradeLog = {
      timestamp: Date.now(),
      mint: signal.targetListing.mint,
      buyPrice: signal.targetListing.price,
      sellPrice: signal.targetBid.price,
      netProfit: new BN(0),
      currency: signal.targetListing.currency,
      txSig: undefined,
      type: 'failed',
      notes: `Error: ${err.message}`,
      executorType: 'flash_loan'
    };

    await pnlLogger.logTrade(tradeLog);
    return null;
  }
}

export async function executeBatch(signals: ArbitrageSignal[]): Promise<TradeLog[]> {
  const trades: TradeLog[] = [];
  for (const signal of signals) {
    const trade = await executeFlashloanArbitrage(signal);
    if (trade) trades.push(trade);
    await new Promise(res => setTimeout(res, 1000 + Math.random() * 2000));
  }
  return trades;
}
