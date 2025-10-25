import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "./config";
import { pnlLogger } from "./pnlLogger";
import { AutoFlashloanExecutor } from "./autoFlashloanExecutor";
import { ArbitrageSignal, NFTBid, NFTListing, AuctionHouse } from "./types";

// Marketplace imports
import { fetchListings as fetchMEListings, fetchBids as fetchMEBids } from "./magicEdenMarketplace";
import { fetchListings as fetchRaribleListings, fetchBids as fetchRaribleBids } from "./raribleMarketplace";

const connection = new Connection(config.rpcUrl, "confirmed");
const wallet = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));
const executor = new AutoFlashloanExecutor(connection, wallet);

// ✅ FIXED: Use only collections that exist on both platforms
const COLLECTIONS_CONFIG = [
  { name: "Mad Lads", magicEden: "mad_lads", rarible: "mad_lads" },
  { name: "Okay Bears", magicEden: "okay_bears", rarible: "okay_bears" },
  { name: "DeGods", magicEden: "degods", rarible: "degods" },
  // Remove problematic collections for now
];

let totalProfit = 0;
let totalTrades = 0;
let cycleCount = 0;
let raribleLastCall = 0;

// Rate limiting for Rarible API
async function rateLimitRarible(): Promise<void> {
  const now = Date.now();
  const timeSinceLastCall = now - raribleLastCall;
  const minDelay = 2000; // 2 seconds between Rarible calls
  
  if (timeSinceLastCall < minDelay) {
    const waitTime = minDelay - timeSinceLastCall;
    console.log(`⏳ Rate limiting: Waiting ${waitTime}ms before next Rarible call`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  raribleLastCall = Date.now();
}

async function safeFetch<T>(
  fn: () => Promise<T[]>,
  source: string,
  collection: string,
  type: string
): Promise<T[]> {
  try {
    // Rate limit Rarible API calls
    if (source === "Rarible") {
      await rateLimitRarible();
    }
    
    const result = await fn();
    console.log(`✅ ${source} ${type} for ${collection}: ${result.length} items`);
    return result;
  } catch (err: any) {
    if (err.response?.status === 429) {
      console.log(`🚦 ${source} rate limited for ${collection}, waiting 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return []; // Return empty instead of retrying immediately
    } else if (err.response?.status === 404) {
      console.log(`🔍 ${source}: Collection ${collection} not found`);
      return [];
    } else {
      console.error(`❌ ${source} ${type} failed for ${collection}:`, err.message);
      return [];
    }
  }
}

async function analyzeCollection(collection: { 
  name: string; 
  magicEden: string; 
  rarible: string;
}): Promise<ArbitrageSignal[]> {
  try {
    console.log(`\n🔍 Scanning ${collection.name}...`);
    
    // Fetch Magic Eden data first (more reliable)
    const [meListings, meBids] = await Promise.all([
      safeFetch<NFTListing>(() => fetchMEListings(collection.magicEden), "MagicEden", collection.name, "listings"),
      safeFetch<NFTBid>(() => fetchMEBids(collection.magicEden), "MagicEden", collection.name, "bids"),
    ]);

    // Then fetch Rarible data with delays
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const [raribleListings, raribleBids] = await Promise.all([
      safeFetch<NFTListing>(() => fetchRaribleListings(collection.rarible), "Rarible", collection.name, "listings"),
      safeFetch<NFTBid>(() => fetchRaribleBids(collection.rarible), "Rarible", collection.name, "bids"),
    ]);

    console.log(`📊 ${collection.name}: ME=${meListings.length}L/${meBids.length}B | Rarible=${raribleListings.length}L/${raribleBids.length}B`);

    // If Rarible has no data, skip this collection for now
    if (raribleListings.length === 0 && raribleBids.length === 0) {
      console.log(`⚠️ Skipping ${collection.name} - no Rarible data available`);
      return [];
    }

    const signals: ArbitrageSignal[] = [];

    // STRATEGY: Only look for opportunities where we have data from both sides
    for (const meListing of meListings) {
      const raribleBid = raribleBids.find(b => b.mint === meListing.mint);
      if (raribleBid && raribleBid.price.gt(meListing.price)) {
        const rawProfit = raribleBid.price.sub(meListing.price);
        const feeEstimate = meListing.price.muln(25).divn(1000); // 2.5% fees
        const estimatedNetProfit = rawProfit.sub(feeEstimate);
        
        if (estimatedNetProfit.gt(config.minProfitLamports)) {
          signals.push({
            targetListing: meListing,
            targetBid: raribleBid,
            estimatedNetProfit,
            estimatedGrossProfit: rawProfit,
            rawProfit,
            strategy: 'ME→Rarible',
            marketplaceIn: 'MagicEden' as AuctionHouse,
            marketplaceOut: 'Rarible' as AuctionHouse,
            timestamp: Date.now()
          });
        }
      }
    }

    for (const raribleListing of raribleListings) {
      const meBid = meBids.find(b => b.mint === raribleListing.mint);
      if (meBid && meBid.price.gt(raribleListing.price)) {
        const rawProfit = meBid.price.sub(raribleListing.price);
        const feeEstimate = raribleListing.price.muln(30).divn(1000); // 3% fees
        const estimatedNetProfit = rawProfit.sub(feeEstimate);
        
        if (estimatedNetProfit.gt(config.minProfitLamports)) {
          signals.push({
            targetListing: raribleListing,
            targetBid: meBid,
            estimatedNetProfit,
            estimatedGrossProfit: rawProfit,
            rawProfit,
            strategy: 'Rarible→ME',
            marketplaceIn: 'Rarible' as AuctionHouse,
            marketplaceOut: 'MagicEden' as AuctionHouse,
            timestamp: Date.now()
          });
        }
      }
    }

    console.log(`🎯 ${collection.name}: Found ${signals.length} arbitrage opportunities`);
    return signals;

  } catch (err: any) {
    console.error(`💥 Error analyzing ${collection.name}:`, err.message);
    return [];
  }
}

async function runBot() {
  console.log("🚀 Arbitrage Bot Started - Magic Eden ↔ Rarible");
  console.log("=".repeat(50));
  console.log(`📊 Collections: ${COLLECTIONS_CONFIG.length}`);
  console.log(`💰 Min Profit: ${config.minProfitLamports.toNumber() / 1e9} SOL`);
  console.log(`🔧 Mode: ${config.mode}`);
  console.log(`🔑 Rarible API: ${config.raribleApiKey ? '✅ Configured' : '❌ Missing'}`);
  console.log("=".repeat(50));

  while (true) {
    cycleCount++;
    const cycleStart = Date.now();
    let allSignals: ArbitrageSignal[] = [];

    try {
      console.log(`\n🔄 CYCLE ${cycleCount} STARTED at ${new Date().toLocaleTimeString()}`);
      
      // Analyze collections sequentially to avoid rate limits
      for (const collection of COLLECTIONS_CONFIG) {
        const signals = await analyzeCollection(collection);
        allSignals = allSignals.concat(signals);
        
        // Delay between collections to respect rate limits
        if (collection !== COLLECTIONS_CONFIG[COLLECTIONS_CONFIG.length - 1]) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Filter profitable signals
      const profitableSignals = allSignals
        .filter(s => s.estimatedNetProfit.gt(config.minProfitLamports))
        .sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber());

      console.log(`\n📡 CYCLE ${cycleCount} SUMMARY:`);
      console.log(`   Total Opportunities: ${allSignals.length}`);
      console.log(`   Profitable Signals: ${profitableSignals.length}`);

      // Execute trades
      if (profitableSignals.length > 0) {
        console.log(`\n🎯 EXECUTING ${Math.min(profitableSignals.length, config.maxConcurrentTrades)} TRADES...`);
        await executor.executeTrades(profitableSignals, config);
        
        const executedSignals = profitableSignals.slice(0, config.maxConcurrentTrades);
        executedSignals.forEach(signal => {
          totalTrades++;
          totalProfit += signal.estimatedNetProfit.toNumber() / 1e9;
        });
        
        console.log(`💰 Cycle Profit: ${executedSignals.reduce((sum, s) => sum + s.estimatedNetProfit.toNumber() / 1e9, 0).toFixed(4)} SOL`);
      }

      const cycleTime = Date.now() - cycleStart;
      console.log(`\n⏱️  CYCLE ${cycleCount} COMPLETED in ${cycleTime}ms`);
      console.log(`📈 TOTAL STATS: ${totalTrades} trades, ${totalProfit.toFixed(4)} SOL profit`);

      // Adaptive delay based on cycle time
      const remainingTime = Math.max(5000, config.scanIntervalMs - cycleTime); // Minimum 5 seconds
      console.log(`💤 Waiting ${remainingTime}ms until next cycle...`);
      await new Promise(resolve => setTimeout(resolve, remainingTime));

    } catch (err: any) {
      console.error(`💥 CYCLE ${cycleCount} FAILED:`, err.message);
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds on error
    }
  }
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log(`\n🛑 SHUTDOWN - ${totalTrades} trades, ${totalProfit.toFixed(4)} SOL profit`);
  process.exit(0);
});

runBot().catch(err => {
  console.error("💥 FATAL ERROR:", err);
  process.exit(1);
});
