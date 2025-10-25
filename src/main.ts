// src/main.ts (FINAL - COMPATIBLE WITH YOUR TYPES)
import { AutoFlashloanExecutor } from "./autoFlashloanExecutor";
import { pnlLogger } from "./pnlLogger";
import { ArbitrageSignal, NFTBid, NFTListing, BotConfig, AuctionHouse } from "./types";
import BN from "bn.js";
import { config } from "./config";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";

// Import marketplace functions
import { fetchListings as fetchMEListings, fetchBids as fetchMEBids } from "./magicEdenMarketplace";
import { fetchListings as fetchRaribleListings, fetchBids as fetchRaribleBids } from "./raribleMarketplace";

// Initialize connection and wallet
const connection = new Connection(config.rpcUrl, "confirmed");
const wallet = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

// Initialize the executor
const executor = new AutoFlashloanExecutor(connection, wallet);

const COLLECTIONS = [
  { name: "Mad Lads", magicEden: "mad_lads", rarible: "mad_lads" },
  { name: "Okay Bears", magicEden: "okay_bears", rarible: "okay_bears" },
  { name: "DeGods", magicEden: "degods", rarible: "degods" },
];

let totalProfit = 0;
let totalTrades = 0;
let cycleCount = 0;

// Safe fetch function with error handling
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

    // Strategy 1: Buy low on MagicEden, sell high on Rarible bids
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

    // Strategy 2: Buy low on Rarible, sell high on MagicEden bids
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

    // Strategy 3: Buy low listing, sell to high bid
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
        .sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber());

      console.log(`📡 Cycle ${cycleCount} - Signals: ${allSignals.length}, Profitable: ${profitableSignals.length}`);

      // Use the executor to handle trades
      if (profitableSignals.length > 0) {
        console.log(`🎯 Executing ${profitableSignals.length} trades...`);
        await executor.executeTrades(profitableSignals, config);
        
        // Track metrics
        profitableSignals.forEach(signal => {
          totalTrades++;
          totalProfit += signal.estimatedNetProfit.toNumber() / 1e9;
        });
      }

      const cycleTime = Date.now() - start;
      console.log(`⏱️  Cycle ${cycleCount} completed in ${cycleTime}ms`);

    } catch (err: unknown) {
      console.error(`Cycle ${cycleCount} failed:`, err);
    }

    await new Promise(resolve => setTimeout(resolve, config.scanIntervalMs));
  }
}

process.on("SIGINT", () => {
  console.log(`\n🛑 Shutdown - Total Profit: ${totalProfit.toFixed(4)} SOL, Trades: ${totalTrades}, Cycles: ${cycleCount}`);
  process.exit(0);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

runBot().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
