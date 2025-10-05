// autoFlashloanExecutor.ts
import { Connection, Keypair, Transaction, PublicKey } from '@solana/web3.js';
import { SolendMarket } from '@solendprotocol/solend-sdk';
import BN from 'bn.js';
import { ArbitrageSignal, TradeLog, ExecutorType } from './types';
import { pnlLogger } from './pnlLogger';
import { config } from './config';
import { buildExecuteSaleTransaction } from './marketplaceExecutor';

const connection = new Connection(config.rpcUrl, 'confirmed');
const payer = Keypair.fromSecretKey(Buffer.from(config.walletPrivateKey, 'base58'));

/**
 * Execute a single arbitrage signal using Solend flash loan
 * Combines flash loan + NFT sale into a single atomic transaction
 */
export async function executeFlashloanTrade(signal: ArbitrageSignal): Promise<TradeLog | null> {
  try {
    // 1️⃣ Initialize Solend market
    const market = await SolendMarket.initialize({
      connection,
      cluster: config.cluster || 'mainnet-beta',
    });

    // 2️⃣ Determine borrow amount (BN -> safe number in SOL)
    const borrowAmountSOL = Number(signal.targetListing.price.div(new BN(1e9)).toString());

    // 3️⃣ Execute flash loan
    const txSig = await market.flashLoan({
      amount: borrowAmountSOL,
      reserve: new PublicKey('So11111111111111111111111111111111111111112'), // WSOL
      receiver: payer.publicKey,
      callback: async (_conn, _keypair) => {
        // 4️⃣ Build NFT marketplace sale transaction
        const saleTx: Transaction = await buildExecuteSaleTransaction({
          connection,
          payerKeypair: payer,
          listing: signal.targetListing,
          bid: signal.targetBid,
        });

        // 5️⃣ Add sale transaction to flash loan atomic execution
        // Return the transaction for Solend to include and execute atomically
        return saleTx;
      },
    });

    // 6️⃣ Log trade via pnlLogger
    pnlLogger.logPnL(signal, txSig, 'executed');

    // 7️⃣ Return trade details
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
    await pnlLogger.logError(err, { signal });
    return null;
  }
}

/**
 * Execute multiple signals in **sequence** to avoid overlapping flash loans
 */
export async function executeBatch(signals: ArbitrageSignal[]): Promise<(TradeLog | null)[]> {
  const results: (TradeLog | null)[] = [];
  for (const signal of signals) {
    const trade = await executeFlashloanTrade(signal);
    results.push(trade);
  }
  return results;
}
