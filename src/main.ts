// src/main.ts - FIXED IMPORTS AND TYPES
import { scanForArbitrage } from "./scanForArbitrage";
import { executeBatch } from "./autoFlashloanExecutor";
import { pnlLogger } from "./pnlLogger";
import { ArbitrageSignal, NFTBid, NFTListing, TradeLog, BotConfig } from "./types";
import BN from "bn.js";

// ✅ FIXED: Import individual functions
import { fetchListings as fetchMEListings, fetchBids as fetchMEBids } from "./magicEdenMarketplace";
import { fetchListings as fetchRaribleListings, fetchBids as fetchRaribleBids } from "./raribleMarketplace";

// ✅ Mock config (replace with real config.ts later)
const config: BotConfig = {
  simulateOnly: true,
  minProfitLamports: new BN(50000000), // 0.05 SOL
  maxConcurrentTrades: 3,
  scanIntervalMs: 30000 // 30 seconds
};

// ✅ Working marketplace APIs - now properly imported
const COLLECTIONS = [
  { name: "Mad Lads", magicEden: "mad_lads", rarible: "mad_lads" },
  { name: "Okay Bears", magicEden: "okay_bears", rarible: "okay_bears" },
  { name: "DeGods", magicEden: "degods", rarible: "degods" },
];

let totalProfit = 0;
let totalTrades = 0;
let cycleCount = 0;

// ✅ FIXED: Properly typed safeFetch function
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
      message: `✅ ${source} ${type} fetched`,
      collection,
      count: result.length,
      timeMs: Date.now() - start
    });
    return result;
  } catch (err: unknown) {
    pnlLogger.logError(err as Error, { 
      message: `❌ ${source} ${type} failed`, 
      collection 
    });
    return [];
  }
}

async function analyzeCollection(collection: { name: string; magicEden: string; rarible: string }): Promise<ArbitrageSignal[]> {
  try {
    console.log(`🔍 Scanning ${collection.name}...`);
    
    // ✅ FIXED: Use the properly imported functions
    const [meListings, raribleListings] = await Promise.all([
      safeFetch<NFTListing>(
        () => fetchMEListings(collection.magicEden), 
        "MagicEden", 
        collection.name, 
        "listings"
      ),
      safeFetch<NFTListing>(
        () => fetchRaribleListings(collection.rarible), 
        "Rarible", 
        collection.name, 
        "listings"
      ),
    ]);

    const [meBids, raribleBids] = await Promise.all([
      safeFetch<NFTBid>(
        () => fetchMEBids(collection.magicEden), 
        "MagicEden", 
        collection.name, 
        "bids"
      ),
      safeFetch<NFTBid>(
        () => fetchRaribleBids(collection.rarible), 
        "Rarible", 
        collection.name, 
        "bids"
      ),
    ]);

    console.log(`📊 ${collection.name}: ME=${meListings.length}L/${meBids.length}B | R=${raribleListings.length}L/${raribleBids.length}B`);

    const signals: ArbitrageSignal[] = [];

    // ✅ STRATEGY 1: Buy low on MagicEden, sell high on Rarible bids
    for (const meListing of meListings) {
      const raribleBid = raribleBids.find(b => b.mint === meListing.mint);
      if (raribleBid && raribleBid.price.gt(meListing.price)) {
        const profit = raribleBid.price.sub(meListing.price);
        const feeEstimate = meListing.price.muln(25).divn(1000); // 2.5%
        const netProfit = profit.sub(feeEstimate);
        
        if (netProfit.gt(config.minProfitLamports)) {
          signals.push({
            targetListing: meListing,
            targetBid: raribleBid,
            estimatedNetProfit: netProfit,
            estimatedGrossProfit: profit,
            strategy: 'ME→Rarible',
            marketplaceIn: 'MagicEden',
            marketplaceOut: 'Rarible'
          });
        }
      }
    }

    // ✅ STRATEGY 2: Buy low on Rarible, sell high on MagicEden bids
    for (const raribleListing of raribleListings) {
      const meBid = meBids.find(b => b.mint === raribleListing.mint);
      if (meBid && meBid.price.gt(raribleListing.price)) {
        const profit = meBid.price.sub(raribleListing.price);
        const feeEstimate = raribleListing.price.muln(30).divn(1000); // 3%
        const netProfit = profit.sub(feeEstimate);
        
        if (netProfit.gt(config.minProfitLamports)) {
          signals.push({
            targetListing: raribleListing,
            targetBid: meBid,
            estimatedNetProfit: netProfit,
            estimatedGrossProfit: profit,
            strategy: 'Rarible→ME',
            marketplaceIn: 'Rarible',
            marketplaceOut: 'MagicEden'
          });
        }
      }
    }

    // ✅ STRATEGY 3: Buy low listing, sell to high bid
    const allListings = [...meListings, ...raribleListings];
    const allBids = [...meBids, ...raribleBids];
    
    for (const listing of allListings) {
      const highBid = allBids.find(b => 
        b.mint === listing.mint && 
        b.price.gt(listing.price.add(listing.price.muln(40).divn(1000))) // Account for fees
      );
      
      if (highBid) {
        const profit = highBid.price.sub(listing.price);
        const feeEstimate = listing.price.muln(25).divn(1000); // 2.5% buy fee
        const netProfit = profit.sub(feeEstimate);
        
        if (netProfit.gt(config.minProfitLamports)) {
          signals.push({
            targetListing: listing,
            targetBid: highBid,
            estimatedNetProfit: netProfit,
            estimatedGrossProfit: profit,
            strategy: 'Listing→Bid Arb',
            marketplaceIn: listing.auctionHouse,
            marketplaceOut: highBid.auctionHouse
          });
        }
      }
    }

    pnlLogger.logMetrics({
      message: `🎯 ${collection.name} signals`,
      signals: signals.length,
      totalListings: allListings.length,
      totalBids: allBids.length
    });

    return signals;

  } catch (err: unknown) {
    pnlLogger.logError(err as Error, { message: `Error analyzing ${collection.name}` });
    return [];
  }
}

// ... rest of your main.ts file remains the same ...
