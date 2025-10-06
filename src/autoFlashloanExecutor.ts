import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { SolendAction, SolendMarket } from "@solendprotocol/solend-sdk";
import { ArbitrageSignal, TradeLog } from './types';
import { executeSale } from './marketplaceInstructions';
import { pnlLogger } from './pnlLogger';
import { config } from './config';
import BN from 'bn.js';
import bs58 from 'bs58';
import { flashBorrowReserveLiquidityInstruction } from './flashBorrowReserveLiquidity'; // Import the instruction builder

const connection = new Connection(config.rpcUrl, 'confirmed');
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

const MAX_CONCURRENT_TRADES = config.maxConcurrentTrades;

export async function executeFlashloanTrade(signal: ArbitrageSignal): Promise<TradeLog | null> {
  try {
    pnlLogger.logMetrics({ message: `⚡ Executing flashloan for ${signal.targetListing.mint}` });

    const market = await SolendMarket.initialize(connection, 'production');
    await market.loadReserves();

    const solReserve = market.reserves.find(r => r.config.symbol === 'SOL');
    if (!solReserve) throw new Error('SOL reserve not found');

    const borrowAmount = signal.targetListing.price.add(config.feeBufferLamports);
    const borrowAmountBN = new BN(borrowAmount.toString());

    pnlLogger.logMetrics({ message: `💰 Borrowing ${borrowAmountBN.toNumber() / 1e9} SOL from Solend...` });

    // Construct the flash loan instruction
    const flashLoanIx = flashBorrowReserveLiquidityInstruction(
      borrowAmountBN,
      solReserve.liquidity.mintPubkey, // sourceLiquidity (e.g., SOL mint)
      payer.publicKey, // destinationLiquidity (payer's token account for SOL)
      solReserve.reserveId, // reserve
      market.lendingMarket.address, // lendingMarket
      market.programId // lendingProgramId
    );

    const transaction = new Transaction().add(flashLoanIx);
    // Add your arbitrage logic here, which would include the executeSale instruction
    // For now, we'll just add a placeholder for the callback execution
    // In a real flash loan, the executeSale would be part of the same transaction
    // and would need to repay the flash loan within the same transaction.

    // This is a simplified representation. A real flash loan would require
    // a program that executes the arbitrage and repays the loan within a single transaction.
    // The `executeSale` would be part of that program's logic.

    // For demonstration, we'll simulate the sale here, but in a true flash loan
    // it must be atomic.
    const saleResult = await executeSale({
      connection: connection,
      payerKeypair: payer,
      listing: signal.targetListing,
      bid: signal.targetBid,
    });

    if (!saleResult) {
      throw new Error("NFT sale failed during flash loan execution.");
    }

    // In a real flash loan, the repayment instruction would also be part of the same transaction
    // as the flashLoanIx and the arbitrage logic.

    const txSig = await sendAndConfirmTransaction(connection, transaction, [payer]);
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
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Unknown error';
    pnlLogger.logPnL(signal, undefined, 'failed');
    pnlLogger.logError(new Error(errorMsg), { signal });
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
