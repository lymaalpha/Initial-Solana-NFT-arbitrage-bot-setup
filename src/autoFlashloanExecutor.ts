// autoFlashloanExecutor.ts
import { Connection, Keypair, Transaction } from '@solana/web3.js';
import { SolendMarket } from '@solendprotocol/solend-sdk';
import BN from 'bn.js';
import { ArbitrageSignal, TradeLog, ExecutorType } from './types';
import { pnlLogger } from './pnlLogger';
import { config } from './config';
import { buildExecuteSaleTransaction } from './marketplaceExecutor';

const connection = new Connection(config.rpcUrl, 'confirmed');
const payer = Keypair.fromSecretKey(Buffer.from(config.walletPrivateKey, 'base58'));

/**
 * Executes a single arbitrage signal using a flash loan from Solend
 */
export async function executeFlashloanTrade(signal: ArbitrageSignal): Promise<TradeLog | null> {
  try {
    // 1️⃣ Initialize Solend market
    const market = await SolendMarket.initialize({
      connection,
      cluster: 'mainnet-beta', // or 'devnet' for testing
    });

    // 2️⃣ Determine borrow amount (listing price in SOL)
    const borrowAmountSOL = signal.targetListing.price.toNumber() / 1e9;

    // 3️⃣ Execute flash loan
    await market.flashLoan({
      amount: borrowAmountSOL,
      reserve: 'So11111111111111111111111111111111111111112', // WSOL
      receiver: payer.publicKey.toString(),
      callback: async (_conn, _keypair) => {
        // 4️⃣ Build marketplace transaction
        const tx: Transaction = await buildExecuteSaleTransaction({
          connection,
          payerKeypair: payer,
          listing: signal.targetListing,
          bid: signal.targetBid
        });

        // 5️⃣ Send transaction
        const txSig = await connection.sendTransaction(tx, [payer], { skipPreflight: false, preflightCommitment: 'confirmed' });

        // 6️⃣ Log trade
        const netProfit = signal.estimatedNetProfit;
        pnlLogger.logPnL(signal, txSig, 'executed');

        return txSig;
      }
    });

    // 7️⃣ Return trade info for bot stats
    return {
      timestamp: Date.now(),
      mint: signal.targetListing.mint,
      buyPrice: signal.targetListing.price,
      sellPrice: signal.targetBid.price,
      netProfit: signal.estimatedNetProfit,
      currency: signal.targetListing.currency,
      txSig: undefined, // handled by pnlLogger
      type: 'executed',
      executorType: 'flash_loan'
    };

  } catch (err: any) {
    pnlLogger.logPnL(signal, undefined, 'failed');
    await pnlLogger.logError(err, { signal });
    return null;
  }
}

/**
 * Execute multiple signals in parallel (batch)
 */
export async function executeBatch(signals: ArbitrageSignal[]): Promise<(TradeLog | null)[]> {
  const promises = signals.map(signal => executeFlashloanTrade(signal));
  const results = await Promise.all(promises);
  return results;
}
