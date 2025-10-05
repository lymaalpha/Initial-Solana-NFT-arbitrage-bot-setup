// main.ts
import { Connection, Keypair } from "@solana/web3.js";
import { scanForArbitrage } from "./scanForArbitrage";
import { executeBatch } from "./autoFlashloanExecutor";
import { pnlLogger } from "./pnlLogger";
import { config } from "./config";
import { ArbitrageSignal } from "./types";
import axios from "axios";
import BN from "bn.js";
import bs58 from "bs58";

// Initialize Solana connection and payer
const connection = new Connection(config.rpcUrl, "confirmed");
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

// Runtime settings
const SCAN_INTERVAL_MS = config.scanIntervalMs;
const MAX_CONCURRENT_TRADES = 2; // ⚠️ Safe concurrent trades for flashloans

// Bot stats
interface BotStats {
  totalProfitLamports: BN;
  totalTrades: number;
  lastScan: number;
}
const botStats: BotStats = {
  totalProfitLamports: new BN(0),
  totalTrades: 0,
  lastScan: 0,
};

// Load collections (stub)
async function loadActiveOpportunities(): Promise<string[]> {
  return [config.collectionMint];
}

// Update trade results (stub for persistent logging)
async function updateTradeResult(mint: string, result: any): Promise<void> {
  pnlLogger.logMetrics({ updatedMint: mint, result });
}

// Fetch listings from Magic Eden
async function fetchListings(collectionMint: string) {
  try {
    const resp = await axios.get(
      `https://api-mainnet.magiceden.dev/v2/collections/${collectionMint}/listings?offset=0&limit=50`
    );
    return resp.data.map((item: any) => ({
      mint: item.tokenMint,
      auctionHouse: "MagicEden",
      price: new BN(item.price * 1e9), // Convert SOL -> lamports
      assetMint: "So11111111111111111111111111111111111111112",
      currency: "SOL",
      timestamp: Date.now(),
      sellerPubkey: item.seller,
    }));
  } catch (err) {
    pnlLogger.logError(err as Error, { collectionMint });
    return [];
  }
}

// Fetch bids from Tensor
async function fetchBids(collectionMint: string) {
  try {
    const resp = await axios.get(
      `https://api.tensor.trade/v1/collections/${collectionMint}/bids?limit=50`
    );
    return resp.data.map((item: any) => ({
      mint: item.mint,
      auctionHouse: "Tensor",
      price: new BN(item.price * 1e9), // Convert SOL -> lamports
      assetMint: "So11111111111111111111111111111111111111112",
      currency: "SOL",
      timestamp: Date.now(),
      bidderPubkey: item.buyer,
    }));
  } catch (err) {
    pnlLogger.logError(err as Error, { collectionMint });
    return [];
  }
}

// Main bot loop
async function runBot() {
  pnlLogger.logMetrics({ message: "🚀 Flashloan Arbitrage Bot starting..." });

  while (true) {
    const cycleStart = Date.now();
    try {
      const opportunities = await loadActiveOpportunities();
      let signals: ArbitrageSignal[] = [];

      for (const collectionMint of opportunities) {
        const listings = await fetchListings(collectionMint);
        const bids = await fetchBids(collectionMint);

        const cycleSignals = await scanForArbitrage(listings, bids, {
          minProfit: config.minProfitLamports,
          feeAdjustment: config.feeBufferLamports,
        });

        signals = signals.concat(cycleSignals);
      }

      if (!signals.length) {
        pnlLogger.logMetrics({ message: "⚠️ No arbitrage opportunities found." });
      } else {
        const topSignals = signals
          .filter((s) => s.estimatedNetProfit.gt(new BN(0)))
          .sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber())
          .slice(0, MAX_CONCURRENT_TRADES);

        for (const signal of topSignals) {
          try {
            pnlLogger.logMetrics({ message: `🚀 Executing trade for ${signal.targetListing.mint}` });
            const [trade] = await executeBatch([signal]);

            if (trade) {
              botStats.totalTrades++;
              botStats.totalProfitLamports = botStats.totalProfitLamports.add(trade.netProfit);
              await updateTradeResult(trade.mint, trade);

              pnlLogger.logMetrics({
                message: `💰 Trade complete | +${trade.netProfit.toNumber() / 1e9} SOL | Total: ${
                  botStats.totalProfitLamports.toNumber() / 1e9
                } SOL`,
                trade,
              });
            }
          } catch (tradeErr: any) {
            pnlLogger.logError(tradeErr, { signal, message: "Trade execution failed" });
          }
        }
      }

      botStats.lastScan = Date.now();
      pnlLogger.logMetrics({
        message: "📈 Scan cycle complete",
        cycleTimeSec: (Date.now() - cycleStart) / 1000,
        totalTrades: botStats.totalTrades,
        totalProfitSOL: botStats.totalProfitLamports.toNumber() / 1e9,
        signalsFound: signals.length,
      });
    } catch (err: any) {
      pnlLogger.logError(err, { cycle: "main loop" });
    }

    await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
  }
}

// Graceful shutdown
process.on("SIGINT", () => {
  pnlLogger.logMetrics({
    message: `Shutting down | Trades: ${botStats.totalTrades} | Profit: ${
      botStats.totalProfitLamports.toNumber() / 1e9
    } SOL`,
    finalStats: botStats,
  });
  pnlLogger.close();
  process.exit(0);
});

runBot().catch((err) => {
  pnlLogger.logError(err);
  process.exit(1);
});
