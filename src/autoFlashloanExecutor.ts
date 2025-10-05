import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { SolendAction, SolendMarket } from "@solendprotocol/solend-sdk";  // Updated SDK
import { ArbitrageSignal, TradeLog } from "./types";
import { buildExecuteSaleTransaction } from "./marketplaceInstructions";
import { pnlLogger } from "./pnlLogger";
import { config } from "./config";
import BN from "bn.js";
import bs58 from "bs58";

const connection = new Connection(config.rpcUrl, "confirmed");
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

const FLASHLOAN_RESERVE = new PublicKey("So11111111111111111111111111111111111111112");

async function executeMarketplaceArbitrage(signal: ArbitrageSignal): Promise<{ buySig?: string; sellSig?: string }> {
  const arbTx = await buildExecuteSaleTransaction({
    connection,
    payerKeypair: payer,
    listing: {
      mint: signal.targetListing.mint,
      price: signal.targetListing.price,
      auctionHouse: signal.targetListing.auctionHouse,
      sellerPubkey: signal.targetListing.sellerPubkey,
    },
    bid: {
      mint: signal.targetBid.mint,
      price: signal.targetBid.price,
      auctionHouse: signal.targetBid.auctionHouse,
      bidderPubkey: signal.targetBid.bidderPubkey,
    },
  });

  const simResult = await connection.simulateTransaction(arbTx);
  if (simResult.value.err) {
    throw new Error(`Simulation failed: ${simResult.value.err}`);
  }

  let txSig: string;
  if (!config.simulateOnly) {
    txSig = await sendAndConfirmTransaction(connection, arbTx, [payer], {
      commitment: "confirmed",
      maxRetries: 3,
    });
  } else {
    txSig = `sim_tx_${Date.now()}`;
  }

  pnlLogger.logInfo(`✅ Marketplace arb executed: ${txSig}`);
  return { buySig: txSig, sellSig: txSig };
}

export async function executeFlashloanArbitrage(signal: ArbitrageSignal): Promise<TradeLog | null> {
  try {
    pnlLogger.logInfo(`⚡ Executing flashloan arbitrage for ${signal.targetListing.mint}`);

    const market = new SolendMarket({ connection, cluster: "devnet" }); // updated class
    await market.loadReserves();

    const borrowAmountLamports = signal.targetListing.price.add(config.feeBufferLamports);
    const borrowAmountSOL = borrowAmountLamports.toNumber() / 1e9;

    pnlLogger.logInfo(`💰 Borrowing ${borrowAmountSOL.toFixed(3)} SOL from Solend...`);

    // Execute flash loan
    await SolendAction.flashLoan({
      connection,
      amount: borrowAmountSOL,
      reserve: FLASHLOAN_RESERVE,
      receiver: payer.publicKey,
      callback: async (conn: Connection, keypair: Keypair) => {
        pnlLogger.logInfo("💸 Flash loan received, executing marketplace trades...");
        const { buySig, sellSig } = await executeMarketplaceArbitrage(signal);
        pnlLogger.logInfo(`✅ Buy TX: ${buySig} | Sell TX: ${sellSig}`);
      },
    });

    pnlLogger.logInfo("🔗 Flashloan executed successfully.");

    const tradeLog: TradeLog = {
      timestamp: Date.now(),
      mint: signal.targetListing.mint,
      buyPrice: signal.targetListing.price,
      sellPrice: signal.targetBid.price,
      netProfit: signal.estimatedNetProfit,
      currency: signal.targetListing.currency,
      txSig: `flashloan_tx_${Date.now()}`,
      type: "executed",
      notes: `Confidence: ${signal.confidence || 0.5}`,
      executorType: "flash_loan",
    };

    await pnlLogger.logTrade(tradeLog);
    return tradeLog;

  } catch (err: any) {
    const errorMsg = err.message || "Unknown error";
    pnlLogger.logError(new Error(errorMsg), { mint: signal.targetListing.mint });

    const tradeLog: TradeLog = {
      timestamp: Date.now(),
      mint: signal.targetListing.mint,
      buyPrice: signal.targetListing.price,
      sellPrice: signal.targetBid.price,
      netProfit: new BN(0),
      currency: signal.targetListing.currency,
      txSig: undefined,
      type: "failed",
      notes: `Error: ${errorMsg}`,
      executorType: "flash_loan",
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
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000)); // avoid congestion
  }
  return trades;
}
