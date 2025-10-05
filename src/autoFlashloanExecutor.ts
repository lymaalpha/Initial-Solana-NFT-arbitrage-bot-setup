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
    const market = await SolendMarket.initialize({
      connection,
      cluster: 'mainnet-beta',
    });

    const borrowAmountSOL = signal.targetListing.price.toNumber() / 1e9;

    let txSig: string | undefined;

    await market.flashLoan({
      amount: borrowAmountSOL,
      reserve: 'So11111111111111111111111111111111111111112',
      receiver: payer.publicKey,
      callback: async (_conn, _keypair) => {
        const tx: Transaction = await buildExecuteSaleTransaction({
          connection,
          payerKeypair: payer,
          listing: signal.targetListing,
          bid: signal.targetBid,
        });

        // Send transaction
        txSig = await connection.sendTransaction(tx, [payer], {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        // Log executed trade
        pnlLogger.logPnL(signal, txSig, 'executed');

        return tx; // Return transaction object for Solend callback
      },
    });

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
 * Execute multiple signals sequentially (batch)
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
