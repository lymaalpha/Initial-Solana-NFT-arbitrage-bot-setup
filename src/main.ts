// src/main.ts (FINAL - Based on your working logic)
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "./config";
import { pnlLogger } from "./pnlLogger";
import { scanForArbitrage } from "./scanForArbitrage";
import { AutoFlashloanExecutor } from "./autoFlashloanExecutor";
import { ArbitrageSignal, NFTBid, NFTListing } from "./types";

// Import the working marketplace APIs
import * as MagicEdenAPI from "./magicEdenMarketplace";
import * as RaribleAPI from "./raribleMarketplace"; // Using your new file

// Initialize Connection and Wallet from your central config
const connection = new Connection(config.rpcUrl, "confirmed");
const wallet = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));
const executor = new AutoFlashloanExecutor(connection, wallet);

let cycleCount = 0;

// This now needs to be defined to match the structure your main.ts expects
// We will need a mapping from a generic collection name to the specific IDs
// each marketplace uses. This should be managed in your .env or a separate mapping file.
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
    ...config
  });

  while (true) {
    cycleCount++;
    const allSignals: ArbitrageSignal[] = [];

    for (const collection of COLLECTIONS_CONFIG) {
      pnlLogger.logMetrics({ message: `🔍 Scanning ${collection.name}...` });

      const [meListings, raribleListings, meBids, raribleBids] = await Promise.all([
        safeFetch<NFTListing>(() => MagicEdenAPI.fetchListings(collection.magicEden), "MagicEden", collection.name),
        safeFetch<NFTListing>(() => RaribleAPI.fetchListings(collection.rarible), "Rarible", collection.name),
        safeFetch<NFTBid>(() => MagicEdenAPI.fetchBids(collection.magicEden), "MagicEden", collection.name),
        safeFetch<NFTBid>(() => RaribleAPI.fetchBids(collection.rarible), "Rarible", collection.name),
      ]);

      const listings = [...meListings, ...raribleListings];
      const bids = [...meBids, ...raribleBids];

      if (listings.length > 0 || bids.length > 0) {
        pnlLogger.logMetrics({
            message: `📊 Data collected for ${collection.name}`,
            magicEden: `${meListings.length}L / ${meBids.length}B`,
            rarible: `${raribleListings.length}L / ${raribleBids.length}B`,
        });
        const signals = await scanForArbitrage(listings, bids);
        allSignals.push(...signals);
      }
    }

    if (allSignals.length > 0) {
      const topSignals = allSignals
        .sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber())
        .slice(0, config.maxConcurrentTrades);

      pnlLogger.logMetrics({ message: `Executing top ${topSignals.length} signals...` });
      await executor.executeTrades(topSignals, config);
    } else {
      pnlLogger.logMetrics({ message: "No signals found in this cycle." });
    }

    pnlLogger.logMetrics({ message: `⏳ Cycle ${cycleCount} complete. Waiting ${config.scanIntervalMs / 1000}s...` });
    await new Promise(resolve => setTimeout(resolve, config.scanIntervalMs));
  }
}

runBot().catch(err => {
  pnlLogger.logError(err as Error, { message: "FATAL: Bot has crashed" });
  process.exit(1);
});
