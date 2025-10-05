// autoFlashloanExecutor.ts
import { Connection, Keypair, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import { ArbitrageSignal, TradeLog } from './types';
import { executeSale } from './marketplaceInstructions';
import { pnlLogger } from './pnlLogger';
import { config } from './config';
import bs58 from 'bs58';
import { SolendMarket, SolendAction, SolendReserve } from '@solendprotocol/solend-sdk';

const connection = new Connection(config.rpcUrl, 'confirmed');
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

const MAX_CONCURRENT_TRADES = 2;

/**
 * Executes a single flashloan arbitrage trade.
 */
export async function executeFlashloanTrade(signal: ArbitrageSignal): Promise<TradeLog | null> {
  try {
    // 1️⃣ Initialize Solend market
    const market = await SolendMarket.initialize({ connection, cluster: 'mainnet-beta' });
    await market.loadReserves();

    // 2️⃣ Find SOL reserve
    const solReserve: SolendReserve | undefined = market.reserves.find(
      (r) => r.config.symbol === 'SOL'
    );
    if (!solReserve) throw new Error('SOL reserve not found');

    // 3️⃣ Calculate borrow amount including fee buffer
    const borrowAmount = signal.targetListing.price.add(config.feeBufferLamports);

    // 4️⃣ Pre-simulate sale to ensure it’s valid
    const simTx = await executeSale({
      connection,
      payerKeypair: payer,
      listing: signal.targetListing,
      bid: signal.targetBid,
    });

    const simTxSig = simTx.signature || simTx.response?.signature;
    if (!simTxSig) throw new Error('Simulation failed: sale transaction not valid');

    // 5️⃣ Build flashloan transaction manually
    const flashloanTx = new Transaction();

    const flashLoanIx = SolendAction.createFlashLoanInstruction({
      market,
      reserve: solReserve,
      amount: borrowAmount.toNumber() / 1e9, // convert lamports -> SOL
      receiver: payer.publicKey,
    });

    flashloanTx.add(flashLoanIx);

    // 6️⃣ Execute flashloan transaction
    // Note: Flashloan callback is executed here manually after borrow
    const txSig = await connection.sendTransaction(flashloanTx, [payer]);

    // 7️⃣ Execute NFT sale inside the same transaction context if needed
    await executeSale({
      connection,
      payerKeypair: payer,
      listing: signal.targetListing,
      bid: signal.targetBid,
    });

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
 * Executes multiple signals in batches.
 */
export async function executeBatch(signals: ArbitrageSignal[]): Promise<(TradeLog | null)[]> {
  const results: (TradeLog | null)[] = [];

  for (let i = 0; i < signals.length; i += MAX_CONCURRENT_TRADES) {
    const batch = signals.slice(i, i + MAX_CONCURRENT_TRADES);
    const batchResults = await Promise.all(batch.map((signal) => executeFlashloanTrade(signal)));
    results.push(...batchResults);
  }

  return results;
}
