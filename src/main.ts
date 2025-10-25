import { AutoFlashloanExecutor } from "./autoFlashloanExecutor";
import { pnlLogger } from "./pnlLogger";
import { ArbitrageSignal, NFTBid, NFTListing, BotConfig, AuctionHouse } from "./types";
import BN from "bn.js";
import { config } from "./config";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";

// REAL APIs - Magic Eden, Rarible, and OpenSea
import { fetchListings as fetchMEListings, fetchBids as fetchMEBids } from "./magicEdenMarketplace";
import { fetchListings as fetchRaribleListings, fetchBids as fetchRaribleBids } from "./raribleMarketplace";
import { fetchListings as fetchOpenSeaListings } from "./openseaMarketplace";

// Initialize connection and wallet
const connection = new Connection(config.rpcUrl, "confirmed");
const wallet = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));
const executor = new AutoFlashloanExecutor(connection, wallet);

// Collections that work across all platforms
const COLLECTIONS = [
  { 
    name: "Mad Lads", 
    magicEden: "mad_lads", 
    rarible: "mad_lads",
    opensea: "mad-lads" 
  },
  { 
    name: "Okay Bears", 
    magicEden: "okay_bears", 
    rarible: "okay_bears",
    opensea: "okay-bears" 
  },
  { 
    name: "DeGods", 
    magicEden: "degods", 
    rarible: "degods",
    opensea: "degods" 
  },
  { 
    name: "Tensorians", 
    magicEden: "tensorians", 
    rarible: "tensorians",
    opensea: "tensorians" 
  },
  { 
    name: "Famous Fox", 
    magicEden: "famous_fox_federation", 
    rarible: "famous_fox_federation",
    opensea: "famous-fox-federation" 
  },
];

let totalProfit = 0;
let totalTrades = 0;
let cycleCount = 0;

// Enhanced safeFetch with better error handling and rate limiting
async function safeFetch<T>(
  fn: () => Promise<T[]>,
  source: string,
  collection: string,
  type: string
): Promise<T[]> {
  const start = Date.now();
  try {
    // Add small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const result = await fn();
    const duration = Date.now() - start;
    console.log(`✅ ${source} ${type} for ${collection}: ${result.length} items (${duration}ms)`);
    return result;
  } catch (err: any) {
    const duration = Date.now() - start;
    
    if (err.response?.status === 403) {
      console.log(`🔒 ${source} ${type} for ${collection}: API forbidden (${duration}ms)`);
    } else if (err.response?.status === 429) {
      console.log(`🚦 ${source} ${type} for ${collection}: Rate limited (${duration}ms)`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds on rate limit
    } else if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
      console.log(`🌐 ${source} ${type} for ${collection}: Connection issue (${duration}ms)`);
    } else {
      console.error(`❌ ${source} ${type} failed for ${collection} (${duration}ms):`, err.message);
    }
    
    return [];
  }
}

async function analyzeCollection(collection: { 
  name: string; 
  magicEden: string; 
  rarible: string;
  opensea: string;
}): Promise<ArbitrageSignal[]> {
  try {
    console.log(`\n🔍 Scanning ${collection.name} across 3 marketplaces...`);
    
    // Fetch listings from all 3 marketplaces
    const [meListings, raribleListings, openseaListings] = await Promise.all([
      safeFetch<NFTListing>(() => fetchMEListings(collection.magicEden), "MagicEden", collection.name, "listings"),
      safeFetch<NFTListing>(() => fetchRaribleListings(collection.rarible), "Rarible", collection.name, "listings"),
      safeFetch<NFTListing>(() => fetchOpenSeaListings(collection.opensea), "OpenSea", collection.name, "listings"),
    ]);

    // Fetch bids from Magic Eden and Rarible (OpenSea bids are complex)
    const [meBids, raribleBids] = await Promise.all([
      safeFetch<NFTBid>(() => fetchMEBids(collection.magicEden), "MagicEden", collection.name, "bids"),
      safeFetch<NFTBid>(() => fetchRaribleBids(collection.rarible), "Rarible", collection.name, "bids"),
    ]);

    console.log(`📊 ${collection.name}: ME=${meListings.length}L/${meBids.length}B | Rarible=${raribleListings.length}L/${raribleBids.length}B | OpenSea=${openseaListings.length}L`);

    const signals: ArbitrageSignal[] = [];
    const allListings = [...meListings, ...raribleListings, ...openseaListings];
    const allBids = [...meBids, ...raribleBids];

    // STRATEGY 1: Cross-marketplace arbitrage (buy low on one, sell high on another)
    for (const listing of allListings) {
      // Find higher bids on other marketplaces for the same NFT
      const higherBids = allBids.filter(bid => 
        bid.mint === listing.mint && 
        bid.auctionHouse !== listing.auctionHouse &&
        bid.price.gt(listing.price)
      );

      for (const higherBid of higherBids) {
        const rawProfit = higherBid.price.sub(listing.price);
        
        // Calculate fees based on marketplace (different fee structures)
        let feePercentage = 0.025; // Default 2.5%
        if (listing.auctionHouse === "Rarible") feePercentage = 0.03; // Rarible 3%
        if (listing.auctionHouse === "OpenSea") feePercentage = 0.035; // OpenSea 3.5%
        
        const feeEstimate = listing.price.muln(Math.floor(feePercentage * 1000)).divn(1000);
        const estimatedNetProfit = rawProfit.sub(feeEstimate);
        
        if (estimatedNetProfit.gt(config.minProfitLamports)) {
          signals.push({
            targetListing: listing,
            targetBid: higherBid,
            estimatedNetProfit,
            estimatedGrossProfit: rawProfit,
            rawProfit,
            strategy: `${listing.auctionHouse}→${higherBid.auctionHouse}`,
            marketplaceIn: listing.auctionHouse,
            marketplaceOut: higherBid.auctionHouse,
            timestamp: Date.now()
          });
        }
      }
    }

    // STRATEGY 2: Find cheapest listing and highest bid regardless of marketplace
    const listingsByMint = new Map<string, NFTListing>();
    const bidsByMint = new Map<string, NFTBid>();

    // Find cheapest listing for each NFT
    for (const listing of allListings) {
      const existing = listingsByMint.get(listing.mint);
      if (!existing || listing.price.lt(existing.price)) {
        listingsByMint.set(listing.mint, listing);
      }
    }

    // Find highest bid for each NFT
    for (const bid of allBids) {
      const existing = bidsByMint.get(bid.mint);
      if (!existing || bid.price.gt(existing.price)) {
        bidsByMint.set(bid.mint, bid);
      }
    }

    // Generate arbitrage signals from cheapest listings to highest bids
    for (const [mint, cheapestListing] of listingsByMint) {
      const highestBid = bidsByMint.get(mint);
      
      if (highestBid && highestBid.price.gt(cheapestListing.price) && highestBid.auctionHouse !== cheapestListing.auctionHouse) {
        const rawProfit = highestBid.price.sub(cheapestListing.price);
        let feePercentage = 0.025;
        if (cheapestListing.auctionHouse === "Rarible") feePercentage = 0.03;
        if (cheapestListing.auctionHouse === "OpenSea") feePercentage = 0.035;
        
        const feeEstimate = cheapestListing.price.muln(Math.floor(feePercentage * 1000)).divn(1000);
        const estimatedNetProfit = rawProfit.sub(feeEstimate);
        
        if (estimatedNetProfit.gt(config.minProfitLamports)) {
          signals.push({
            targetListing: cheapestListing,
            targetBid: highestBid,
            estimatedNetProfit,
            estimatedGrossProfit: rawProfit,
            rawProfit,
            strategy: `BestPrice_${cheapestListing.auctionHouse}→${highestBid.auctionHouse}`,
            marketplaceIn: cheapestListing.auctionHouse,
            marketplaceOut: highestBid.auctionHouse,
            timestamp: Date.now()
          });
        }
      }
    }

    // Remove duplicate signals (same mint and strategy)
    const uniqueSignals = signals.filter((signal, index, self) =>
      index === self.findIndex(s => 
        s.targetListing.mint === signal.targetListing.mint && 
        s.strategy === signal.strategy
      )
    );

    console.log(`🎯 ${collection.name}: Found ${uniqueSignals.length} arbitrage opportunities across 3 marketplaces`);
    
    // Log top opportunities
    if (uniqueSignals.length > 0) {
      const topSignals = uniqueSignals
        .sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber())
        .slice(0, 3);
      
      topSignals.forEach((signal, index) => {
        console.log(`   ${index + 1}. ${signal.strategy}: ${signal.estimatedNetProfit.toNumber() / 1e9} SOL profit`);
      });
    }

    return uniqueSignals;

  } catch (err: any) {
    console.error(`💥 Error analyzing ${collection.name}:`, err.message);
    return [];
  }
}

async function runBot() {
  console.log("🚀 Arbitrage Bot Started - Magic Eden ↔ Rarible ↔ OpenSea");
  console.log("=" .repeat(60));
  console.log(`📊 Collections: ${COLLECTIONS.length}`);
  console.log(`💰 Min Profit: ${config.minProfitLamports.toNumber() / 1e9} SOL`);
  console.log(`🔧 Mode: ${config.mode}`);
  console.log(`⏱️  Scan Interval: ${config.scanIntervalMs}ms`);
  console.log("=" .repeat(60));

  while (true) {
    cycleCount++;
    const cycleStart = Date.now();
    let allSignals: ArbitrageSignal[] = [];

    try {
      console.log(`\n🔄 CYCLE ${cycleCount} STARTED at ${new Date().toLocaleTimeString()}`);
      
      // Analyze all collections in parallel with error handling
      const collectionPromises = COLLECTIONS.map(analyzeCollection);
      const results = await Promise.allSettled(collectionPromises);
      
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allSignals = allSignals.concat(result.value);
        } else {
          console.error('Collection analysis failed:', result.reason);
        }
      }

      // Filter and sort profitable signals
      const profitableSignals = allSignals
        .filter(s => s.estimatedNetProfit.gt(config.minProfitLamports))
        .sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber());

      console.log(`\n📡 CYCLE ${cycleCount} SUMMARY:`);
      console.log(`   Total Opportunities: ${allSignals.length}`);
      console.log(`   Profitable Signals: ${profitableSignals.length}`);
      console.log(`   Top Profit: ${profitableSignals.length > 0 ? (profitableSignals[0].estimatedNetProfit.toNumber() / 1e9).toFixed(4) : 0} SOL`);

      // Execute trades if we have profitable signals
      if (profitableSignals.length > 0) {
        console.log(`\n🎯 EXECUTING ${Math.min(profitableSignals.length, config.maxConcurrentTrades)} TRADES...`);
        await executor.executeTrades(profitableSignals, config);
        
        // Update metrics
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
      console.log("─".repeat(60));

      // Adaptive delay based on cycle time
      const remainingTime = Math.max(1000, config.scanIntervalMs - cycleTime);
      if (remainingTime > 0) {
        console.log(`💤 Waiting ${remainingTime}ms until next cycle...`);
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }

    } catch (err: any) {
      console.error(`💥 CYCLE ${cycleCount} FAILED:`, err.message);
      console.log(`💤 Waiting ${config.scanIntervalMs}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, config.scanIntervalMs));
    }
  }
}

// Graceful shutdown handling
process.on("SIGINT", async () => {
  console.log(`\n🛑 SHUTDOWN SIGNAL RECEIVED`);
  console.log("=" .repeat(60));
  console.log(`📊 FINAL STATISTICS:`);
  console.log(`   Cycles Completed: ${cycleCount}`);
  console.log(`   Total Trades: ${totalTrades}`);
  console.log(`   Total Profit: ${totalProfit.toFixed(4)} SOL`);
  console.log(`   Average Profit per Trade: ${totalTrades > 0 ? (totalProfit / totalTrades).toFixed(4) : 0} SOL`);
  console.log("=" .repeat(60));
  console.log("👋 Arbitrage Bot Stopped");
  process.exit(0);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

process.on("uncaughtException", (error) => {
  console.error('💥 UNCAUGHT EXCEPTION:', error);
  process.exit(1);
});

// Start the bot
runBot().catch(err => {
  console.error("💥 FATAL ERROR:", err);
  process.exit(1);
});
