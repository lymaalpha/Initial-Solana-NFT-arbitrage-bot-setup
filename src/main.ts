import { Connection, Keypair } from "@solana/web3.js";
import { scanForArbitrage } from "./scanForArbitrage";
import { executeBatch } from "./autoFlashloanExecutor";  // Your batch for concurrency
import { pnlLogger } from "./pnlLogger";  // Replaces custom logger
import { config } from "./config";
import { ArbitrageSignal } from "./types";
import axios from 'axios';
import BN from 'bn.js';
import bs58 from 'bs58';

// Connection & payer
const connection = new Connection(config.rpcUrl, "confirmed");
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

// Runtime from config
const SCAN_INTERVAL_MS = config.scanIntervalMs;
const MAX_CONCURRENT_TRADES = config.minSignals;  // Reuse for concurrency

let runningTrades = 0;

// Stub loadActiveOpportunities (load from store/DB if you have one)
async function loadActiveOpportunities(): Promise<ArbitrageSignal[]> {
  // If store (e.g., Redis/SQLite), load pending trades; else empty
  return [];  // No active for fresh start
}

// Stub updateTradeResult (save to store if you have one)
async function updateTradeResult(signal: ArbitrageSignal, result: any): Promise<void> {
  // If store, update DB with result; else log
  pnlLogger.logMetrics({ updatedMint: signal.targetListing.mint, result });
}

// Real fetch listings (Magic Eden—adapt for marketplaces)
async function fetchListings(collectionMint: string, marketplace: string): Promise<any[]> {
  try {
    let url = '';
    if (marketplace === 'MagicEden') {
      url = `https://api-mainnet.magiceden.dev/v2/collections/${collectionMint}/listings?offset=0&limit=50`;
    } else if (marketplace === 'Tensor') {
      url = `https://api.tensor.trade/v1/collections/${collectionMint}/listings?limit=50`;
    } // Add more marketplaces

    const response = await axios.get(url);
    const listings = response.data.map((item: any) => ({
      mint: item.tokenMint || item.mint,
      auctionHouse: marketplace,
      price: new BN((item.price || item.startingBid) * 1e9),  // Lamports
      assetMint: 'So11111111111111111111111111111111111111112',  // WSOL
      currency: 'SOL',
      timestamp: Date.now(),
    }));
    pnlLogger.logMetrics({ fetchedListings: listings.length, marketplace, collectionMint });
    return listings;
  } catch (err) {
    pnlLogger.logError(err as Error, { collectionMint, marketplace });
    return [];
  }
}

// Real fetch bids (Tensor/ME)
async function fetchBids(collectionMint: string, marketplace: string): Promise<any[]> {
  try {
    let url = '';
    if (marketplace === 'Tensor') {
      url = `https://api.tensor.trade/v1/collections/${collectionMint}/bids?limit=50`;
    } else if (marketplace === 'MagicEden') {
      url = `https://api-mainnet.magiceden.dev/v2/collections/${collectionMint}/bids?limit=50`;  // If supported
    } // Add more

    const response = await axios.get(url);
    const bids = response.data.map((item: any) => ({
      mint: item.mint,
      auctionHouse: marketplace,
      price: new BN(item.price * 1e9),
      assetMint: 'So11111111111111111111111111111111111111112',
      currency: 'SOL',
      timestamp: Date.now(),
    }));
    pnlLogger.logMetrics({ fetchedBids: bids.length, marketplace, collectionMint });
    return bids;
  } catch (err) {
    pnlLogger.logError(err as Error, { collectionMint, marketplace });
    return [];
  }
}

// Your processOpportunities logic, wired to real scan
async function processOpportunities() {
  try {
    pnlLogger.logMetrics({ 
      message: `🔍 Scanning ${config.collections.length} collections on ${config.marketplaces.join(", ")}`,
      collections: config.collections,
      marketplaces: config.marketplaces 
    });

    let signals: ArbitrageSignal[] = [];
    for (const collectionMint of config.collections) {
      for (const marketplace of config.marketplaces) {
        const listings = await fetchListings(collectionMint, marketplace);
        const bids = await fetchBids(collectionMint, marketplace);
        const cycleSignals = await scanForArbitrage(listings, bids, {
          minProfit: config.minProfitLamports,
          feeAdjustment: config.feeBufferLamports,
        });
        signals = signals.concat(cycleSignals);
      }
    }

    if (!signals || signals.length === 0) {
      pnlLogger.logMetrics({ message: "No arbitrage opportunities found this round." });
      return;
    }

    pnlLogger.logMetrics({ opportunitiesFound: signals.length, message: "📊 Found potential opportunities" });

    // Load previous trade history
    const active = await loadActiveOpportunities();

    // Execute new opportunities only
    const newSignals = signals.filter(s => !active.find(a => a.targetListing.mint === s.targetListing.mint));  // Dedup by mint

    for (const signal of newSignals) {
      if (runningTrades >= MAX_CONCURRENT_TRADES) {
        pnlLogger.logMetrics({ message: "⚠️ Max concurrent trades reached. Skipping new opportunities..." });
        break;
      }

      runningTrades++;

      executeFlashloanArbitrage(signal)  // Single, or use executeBatch for all
        .then(async (result) => {
          await updateTradeResult(signal, result);
          pnlLogger.logMetrics({ 
            message: `✅ Trade complete for ${signal.targetListing.mint} | Profit: ${result?.netProfit?.toNumber() / 1e9 || 0} SOL`,
            result 
          });
        })
        .catch((err) => {
          pnlLogger.logError(err, { mint: signal.targetListing.mint });
        })
        .finally(() => {
          runningTrades--;
        });
    }
  } catch (err) {
    pnlLogger.logError(err as Error, { cycle: 'processOpportunities' });
  }
}

// 🚀 Main bot loop
async function main() {
  pnlLogger.logMetrics({ 
    message: "🟢 NFT Arbitrage Bot started...",
    collections: config.collections.length,
    marketplaces: config.marketplaces.length,
    rpcUrl: config.rpcUrl 
  });

  // Initial scan
  await processOpportunities();

  // Repeated scans
  setInterval(processOpportunities, SCAN_INTERVAL_MS);
}

// Start the bot
main().catch((err) => {
  pnlLogger.logError(err, { cycle: 'startup' });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  pnlLogger.logMetrics({ message: "Shutting down gracefully..." });
  process.exit(0);
});
