// src/main.ts (FINAL - WITH RATE-LIMITING FIX)
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "./config";
import { pnlLogger } from "./pnlLogger";
import { scanForArbitrage } from "./scanForArbitrage";
import { AutoFlashloanExecutor } from "./autoFlashloanExecutor";
import { ArbitrageSignal, NFTBid, NFTListing } from "./types";
import { sleep } from "./utils"; // Import the sleep function

// Import working marketplace APIs
import * as MagicEdenAPI from "./magicEdenMarketplace";
import * as RaribleAPI from "./raribleMarketplace";

const connection = new Connection(config.rpcUrl, "confirmed");
const wallet = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));
const executor = new AutoFlashloanExecutor(connection, wallet);

let cycleCount = 0;

const COLLECTIONS_CONFIG = [
  { name: "Mad Lads", magicEden: "mad_lads", rarible: "SOLANA:DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6WK3GChEySUpHSS4x" },
  { name: "Okay Bears", magicEden: "okay_bears", rarible: "SOLANA:BUjZjAS2vbbb65g7Z1Ca9ZRVYoJscURG5L3AkVvHP9ac" },
  { name: "DeGods", magicEden: "degods", rarible: "SOLANA:6XxjKYFbcndh2gDcsUrmZgVEsoDxXMnfsaGY6fpTJzNr" },
];

async function safeFetch<T>(fn: () => Promise<T[]>, source: string): Promise<T[]> {
  try { return await fn(); } catch (err) {
    pnlLogger.logError(err as Error, { message: `Fetch failed for ${source}` });
    return [];
  }
}

async function runBot() {
  pnlLogger.logMetrics({ message: "🚀 Arbitrage Bot Starting...", ...config });

  while (true) {
    cycleCount++;
    const allSignals: ArbitrageSignal[] = [];

    for (const collection of COLLECTIONS_CONFIG) {
      pnlLogger.logMetrics({ message: `🔍 Scanning ${collection.name}...` });

      const [meListings, raribleListings, meBids, raribleBids] = await Promise.all([
        safeFetch(() => MagicEdenAPI.fetchListings(collection.magicEden), "MagicEden"),
        safeFetch(() => RaribleAPI.fetchListings(collection.rarible), "Rarible"),
        safeFetch(() => MagicEdenAPI.fetchBids(collection.magicEden), "MagicEden"),
        safeFetch(() => RaribleAPI.fetchBids(collection.rarible), "Rarible"),
      ]);

      // ✅ ADD A DELAY HERE to be respectful of the APIs between collection fetches.
      await sleep(1000); // Wait 1 second before hitting the APIs for the next collection.

      const signals = await scanForArbitrage([...meListings, ...raribleListings], [...meBids, ...raribleBids]);
      if (signals.length > 0) allSignals.push(...signals);
    }

    if (allSignals.length > 0) {
      const topSignals = allSignals.sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber());
      pnlLogger.logMetrics({ message: `Executing top ${Math.min(topSignals.length, config.maxConcurrentTrades)} of ${allSignals.length} signals.` });
      await executor.executeTrades(topSignals, config);
    } else {
      pnlLogger.logMetrics({ message: "No profitable signals found." });
    }

    pnlLogger.logMetrics({ message: `⏳ Cycle ${cycleCount} complete. Waiting ${config.scanIntervalMs / 1000}s...` });
    await sleep(config.scanIntervalMs);
  }
}

runBot().catch(err => {
  pnlLogger.logError(err as Error, { message: "FATAL: Bot has crashed" });
  process.exit(1);
});
