// autoFlashloanExecutor.ts
import { Connection, Keypair, Transaction, PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import bs58 from 'bs58';
import { config } from './config';
import { ArbitrageSignal, TradeLog } from './types';
import { executeSale } from './marketplaceInstructions';
import { pnlLogger } from './pnlLogger';
import { SolendMarket, SolendReserve, SolendAction } from '@solendprotocol/solend-sdk';

// Connection & wallet
const connection = new Connection(config.rpcUrl, 'confirmed');
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

/**
 * Execute a single flashloan arbitrage trade
 */
export async function executeFlashloanTrade(signal: ArbitrageSignal): Promise<TradeLog | null> {
  try {
    const market = await SolendMarket.initialize({ connection, cluster: 'mainnet-beta' });

    // Find WSOL reserve for flash loan
    const wsolReserve: SolendReserve | undefined = market.reserves.find(
      (r) => r.config.mint === 'So11111111111111111111111111111111111111112'
    );
    if (!wsolReserve) throw new Error('WSOL reserve not found');

    // Amount to borrow in lamports
    const borrowAmountLamports = signal.targetListing.price.toNumber();

    // Build flash loan instruction
    const flashLoanTx = new Transaction();
    const flashLoanIx = SolendAction.createFlashLoanIx({
      sourceReserve: wsolReserve,
      amount: borrowAmountLamports,
      receiver: payer.publicKey,
      programId: market.programId,
    });
    flashLoanTx.add(flashLoanIx);

    // Only simulate if configured
    if (config.simulateOnly) {
      const simResult = await connection.simulateTransaction(flashLoanTx);
      if (simResult.value.err) {
        pnlLogger.logMetrics({ message: '⚠️ Flashloan simulation failed', error: simResult.value.err });
        return null;
      } else {
        pnlLogger.logMetrics({ message: '✅ Flashloan simulation succeeded (simulate-only mode)' });
        return null;
      }
    }

    // Execute NFT sale inside the flash loan transaction
    const saleTx = await executeSale({
      connection,
      payerKeypair: payer,
      listing: signal.targetListing,
      bid: signal.targetBid,
    });

    // Combine flash loan + NFT sale into one atomic transaction
    const combinedTx = new Transaction().add(...flashLoanTx.instructions, ...saleTx.instructions);

    // Send transaction
    const txSig = await connection.sendTransaction(combinedTx, [payer], { preflightCommitment: 'confirmed' });

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

/**
 * Execute multiple flashloan arbitrage trades sequentially
 */
export async function executeBatch(signals: ArbitrageSignal[]): Promise<(TradeLog | null)[]> {
  const results: (TradeLog | null)[] = [];
  for (const signal of signals) {
    try {
      const trade = await executeFlashloanTrade(signal);
      results.push(trade);
    } catch (err: any) {
      pnlLogger.logError(err, { signal, message: 'Batch trade failed' });
      results.push(null);
    }
  }
  return results;
}

/**
 * Execute multiple trades in parallel (optional)
 */
export async function executeBatchParallel(signals: ArbitrageSignal[], concurrency = 2): Promise<(TradeLog | null)[]> {
  const results: (TradeLog | null)[] = [];
  const queue = [...signals];

  const workers = Array(concurrency).fill(null).map(async () => {
    while (queue.length > 0) {
      const signal = queue.shift();
      if (!signal) continue;
      try {
        const trade = await executeFlashloanTrade(signal);
        results.push(trade);
      } catch (err: any) {
        pnlLogger.logError(err, { signal, message: 'Parallel batch trade failed' });
        results.push(null);
      }
    }
  });

  await Promise.all(workers);
  return results;
}
