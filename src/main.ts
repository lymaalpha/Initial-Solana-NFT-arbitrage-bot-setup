// src/main.ts - ✅ SIMPLIFIED: MagicEden + Rarible
import { scanForArbitrage } from "./scanForArbitrage";
import { executeBatch } from "./autoFlashloanExecutor";
import { pnlLogger } from "./pnlLogger";
import { ArbitrageSignal, NFTBid, NFTListing } from "./types";
import { config } from "./config";
import BN from "bn.js";

// ✅ Keep working APIs
import * as MagicEdenAPI from "./magicEdenMarketplace";
import * as RaribleAPI from "./raribleMarketplace";

let totalProfit = 0;
let totalTrades = 0;
let cycleCount = 0;

const COLLECTIONS = [
  { name: "Mad Lads", magicEden: "mad_lads", rarible: "DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6WK3GChEySUpHSS4x" },
  { name: "Okay Bears", magicEden: "okay_bears", rarible: "BUjZjAS2vbbb65g7Z1Ca9ZRVYoJscURG5L3AkVvHP9ac" },
  { name: "DeGods", magicEden: "degods-club", rarible: "6XxjKYFbcndh2gDcsUrmZgVEsoDxXMnfsaGY6fpTJzNr" },
];

async function safeFetch<T>(
  fn: () => Promise<T[]>,
  source: string,
  collection: string,
  type: string
): Promise<T[]> {
  const start = Date.now();
  try {
    const result = await fn();
    pnlLogger.logMetrics({
      message: `✅ ${source} ${type} fetched for ${collection}`,
      count: result.length,
      timeMs: Date.now() - start,
    });
    return result;
  } catch (err: unknown) {
    const error = err as Error;
    pnlLogger.logError(error, { message: `❌ ${source} ${type} failed for ${collection}` });
    return [];
  }
}

async function runBot() {
  pnlLogger.logMetrics({
    message: "🚀 Simplified Arbitrage Bot: MagicEden + Rarible ONLY",
    simulateOnly: config.simulateOnly,
  });

  while (true) {
    cycleCount++;
    const start = Date.now();
    let allSignals: ArbitrageSignal[] = [];
    let totalItems = 0;

    for (const c of COLLECTIONS) {
      try {
        // ✅ Explicit type-casts fix unknown[] errors
        const [meListings, raribleListings] = await Promise.all([
          safeFetch<NFTListing>(() => MagicEdenAPI.fetchListings(c.magicEden), "MagicEden", c.name, "listings"),
          safeFetch<NFTListing>(() => RaribleAPI.fetchListings(c.rarible), "Rarible", c.name, "listings"),
        ]);

        const [meBids, raribleBids] = await Promise.all([
          safeFetch<NFTBid>(() => MagicEdenAPI.fetchBids(c.magicEden), "MagicEden", c.name, "bids"),
          safeFetch<NFTBid>(() => RaribleAPI.fetchBids(c.rarible), "Rarible", c.name, "bids"),
        ]);

        const allListings: NFTListing[] = [...meListings, ...raribleListings];
        const allBids: NFTBid[] = [...meBids, ...raribleBids];
        totalItems += allListings.length + allBids.length;

        pnlLogger.logMetrics({
          message: `📊 ${c.name} summary`,
          listings: allListings.length,
          bids: allBids.length,
        });

        if (allListings.length && allBids.length) {
          const signals = await scanForArbitrage(allListings, allBids);
          allSignals = allSignals.concat(signals);
        }
      } catch (err: unknown) {
        const error = err as Error;
        pnlLogger.logError(error, { message: `Error on ${c.name}` });
      }
    }

    if (allSignals.length > 0) {
      pnlLogger.logMetrics({ message: `🎯 Found ${allSignals.length} arbitrage signals` });

      const profitable = allSignals
        .filter((s) => s.estimatedNetProfit.gt(config.minProfitLamports))
        .sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber())
        .slice(0, config.maxConcurrentTrades);

      for (const sig of profitable) {
        const profit = sig.estimatedNetProfit.toNumber() / 1e9;
        pnlLogger.logMetrics({
          message: `💰 ${sig.targetListing.auctionHouse} → ${sig.targetBid.auctionHouse}`,
          profitSOL: profit,
        });
      }

      if (!config.simulateOnly) {
        const trades = await executeBatch(profitable);
        trades.forEach((t) => {
          if (t) {
            totalTrades++;
            const p = t.netProfit.toNumber() / 1e9;
            totalProfit += p;
          }
        });
      }
    } else {
      pnlLogger.logMetrics({ message: "⚠️ No arbitrage opportunities this cycle." });
    }

    pnlLogger.logMetrics({
      message: "✅ Cycle complete",
      cycle: cycleCount,
      time: (Date.now() - start) / 1000,
      totalProfit,
    });

    await new Promise((r) => setTimeout(r, config.scanIntervalMs));
  }
}

process.on("SIGINT", () => {
  pnlLogger.logMetrics({
    message: `🛑 Shutdown: ${totalTrades} trades | ${totalProfit.toFixed(3)} SOL total`,
  });
  process.exit(0);
});

runBot().catch((e: unknown) => {
  const error = e as Error;
  pnlLogger.logError(error, { message: "Fatal error starting bot" });
  process.exit(1);
});
