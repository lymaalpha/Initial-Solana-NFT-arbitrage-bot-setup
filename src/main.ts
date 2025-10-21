// src/main.ts - 🚀 OPTIMIZED: MagicEden + Rarible Arbitrage Bot
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

// **FIX 1: Updated collections with correct identifiers**
const COLLECTIONS = [
  { 
    name: "Mad Lads", 
    magicEden: "mad_lads",  // ✅ ME slug
    rarible: "MadLads"      // ✅ Rarible collection name/symbol
  },
  { 
    name: "Okay Bears", 
    magicEden: "okay_bears", 
    rarible: "Okay Bears"   // ✅ Rarible collection name
  },
  { 
    name: "DeGods", 
    magicEden: "degods-club", 
    rarible: "DeGods"       // ✅ Rarible collection name
  },
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
    const timeMs = Date.now() - start;
    
    // **FIX 2: Detailed logging for debugging**
    pnlLogger.logMetrics({
      message: `✅ ${source} ${type} fetched`,
      collection,
      count: result.length,
      timeMs,
      samplePrice: result.length > 0 ? (result[0] as any)?.price?.toString() : 'N/A'
    });
    
    return result;
  } catch (err: unknown) {
    const error = err as Error;
    pnlLogger.logError(error, { 
      message: `❌ ${source} ${type} failed`, 
      collection,
      error: error.message 
    });
    return [];
  }
}

// **FIX 3: Enhanced arbitrage detection with cross-marketplace logic**
async function analyzeCollection(collection: { name: string; magicEden: string; rarible: string }) {
  try {
    console.log(`🔍 Scanning ${collection.name}...`);
    
    // Fetch listings from both marketplaces
    const [meListings, raribleListings] = await Promise.all([
      safeFetch<NFTListing>(
        () => MagicEdenAPI.fetchListings(collection.magicEden), 
        "MagicEden", 
        collection.name, 
        "listings"
      ),
      safeFetch<NFTListing>(
        () => RaribleAPI.fetchListings(collection.rarible), 
        "Rarible", 
        collection.name, 
        "listings"
      ),
    ]);

    // Fetch bids from both marketplaces
    const [meBids, raribleBids] = await Promise.all([
      safeFetch<NFTBid>(
        () => MagicEdenAPI.fetchBids(collection.magicEden), 
        "MagicEden", 
        collection.name, 
        "bids"
      ),
      safeFetch<NFTBid>(
        () => RaribleAPI.fetchBids(collection.rarible), 
        "Rarible", 
        collection.name, 
        "bids"
      ),
    ]);

    // **FIX 4: Log marketplace comparison**
    console.log(`📊 ${collection.name}: ME=${meListings.length}L/${meBids.length}B | R=${raribleListings.length}L/${raribleBids.length}B`);

    // Combine all listings and bids
    const allListings: NFTListing[] = [...meListings, ...raribleListings];
    const allBids: NFTBid[] = [...meBids, ...raribleBids];

    // **FIX 5: Cross-marketplace arbitrage logic**
    const signals: ArbitrageSignal[] = [];

    // Strategy 1: Buy low on MagicEden, sell high on Rarible
    for (const meListing of meListings) {
      // Find highest bid on Rarible for same NFT
      const raribleBid = raribleBids.find(b => b.mint === meListing.mint);
      if (raribleBid && raribleBid.price.gt(meListing.price)) {
        const profit = raribleBid.price.sub(meListing.price);
        const feeEstimate = meListing.price.muln(0.025); // 2.5% fees
        const netProfit = profit.sub(feeEstimate);
        
        if (netProfit.gt(config.minProfitLamports)) {
          signals.push({
            targetListing: meListing,
            targetBid: raribleBid,
            estimatedGrossProfit: profit,
            estimatedNetProfit: netProfit,
            strategy: 'ME→Rarible',
            marketplaceIn: 'MagicEden',
            marketplaceOut: 'Rarible'
          });
        }
      }
    }

    // Strategy 2: Buy low on Rarible, sell high on MagicEden
    for (const raribleListing of raribleListings) {
      const meBid = meBids.find(b => b.mint === raribleListing.mint);
      if (meBid && meBid.price.gt(raribleListing.price)) {
        const profit = meBid.price.sub(raribleListing.price);
        const feeEstimate = raribleListing.price.muln(0.03); // 3% fees
        const netProfit = profit.sub(feeEstimate);
        
        if (netProfit.gt(config.minProfitLamports)) {
          signals.push({
            targetListing: raribleListing,
            targetBid: meBid,
            estimatedGrossProfit: profit,
            estimatedNetProfit: netProfit,
            strategy: 'Rarible→ME',
            marketplaceIn: 'Rarible',
            marketplaceOut: 'MagicEden'
          });
        }
      }
    }

    // Strategy 3: Price discrepancy between listings (buy lowest, sell highest)
    allListings.sort((a, b) => a.price.sub(b.price).toNumber());
    for (let i = 0; i < allListings.length - 1 && i < 10; i++) {
      const lowListing = allListings[i];
      const highListing = allListings[allListings.length - 1];
      
      if (highListing.mint !== lowListing.mint) continue; // Same NFT only
      
      const profit = highListing.price.sub(lowListing.price);
      const feeEstimate = lowListing.price.muln(0.04); // 4% round-trip fees
      const netProfit = profit.sub(feeEstimate);
      
      if (netProfit.gt(config.minProfitLamports)) {
        signals.push({
          targetListing: lowListing,
          targetBid: highListing as any, // Reuse listing as "bid" for simplicity
          estimatedGrossProfit: profit,
          estimatedNetProfit: netProfit,
          strategy: 'Listing Arbitrage',
          marketplaceIn: lowListing.auctionHouse,
          marketplaceOut: highListing.auctionHouse
        });
      }
    }

    pnlLogger.logMetrics({
      message: `🎯 ${collection.name} arbitrage signals`,
      signals: signals.length,
      totalListings: allListings.length,
      totalBids: allBids.length
    });

    return signals;

  } catch (err: unknown) {
    const error = err as Error;
    pnlLogger.logError(error, { message: `Error analyzing ${collection.name}` });
    return [];
  }
}

async function runBot() {
  pnlLogger.logMetrics({
    message: "🚀 MagicEden + Rarible Arbitrage Bot Started",
    collections: COLLECTIONS.length,
    simulateOnly: config.simulateOnly,
    minProfitSOL: config.minProfitLamports.toNumber() / 1e9
  });

  while (true) {
    cycleCount++;
    const start = Date.now();
    let allSignals: ArbitrageSignal[] = [];

    try {
      // **FIX 6: Parallel collection scanning**
      const collectionPromises = COLLECTIONS.map(analyzeCollection);
      const collectionResults = await Promise.allSettled(collectionPromises);
      
      for (const result of collectionResults) {
        if (result.status === 'fulfilled') {
          allSignals = allSignals.concat(result.value);
        }
      }

      // **FIX 7: Enhanced signal filtering and sorting**
      const profitableSignals = allSignals
        .filter((s) => s.estimatedNetProfit.gt(config.minProfitLamports))
        .sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber())
        .slice(0, config.maxConcurrentTrades);

      pnlLogger.logMetrics({
        message: `📡 Cycle ${cycleCount} complete`,
        cycleTime: ((Date.now() - start) / 1000).toFixed(2),
        totalSignals: allSignals.length,
        profitableSignals: profitableSignals.length,
        topProfitSOL: profitableSignals.length > 0 
          ? (profitableSignals[0].estimatedNetProfit.toNumber() / 1e9).toFixed(4)
          : '0'
      });

      // **FIX 8: Execute profitable trades**
      if (profitableSignals.length > 0 && !config.simulateOnly) {
        console.log(`💰 Executing ${profitableSignals.length} trades...`);
        
        for (const signal of profitableSignals) {
          const profitSOL = signal.estimatedNetProfit.toNumber() / 1e9;
          
          pnlLogger.logMetrics({
            message: `🎯 Executing arbitrage`,
            strategy: signal.strategy,
            mint: signal.targetListing.mint.substring(0, 8) + '...',
            buyPriceSOL: (signal.targetListing.price.toNumber() / 1e9).toFixed(4),
            sellPriceSOL: (signal.targetBid.price.toNumber() / 1e9).toFixed(4),
            profitSOL: profitSOL.toFixed(4),
            marketplaceIn: signal.marketplaceIn,
            marketplaceOut: signal.marketplaceOut
          });

          try {
            const tradeResult = await executeBatch([signal]);
            if (tradeResult && tradeResult.length > 0) {
              totalTrades++;
              totalProfit += profitSOL;
              pnlLogger.logMetrics({
                message: `✅ Trade executed successfully`,
                mint: signal.targetListing.mint,
                profitSOL: profitSOL.toFixed(4),
                totalProfitSOL: totalProfit.toFixed(4),
                totalTrades
              });
            }
          } catch (execError: unknown) {
            pnlLogger.logError(execError as Error, {
              message: `❌ Trade execution failed`,
              mint: signal.targetListing.mint,
              strategy: signal.strategy
            });
          }
        }
      } else if (profitableSignals.length === 0) {
        pnlLogger.logMetrics({
          message: `⚡ No profitable opportunities (min: ${config.minProfitLamports.toNumber() / 1e9} SOL)`
        });
      }

    } catch (err: unknown) {
      pnlLogger.logError(err as Error, { message: `❌ Cycle ${cycleCount} failed` });
    }

    // **FIX 9: Configurable scan interval**
    const delayMs = config.scanIntervalMs || 30000; // 30 seconds default
    console.log(`⏳ Next scan in ${(delayMs / 1000).toFixed(0)}s...`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
}

// **FIX 10: Graceful shutdown**
process.on("SIGINT", () => {
  pnlLogger.logMetrics({ 
    message: `🛑 Shutting down...`,
    finalProfitSOL: totalProfit.toFixed(4),
    totalTrades,
    cycles: cycleCount 
  });
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  pnlLogger.logError(err, { message: "💥 Uncaught exception" });
  process.exit(1);
});

// **START BOT**
runBot().catch((err) => {
  pnlLogger.logError(err as Error, { message: "💀 Fatal bot error" });
  process.exit(1);
});
