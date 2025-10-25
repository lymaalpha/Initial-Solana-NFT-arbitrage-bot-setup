import { scanForArbitrage } from "./scanForArbitrage";
import { executeBatch } from "./autoFlashloanExecutor";
import { pnlLogger } from "./pnlLogger";
import { ArbitrageSignal, NFTBid, NFTListing, TradeLog, BotConfig, AuctionHouse } from "./types";
import BN from "bn.js";
import { config } from "./config"; // Use your actual config

// ✅ Import marketplace functions
import { fetchListings as fetchMEListings, fetchBids as fetchMEBids } from "./magicEdenMarketplace";
import { fetchListings as fetchRaribleListings, fetchBids as fetchRaribleBids } from "./raribleMarketplace";

const COLLECTIONS = [
  { name: "Mad Lads", magicEden: "mad_lads", rarible: "mad_lads" },
  { name: "Okay Bears", magicEden: "okay_bears", rarible: "okay_bears" },
  { name: "DeGods", magicEden: "degods", rarible: "degods" },
];

let totalProfit = 0;
let totalTrades = 0;
let cycleCount = 0;

// ✅ Fixed safeFetch function
async function safeFetch<T>(
  fn: () => Promise<T[]>,
  source: string,
  collection: string,
  type: string
): Promise<T[]> {
  const start = Date.now();
  try {
    const result = await fn();
    console.log(`✅ ${source} ${type} fetched for ${collection}: ${result.length} items`);
    return result;
  } catch (err: unknown) {
    console.error(`❌ ${source} ${type} failed for ${collection}:`, err);
    return [];
  }
}

async function analyzeCollection(collection: { name: string; magicEden: string; rarible: string }): Promise<ArbitrageSignal[]> {
  try {
    console.log(`🔍 Scanning ${collection.name}...`);
    
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

    // ✅ Strategy 1: Buy low on MagicEden, sell high on Rarible bids
    for (const meListing of meListings) {
      const raribleBid = raribleBids.find(b => b.mint === meListing.mint);
      if (raribleBid && raribleBid.price.gt(meListing.price)) {
        const rawProfit = raribleBid.price.sub(meListing.price);
        const feeEstimate = meListing.price.muln(25).divn(1000); // 2.5%
        const estimatedNetProfit = rawProfit.sub(feeEstimate);
        const estimatedGrossProfit = rawProfit;
        
        if (estimatedNetProfit.gt(config.minProfitLamports)) {
          signals.push({
            targetListing: meListing,
            targetBid: raribleBid,
            estimatedNetProfit,
            estimatedGrossProfit,
            rawProfit,
            strategy: 'ME→Rarible',
            marketplaceIn: 'MagicEden' as AuctionHouse,
            marketplaceOut: 'Rarible' as AuctionHouse,
            timestamp: Date.now()
          });
        }
      }
    }

    // ✅ Strategy 2: Buy low on Rarible, sell high on MagicEden bids
    for (const raribleListing of raribleListings) {
      const meBid = meBids.find(b => b.mint === raribleListing.mint);
      if (meBid && meBid.price.gt(raribleListing.price)) {
        const rawProfit = meBid.price.sub(raribleListing.price);
        const feeEstimate = raribleListing.price.muln(30).divn(1000); // 3%
        const estimatedNetProfit = rawProfit.sub(feeEstimate);
        const estimatedGrossProfit = rawProfit;
        
        if (estimatedNetProfit.gt(config.minProfitLamports)) {
          signals.push({
            targetListing: raribleListing,
            targetBid: meBid,
            estimatedNetProfit,
            estimatedGrossProfit,
            rawProfit,
            strategy: 'Rarible→ME',
            marketplaceIn: 'Rarible' as AuctionHouse,
            marketplaceOut: 'MagicEden' as AuctionHouse,
            timestamp: Date.now()
          });
        }
      }
    }

    // ✅ Strategy 3: Buy low listing, sell to high bid
    const allListings = [...meListings, ...raribleListings];
    const allBids = [...meBids, ...raribleBids];
    
    for (const listing of allListings) {
      const highBid = allBids.find(b => 
        b.mint === listing.mint && 
        b.price.gt(listing.price.add(listing.price.muln(40).divn(1000)))
      );
      
      if (highBid) {
        const rawProfit = highBid.price.sub(listing.price);
        const feeEstimate = listing.price.muln(25).divn(1000);
        const estimatedNetProfit = rawProfit.sub(feeEstimate);
        const estimatedGrossProfit = rawProfit;
        
        if (estimatedNetProfit.gt(config.minProfitLamports)) {
          signals.push({
            targetListing: listing,
            targetBid: highBid,
            estimatedNetProfit,
            estimatedGrossProfit,
            rawProfit,
            strategy: 'Listing→Bid Arb',
            marketplaceIn: listing.auctionHouse,
            marketplaceOut: highBid.auctionHouse,
            timestamp: Date.now()
          });
        }
      }
    }

    console.log(`🎯 ${collection.name} signals found: ${signals.length}`);
    return signals;

  } catch (err: unknown) {
    console.error(`Error analyzing ${collection.name}:`, err);
    return [];
  }
}

async function runBot() {
  console.log("🚀 Arbitrage Bot Started");
  console.log(`📊 Collections: ${COLLECTIONS.length}`);
  console.log(`💰 Min Profit: ${config.minProfitLamports.toNumber() / 1e9} SOL`);
  console.log(`🔧 Mode: ${config.simulateOnly ? 'SIMULATION' : 'LIVE'}`);

  while (true) {
    cycleCount++;
    const start = Date.now();
    let allSignals: ArbitrageSignal[] = [];

    try {
      const collectionPromises = COLLECTIONS.map(analyzeCollection);
      const results = await Promise.allSettled(collectionPromises);
      
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allSignals = allSignals.concat(result.value);
        }
      }

      const profitableSignals = allSignals
        .filter(s => s.estimatedNetProfit.gt(config.minProfitLamports))
        .sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber())
        .slice(0, config.maxConcurrentTrades);

      console.log(`📡 Cycle ${cycleCount} - Signals: ${allSignals.length}, Profitable: ${profitableSignals.length}`);

      if (profitableSignals.length > 0 && !config.simulateOnly) {
        for (const signal of profitableSignals) {
          const profitSOL = signal.estimatedNetProfit.toNumber() / 1e9;
          
          console.log(`🎯 Executing ${signal.strategy}`, {
            mint: signal.targetListing.mint.slice(0, 8) + '...',
            buyPrice: (signal.targetListing.price.toNumber() / 1e9).toFixed(4),
            sellPrice: (signal.targetBid.price.toNumber() / 1e9).toFixed(4),
            profit: profitSOL.toFixed(4)
          });

          try {
            // Log the trade
            const tradeLog: TradeLog = {
              timestamp: new Date().toISOString(),
              mint: signal.targetListing.mint,
              profit: profitSOL,
              txSig: 'simulated_tx', // Will be replaced with real tx
              type: 'simulated'
            };

            await pnlLogger.logPnL(signal, 'simulated_tx', 'executed');
            
            totalTrades++;
            totalProfit += profitSOL;
          } catch (execError: unknown) {
            console.error(`Trade execution failed:`, execError);
          }

          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

    } catch (err: unknown) {
      console.error(`Cycle ${cycleCount} failed:`, err);
    }

    await new Promise(resolve => setTimeout(resolve, config.scanIntervalMs));
  }
}

process.on("SIGINT", () => {
  console.log(`🛑 Shutdown - Total Profit: ${totalProfit.toFixed(4)} SOL, Trades: ${totalTrades}`);
  process.exit(0);
});

runBot().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
