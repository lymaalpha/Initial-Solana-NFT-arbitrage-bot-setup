// src/main.ts (FINAL - Based on your working ME + Rarible logic)
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "./config";
import { pnlLogger } from "./pnlLogger";
import { scanForArbitrage } from "./scanForArbitrage";
import { AutoFlashloanExecutor } from "./autoFlashloanExecutor";
import { ArbitrageSignal, NFTBid, NFTListing } from "./types";

// Import the working marketplace APIs you provided
import * as MagicEdenAPI from "./magicEdenMarketplace";
import * as RaribleAPI from "./raribleMarketplace";

// Initialize Connection and Wallet from your central config
const connection = new Connection(config.rpcUrl, "confirmed");
const wallet = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));
const executor = new AutoFlashloanExecutor(connection, wallet);

let cycleCount = 0;

// This mapping is crucial. It connects the generic collection name
// to the specific ID each marketplace uses.
// NOTE: I've used Rarible's standard format for Solana collections.
const COLLECTIONS_CONFIG = [
  { name: "Mad Lads", magicEden: "mad_lads", rarible: "SOLANA:DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6WK3GChEySUpHSS4x" },
  { name: "Okay Bears", magicEden: "okay_bears", rarible: "SOLANA:BUjZjAS2vbbb65g7Z1Ca9ZRVYoJscURG5L3AkVvHP9ac" },
  { name: "DeGods", magicEden: "degods", rarible: "SOLANA:6XxjKYFbcndh2gDcsUrmZgVEsoDxXMnfsaGY6fpTJzNr" },
];

async function safeFetch<T>(
  fn: () => Promise<T[]>,
  source: string,
  collection: string
): Promise<T[]> {
  try {
    const result = await fn();
    return result;
  } catch (err: unknown) {
    pnlLogger.logError(err as Error, {
      message: `❌ ${source} fetch failed`,
      collection,
    });
    return [];
  }
}

async function runBot() {
  pnlLogger.logMetrics({
    message: "🚀 Arbitrage Bot Starting...",
    collections: COLLECTIONS_CONFIG.map(c => c.name),
    marketplaces: ["MagicEden", "Rarible"],
    simulateOnly: config.simulateOnly,
    minProfitSOL: config.minProfitLamports.toNumber() / 1e9,
  });

  while (true) {
    cycleCount++;
    const allSignals: ArbitrageSignal[] = [];

    for (const collection of COLLECTIONS_CONFIG) {
      pnlLogger.logMetrics({ message: `🔍 Scanning ${collection.name}...` });

      // Fetch all data in parallel for maximum efficiency
      const [meListings, raribleListings, meBids, raribleBids] = await Promise.all([
        safeFetch<NFTListing>(() => MagicEdenAPI.fetchListings(collection.magicEden), "MagicEden", collection.name),
        safeFetch<NFTListing>(() => RaribleAPI.fetchListings(collection.rarible), "Rarible", collection.name),
        safeFetch<NFTBid>(() => MagicEdenAPI.fetchBids(collection.magicEden), "MagicEden", collection.name),
        safeFetch<NFTBid>(() => RaribleAPI.fetchBids(collection.rarible), "Rarible", collection.name),
      ]);

      const allListings = [...meListings, ...raribleListings];
      const allBids = [...meBids, ...raribleBids];

      if (allListings.length > 0 || allBids.length > 0) {
        pnlLogger.logMetrics({
            message: `📊 Data collected for ${collection.name}`,
            magicEden: `${meListings.length}L / ${meBids.length}B`,
            rarible: `${raribleListings.length}L / ${raribleBids.length}B`,
        });

        // Use your new, powerful scanForArbitrage logic
        const signals = await scanForArbitrage(allListings, allBids);
        if (signals.length > 0) {
          allSignals.push(...signals);
        }
      }
    }

    if (allSignals.length > 0) {
      // Sort and filter top signals
      const topSignals = allSignals
        .sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber())
        .slice(0, config.maxConcurrentTrades);

      pnlLogger.logMetrics({ message: `Executing top ${topSignals.length} of ${allSignals.length} found signals...` });
      await executor.executeTrades(topSignals, config); // Using the corrected executor
    } else {
      pnlLogger.logMetrics({ message: "No profitable signals found in this cycle." });
    }

    pnlLogger.logMetrics({ message: `⏳ Cycle ${cycleCount} complete. Waiting ${config.scanIntervalMs / 1000}s...` });
    await new Promise(resolve => setTimeout(resolve, config.scanIntervalMs));
  }
}

runBot().catch(err => {
  pnlLogger.logError(err as Error, { message: "FATAL: Bot has crashed" });
  process.exit(1);
});
