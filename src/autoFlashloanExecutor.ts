// autoFlashloanExecutor.ts
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { SolendMarket } from '@solendprotocol/solend-sdk';
import BN from 'bn.js';
import { ArbitrageSignal, TradeLog } from './types';
import { pnlLogger } from './pnlLogger';
import { config } from './config';
import { buildExecuteSaleTransaction } from './marketplaceInstructions';
import bs58 from 'bs58';

const connection = new Connection(config.rpcUrl, 'confirmed');
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

/**
 * Executes a single arbitrage signal using a Solend flash loan
 */
export async function executeFlashloanTrade(signal: ArbitrageSignal): Promise<TradeLog | null> {
  try {
    // 1️⃣ Initialize Solend market
    const market = await SolendMarket.initialize({
      connection,
      cluster: 'mainnet-beta', // live
    });

    const borrowAmountSOL = signal.targetListing.price.toNumber() / 1e9;

    let txSig: string | undefined;

    // 2️⃣ Execute flash loan
    await market.flashLoan({
      amount: borrowAmountSOL,
      reserve: 'So11111111111111111111111111111111111111112', // WSOL
      receiver: payer.publicKey,
      callback: async (_conn, _keypair) => {
        // 3️⃣ Build marketplace transaction
        const tx: Transaction = await buildExecuteSaleTransaction({
          connection,
          payerKeypair: payer,
          listing: signal.targetListing,
          bid: signal.targetBid,
        });

        // 4️⃣ Send transaction
        txSig = await connection.sendTransaction(tx, [payer], {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        // 5️⃣ Log executed trade
        pnlLogger.logPnL(signal, txSig, 'executed');

        return txSig;
      },
    });

    // 6️⃣ Return trade info for bot stats
    return {
      timestamp: Date.now(),
      mint: signal.targetListing.mint,
      buyPrice: signal.targetListing.price,
      sellPrice: signal.targetBid.price,
      netProfit: signal.estimatedNetProfit,
      currency: signal.targetListing.currency,
      txSig,
      type: 'executed',
    };
  } catch (err: any) {
    pnlLogger.logPnL(signal, undefined, 'failed');
    await pnlLogger.logError(err, { signal });
    return null;
  }
}

/**
 * Execute multiple signals in batch, sequentially to reduce risks
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
