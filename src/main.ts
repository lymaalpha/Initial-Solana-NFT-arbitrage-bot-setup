// src/main.ts (FINAL - CORRECT IMPORT SYNTAX)
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "./config";
import { pnlLogger } from "./pnlLogger";
import { scanForArbitrage } from "./scanForArbitrage";
import { AutoFlashloanExecutor } from "./autoFlashloanExecutor";
import { ArbitrageSignal, NFTBid, NFTListing } from "./types";
import { sleep } from "./utils";

// CORRECTED IMPORT SYNTAX FOR FILES WITH A DEFAULT EXPORT
import MagicEdenAPI from "./magicEdenMarketplace";
import RaribleAPI from "./raribleMarketplace";

const connection = new Connection(config.rpcUrl, "confirmed");
const wallet = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));
const executor = new AutoFlashloanExecutor(connection, wallet);

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
  let cycleCount = 0;

  while (true) {
    cycleCount++;
    const allSignals: ArbitrageSignal[] = [];

    for (const collection of COLLECTIONS_CONFIG) {
      pnlLogger.logMetrics({ message: `🔍 Scanning ${collection.name}...` });

      const results = await Promise.allSettled([
        safeFetch(() => MagicEdenAPI.fetchListings(collection.magicEden), "MagicEden"),
        safeFetch(() => RaribleAPI.fetchListings(collection.rarible), "Rarible"),
        safeFetch(() => MagicEdenAPI.fetchBids(collection.magicEden), "MagicEden"),
        safeFetch(() => RaribleAPI.fetchBids(collection.rarible), "Rarible"),
      ]);

      await sleep(1000);

      const meListings: NFTListing[] = results[0].status === 'fulfilled' ? results[0].value as NFTListing[] : [];
      const raribleListings: NFTListing[] = results[1].status === 'fulfilled' ? results[1].value as NFTListing[] : [];
      const meBids: NFTBid[] = results[2].status === 'fulfilled' ? results[2].value as NFTBid[] : [];
      const raribleBids: NFTBid[] = results[3].status === 'fulfilled' ? results[3].value as NFTBid[] : [];

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
