import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { SolendAction, SolendMarket } from "@solendprotocol/solend-sdk";
import { ArbitrageSignal, TradeLog } from './types';
import { executeSale } from './marketplaceInstructions';
import { pnlLogger } from './pnlLogger';
import { config } from './config';
import BN from 'bn.js';
import bs58 from 'bs58';

const connection = new Connection(config.rpcUrl, 'confirmed');
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

const MAX_CONCURRENT_TRADES = config.maxConcurrentTrades;

export async function executeFlashloanTrade(signal: ArbitrageSignal): Promise<TradeLog | null> {
  try {
    pnlLogger.logMetrics({ message: `⚡ Executing flashloan for ${signal.targetListing.mint}` });

    // Initialize Solend market
    const market = await SolendMarket.initialize(connection, 'production');  // Fixed cluster
    await market.loadReserves();

    const solReserve = market.reserves.find(r => r.config.symbol === 'SOL');  // Fixed: symbol, no asset
    if (!solReserve) throw new Error('SOL reserve not found');

    const borrowAmount = signal.targetListing.price.add(config.feeBufferLamports);
    const borrowAmountSOL = borrowAmount.toNumber() / 1e9;

    pnlLogger.logMetrics({ message: `💰 Borrowing ${borrowAmountSOL.toFixed(3)} SOL from Solend...` });

    // Fixed: flashLoanTxns method, BigInt amount, typed callback
    const { transaction } = await SolendAction.flashLoanTxns({  // Fixed method name
      connection,
      market,
      payer,
      reserve: solReserve,
      amount: BigInt(borrowAmount.toString()),  // BigInt for precision
      callback: async (conn: Connection, keypair: Keypair) => {  // Typed params
        // Execute the NFT sale inside the flashloan
        return await executeSale({
          connection: conn,
          payerKeypair: keypair,
          listing: signal.targetListing,
          bid: signal.targetBid,
        });
      },
    });

    let txSig: string | undefined;
    if (!config.simulateOnly) {
      txSig = await sendAndConfirmTransaction(connection, transaction, [payer], {
        commitment: 'confirmed',
        maxRetries: 3,
      }).then(s => s);
    } else {
      txSig = `sim_tx_${Date.now()}`;
    }

    pnlLogger.logMetrics({ message: `🔗 Flashloan executed successfully: ${txSig}` });

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
