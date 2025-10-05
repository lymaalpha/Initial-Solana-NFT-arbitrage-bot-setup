import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { SolendAction, SolendMarket } from "@solendprotocol/solend-sdk";
import { ArbitrageSignal, TradeLog } from "./types";  // Typed signal
import { buildExecuteSaleTransaction } from "./marketplaceInstructions";  // Real marketplace ixs
import { pnlLogger } from "./pnlLogger";  // Your logger
import { config } from "./config";
import BN from 'bn.js';
import bs58 from 'bs58';  // For base58 key decode (npm i bs58)

const connection = new Connection(config.rpcUrl, "confirmed");

// Keypair from base58 PRIVATE_KEY (fix from base64)
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

// ⚙️ Flash loan reserve (SOL)
const FLASHLOAN_RESERVE = new PublicKey("So11111111111111111111111111111111111111112");

async function executeMarketplaceArbitrage(signal: ArbitrageSignal): Promise<{ buySig?: string; sellSig?: string }> {
  // Build real sale tx via marketplace module
  const arbTx = await buildExecuteSaleTransaction({
    connection,
    payerKeypair: payer,
    listing: {
      mint: signal.targetListing.mint,
      price: signal.targetListing.price,
      auctionHouse: signal.targetListing.auctionHouse,
      sellerPubkey: signal.targetListing.sellerPubkey, // Optional
    },
    bid: {
      mint: signal.targetBid.mint,
      price: signal.targetBid.price,
      auctionHouse: signal.targetBid.auctionHouse,
      bidderPubkey: signal.targetBid.bidderPubkey, // Optional
    },
  });

  // Simulate before callback
  const simResult = await connection.simulateTransaction(arbTx);
  if (simResult.value.err) {
    throw new Error(`Simulation failed: ${simResult.value.err}`);
  }

  // Send the arb tx (in callback, this becomes part of flash loan)
  const txSig = await sendAndConfirmTransaction(connection, arbTx, [payer], {
    commitment: 'confirmed',
    maxRetries: 3,
  });

  pnlLogger.logInfo(`✅ Marketplace arb executed: ${txSig}`);
  return { buySig: txSig, sellSig: txSig };  // Single tx for atomicity
}

export async function executeFlashloanArbitrage(signal: ArbitrageSignal): Promise<TradeLog | null> {
  try {
    pnlLogger.logInfo(`⚡ Executing flashloan arbitrage for ${signal.targetListing.mint}`);
    const market = new SolendMarket({ 
      connection, 
      cluster: config.rpcUrl.includes("devnet") ? "devnet" : "mainnet" 
    });
    await market.loadReserves();

    const borrowAmountLamports = signal.targetListing.price.add(config.feeBufferLamports);
    const borrowAmountSOL = borrowAmountLamports.toNumber() / 1e9;

    pnlLogger.logInfo(`💰 Borrowing ${borrowAmountSOL.toFixed(3)} SOL from Solend...`);

    // Build Flash Loan Transaction
    const action = await SolendAction.buildFlashLoanTxns(
      connection,
      borrowAmountSOL,
      FLASHLOAN_RESERVE,
      payer.publicKey,
      async (conn, keypair) => {
        // Execute real marketplace arb in callback
        const { buySig, sellSig } = await executeMarketplaceArbitrage(signal);
        pnlLogger.logInfo(`✅ Buy TX: ${buySig} | Sell TX: ${sellSig}`);
      }
    );

    const tx = new Transaction().add(...action.txns);
    const txSig = await sendAndConfirmTransaction(connection, tx, [payer], {
      commitment: 'confirmed',
      maxRetries: 3,
    });

    pnlLogger.logInfo(`🔗 Flashloan executed successfully: ${txSig}`);

    const netProfit = signal.estimatedNetProfit;
    const tradeLog: TradeLog = {
      timestamp: Date.now(),
      mint: signal.targetListing.mint,
      buyPrice: signal.targetListing.price,
      sellPrice: signal.targetBid.price,
      netProfit,
      currency: signal.targetListing.currency,
      txSig,
      type: 'executed',
      notes: `Confidence: ${signal.confidence || 0.5}`,
      executorType: 'flash_loan',
    };

    await pnlLogger.logTrade(tradeLog);
    return tradeLog;
  } catch (err: any) {
    const errorMsg = err.message || 'Unknown error';
    pnlLogger.logError(new Error(errorMsg), { mint: signal.targetListing.mint });

    const tradeLog: TradeLog = {
      timestamp: Date.now(),
      mint: signal.targetListing.mint,
      buyPrice: signal.targetListing.price,
      sellPrice: signal.targetBid.price,
      netProfit: new BN(0),
      currency: signal.targetListing.currency,
      txSig: undefined,
      type: 'failed',
      notes: `Error: ${errorMsg}`,
      executorType: 'flash_loan',
    };

    await pnlLogger.logTrade(tradeLog);
    return null;
  }
}

// Batch support
export async function executeBatch(signals: ArbitrageSignal[]): Promise<TradeLog[]> {
  const trades: TradeLog[] = [];
  for (const signal of signals) {
    const trade = await executeFlashloanArbitrage(signal);
    if (trade) trades.push(trade);
    // Jitter delay
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
  }
  return trades;
}
