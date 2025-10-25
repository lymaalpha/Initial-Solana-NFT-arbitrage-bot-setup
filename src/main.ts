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

// ✅ CORRECTED: Using collection SLUGS (not mint addresses)
const COLLECTIONS_CONFIG = [
  { name: "Mad Lads", magicEden: "mad_lads", rarible: "mad_lads" },
  { name: "Okay Bears", magicEden: "okay_bears", rarible: "okay_bears" },
  { name: "DeGods", magicEden: "degods", rarible: "degods" },
  { name: "Tensorians", magicEden: "tensorians", rarible: "tensorians" },
  { name: "Famous Fox", magicEden: "famous_fox_federation", rarible: "famous_fox_federation" },
];

let totalProfit = 0;
let totalTrades = 0;
let cycleCount = 0;

async function safeFetch<T>(
  fn: () => Promise<T[]>,
  source: string,
  collection: string,
  type: string
): Promise<T[]> {
  try {
    const result = await fn();
    console.log(`✅ ${source} ${type} for ${collection}: ${result.length} items`);
    return result;
  } catch (err: any) {
    console.error(`❌ ${source} ${type} failed for ${collection}:`, err.message);
    return [];
  }
}

async function analyzeCollection(collection: { 
  name: string; 
  magicEden: string; 
  rarible: string;
}): Promise<ArbitrageSignal[]> {
  try {
    console.log(`\n🔍 Scanning ${collection.name}...`);
    
    // Fetch data from both marketplaces
    const [meListings, raribleListings] = await Promise.all([
      safeFetch<NFTListing>(() => fetchMEListings(collection.magicEden), "MagicEden", collection.name, "listings"),
      safeFetch<NFTListing>(() => fetchRaribleListings(collection.rarible), "Rarible", collection.name, "listings"),
    ]);

    const [meBids, raribleBids] = await Promise.all([
      safeFetch<NFTBid>(() => fetchMEBids(collection.magicEden), "MagicEden", collection.name, "bids"),
      safeFetch<NFTBid>(() => fetchRaribleBids(collection.rarible), "Rarible", collection.name, "bids"),
    ]);

    console.log(`📊 ${collection.name}: ME=${meListings.length}L/${meBids.length}B | Rarible=${raribleListings.length}L/${raribleBids.length}B`);

    const signals: ArbitrageSignal[] = [];
    const allListings = [...meListings, ...raribleListings];
    const allBids = [...meBids, ...raribleBids];

    // STRATEGY 1: Buy on Magic Eden, sell to Rarible bid
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

    // STRATEGY 2: Buy on Rarible, sell to Magic Eden bid
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
      
      // Analyze all collections
      const collectionPromises = COLLECTIONS_CONFIG.map(analyzeCollection);
      const results = await Promise.allSettled(collectionPromises);
      
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allSignals = allSignals.concat(result.value);
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
        
        // Update metrics
        const executedSignals = profitableSignals.slice(0, config.maxConcurrentTrades);
        executedSignals.forEach(signal => {
          totalTrades++;
          totalProfit += signal.estimatedNetProfit.toNumber() / 1e9;
        });
      }

      const cycleTime = Date.now() - cycleStart;
      console.log(`\n⏱️  CYCLE ${cycleCount} COMPLETED in ${cycleTime}ms`);
      console.log(`📈 TOTAL STATS: ${totalTrades} trades, ${totalProfit.toFixed(4)} SOL profit`);

      // Wait for next cycle
      const remainingTime = Math.max(1000, config.scanIntervalMs - cycleTime);
      await new Promise(resolve => setTimeout(resolve, remainingTime));

    } catch (err: any) {
      console.error(`💥 CYCLE ${cycleCount} FAILED:`, err.message);
      await new Promise(resolve => setTimeout(resolve, config.scanIntervalMs));
    }
  }
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log(`\n🛑 SHUTDOWN - ${totalTrades} trades, ${totalProfit.toFixed(4)} SOL profit`);
  process.exit(0);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION:', reason);
});

runBot().catch(err => {
  console.error("💥 FATAL ERROR:", err);
  process.exit(1);
});
