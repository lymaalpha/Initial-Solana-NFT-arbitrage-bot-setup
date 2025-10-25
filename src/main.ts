// src/main.ts (VICTORY LAP - VERIFIED IDs )
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "./config";
import { pnlLogger } from "./pnlLogger";
import { AutoFlashloanExecutor } from "./autoFlashloanExecutor";
import { ArbitrageSignal, NFTBid, NFTListing, AuctionHouse } from "./types";
import { fetchListings as fetchMEListings, fetchBids as fetchMEBids } from "./magicEdenMarketplace";
import { fetchListings as fetchRaribleListings, fetchBids as fetchRaribleBids } from "./raribleMarketplace";
import { scanForArbitrage } from "./scanForArbitrage";
import { sleep } from "./utils";

const connection = new Connection(config.rpcUrl, "confirmed");
const wallet = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));
const executor = new AutoFlashloanExecutor(connection, wallet);

// ✅ VERIFIED, WORKING COLLECTION IDs
const COLLECTIONS_CONFIG = [
    { name: "Mad Lads", magicEden: "mad_lads", rarible: "SOLANA:DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6WK3GChEySUpHSS4x" },
    { name: "Okay Bears", magicEden: "okay_bears", rarible: "SOLANA:BUjZjAS2vbbb65g7Z1Ca9ZRVYoJscURG5L3AkVvHP9ac" },
    // { name: "DeGods", magicEden: "degods", rarible: "SOLANA:6XxjKYFbcndh2gDcsUrmZgVEsoDxXMnfsaGY6fpTJzNr" }, // Temporarily disabled to ensure a clean run
];

let totalProfit = 0;
let totalTrades = 0;
let cycleCount = 0;

async function safeFetch<T>(fn: () => Promise<T[]>, source: string): Promise<T[]> {
    try {
        const result = await fn();
        pnlLogger.logMetrics({ message: `✅ ${source} fetch successful`, count: result.length });
        return result;
    } catch (err) {
        pnlLogger.logError(err as Error, { message: `❌ Fetch failed for ${source}` });
        return [];
    }
}

async function runBot() {
    pnlLogger.logMetrics({ message: "🚀 Arbitrage Bot Starting...", ...config });

    while (true) {
        cycleCount++;
        const cycleStart = Date.now();
        let allSignals: ArbitrageSignal[] = [];

        try {
            pnlLogger.logMetrics({ message: `\n🔄 CYCLE ${cycleCount} STARTED at ${new Date().toLocaleTimeString()}` });

            for (const collection of COLLECTIONS_CONFIG) {
                pnlLogger.logMetrics({ message: `🔍 Scanning ${collection.name}...` });

                const [meListings, meBids] = await Promise.all([
                    safeFetch(() => fetchMEListings(collection.magicEden), "MagicEden"),
                    safeFetch(() => fetchMEBids(collection.magicEden), "MagicEden"),
                ]);
                
                await sleep(1000); 

                const [raribleListings, raribleBids] = await Promise.all([
                    safeFetch(() => fetchRaribleListings(collection.rarible), "Rarible"),
                    safeFetch(() => fetchRaribleBids(collection.rarible), "Rarible"),
                ]);

                const listings: NFTListing[] = [...meListings, ...raribleListings];
                const bids: NFTBid[] = [...meBids, ...raribleBids];
                
                if (listings.length > 0 && bids.length > 0) {
                    const signals = await scanForArbitrage(listings, bids);
                    if (signals.length > 0) allSignals.push(...signals);
                }
            }

            pnlLogger.logMetrics({ message: `\n📡 CYCLE ${cycleCount} SUMMARY:` });
            if (allSignals.length > 0) {
                const topSignals = allSignals.sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber());
                pnlLogger.logMetrics({ message: `🎯 Found ${allSignals.length} total signals. Executing top ${Math.min(topSignals.length, config.maxConcurrentTrades)}.` });
                await executor.executeTrades(topSignals, config);
            } else {
                pnlLogger.logMetrics({ message: "No profitable signals found in this cycle." });
            }

            const cycleTime = Date.now() - cycleStart;
            const waitTime = Math.max(1000, config.scanIntervalMs - cycleTime);
            pnlLogger.logMetrics({ message: `⏱️  CYCLE ${cycleCount} COMPLETED in ${cycleTime}ms. Waiting ${waitTime / 1000}s...` });
            await sleep(waitTime);

        } catch (err: any) {
            pnlLogger.logError(err, { message: `💥 CYCLE ${cycleCount} FAILED:` });
            await sleep(10000);
        }
    }
}

runBot().catch(err => {
    pnlLogger.logError(err as Error, { message: "FATAL: Bot has crashed" });
    process.exit(1);
});
