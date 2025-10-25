// src/main.ts (UPDATED)
import { AutoFlashloanExecutor } from "./autoFlashloanExecutor";
import { pnlLogger } from "./pnlLogger";
import { ArbitrageSignal, NFTBid, NFTListing, BotConfig, AuctionHouse } from "./types";
import BN from "bn.js";
import { config, isSimulationMode } from "./config"; // ✅ Import helper
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";

// REAL APIs - Only Magic Eden and Rarible
import { fetchListings as fetchMEListings, fetchBids as fetchMEBids } from "./magicEdenMarketplace";
import { fetchListings as fetchRaribleListings, fetchBids as fetchRaribleBids } from "./raribleMarketplace";

// Initialize connection and wallet
const connection = new Connection(config.rpcUrl, "confirmed");
const wallet = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));
const executor = new AutoFlashloanExecutor(connection, wallet);

// Focus collections that work well on both platforms
const COLLECTIONS = [
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
    console.log(`🔍 Scanning ${collection.name} on Magic Eden ↔ Rarible...`);
    
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

    // STRATEGY 1: Buy on Magic Eden (cheaper), sell to Rarible bid (higher)
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

    // STRATEGY 2: Buy on Rarible (cheaper), sell to Magic Eden bid (higher)
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

    console.log(`🎯 ${collection.name}: Found ${signals.length} ME↔Rarible arbitrage opportunities`);
    return signals;

  } catch (err: unknown) {
    console.error(`Error analyzing ${collection.name}:`, err);
    return [];
  }
}

async function runBot() {
  console.log("🚀 Arbitrage Bot Started - Magic Eden ↔ Rarible");
  console.log(`📊 Collections: ${COLLECTIONS.length}`);
  console.log(`💰 Min Profit: ${config.minProfitLamports.toNumber() / 1e9} SOL`);
  console.log(`🔧 Mode: ${config.mode}`); // ✅ UPDATED: Use config.mode

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

      console.log(`📡 Cycle ${cycleCount} - Total Signals: ${allSignals.length}, Profitable: ${profitableSignals.length}`);

      if (profitableSignals.length > 0) {
        console.log(`🎯 Executing ${profitableSignals.length} ME↔Rarible trades...`);
        await executor.executeTrades(profitableSignals, config); // ✅ FIXED: Now compatible
        
        profitableSignals.forEach(signal => {
          totalTrades++;
          totalProfit += signal.estimatedNetProfit.toNumber() / 1e9;
        });
      }

      const cycleTime = Date.now() - start;
      console.log(`⏱️  Cycle ${cycleCount} completed in ${cycleTime}ms`);
      await new Promise(resolve => setTimeout(resolve, config.scanIntervalMs));

    } catch (err: unknown) {
      console.error(`Cycle ${cycleCount} failed:`, err);
      await new Promise(resolve => setTimeout(resolve, config.scanIntervalMs));
    }
  }
}

process.on("SIGINT", () => {
  console.log(`\n🛑 Shutdown - Total Profit: ${totalProfit.toFixed(4)} SOL, Trades: ${totalTrades}, Cycles: ${cycleCount}`);
  process.exit(0);
});

runBot().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
