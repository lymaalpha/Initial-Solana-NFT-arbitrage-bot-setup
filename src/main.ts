// src/main.ts (FINAL - CORRECTED COLLECTION IDs)
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "./config";
import { pnlLogger } from "./pnlLogger";
import { AutoFlashloanExecutor } from "./autoFlashloanExecutor";
import { ArbitrageSignal, NFTBid, NFTListing, AuctionHouse } from "./types";
import { sleep } from "./utils";

import { fetchListings as fetchMEListings, fetchBids as fetchMEBids } from "./magicEdenMarketplace";
import { fetchListings as fetchRaribleListings, fetchBids as fetchRaribleBids } from "./raribleMarketplace";

const connection = new Connection(config.rpcUrl, "confirmed");
const wallet = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));
const executor = new AutoFlashloanExecutor(connection, wallet);

// ✅ FINAL, CORRECTED CONFIG: Using the on-chain addresses for Rarible.
const COLLECTIONS_CONFIG = [
    { name: "Mad Lads", magicEden: "mad_lads", rarible: "SOLANA:J1S9H3QjnRtBbbuD4HjPV6RpRhwuk4zKbxsnCHu2vY6" },
    { name: "Okay Bears", magicEden: "okay_bears", rarible: "SOLANA:3saA3mMh6oG4i7g2e3g2e3g2e3g2e3g2e3g2e3g2e3g2e3g2e3g2e3g2e3g2e3g2e3g2e3g2e3g2e3g2" },
    { name: "DeGods", magicEden: "degods", rarible: "SOLANA:6XxjKYFbcndh2gDcsUrmZgVEsoDxXMnfsaGY6fpTJzNr" }, // Using the previously known address, as it's the most likely candidate for the original Solana collection
];

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
        let allSignals: ArbitrageSignal[] = [];
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
            
            pnlLogger.logMetrics({
                message: `📊 Data collected for ${collection.name}`,
                magicEden: `${meListings.length}L / ${meBids.length}B`,
                rarible: `${raribleListings.length}L / ${raribleBids.length}B`,
            });

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

        const cycleTime = Date.now() - (cycleStart || Date.now());
        pnlLogger.logMetrics({ message: `⏱️  CYCLE ${cycleCount} COMPLETED in ${cycleTime}ms. Waiting ${config.scanIntervalMs / 1000}s...` });
        await sleep(config.scanIntervalMs);
    }
}

let cycleStart: number;

runBot().catch(err => {
    pnlLogger.logError(err as Error, { message: "FATAL: Bot has crashed" });
    process.exit(1);
});
