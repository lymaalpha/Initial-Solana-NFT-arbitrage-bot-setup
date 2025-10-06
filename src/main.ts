import { Connection, Keypair } from "@solana/web3.js";
import { scanForArbitrage } from "./scanForArbitrage";
import { executeFlashloanArbitrage } from "./autoFlashloanExecutor";  // Your single trade func
import { pnlLogger } from "./pnlLogger";  // For logs/metrics
import { config } from "./config";
import { ArbitrageSignal } from "./types";
import BN from 'bn.js';
import bs58 from 'bs58';
import { fetchListings } from './heliusMarketplace';  // Your Helius listings
import { fetchBids } from './tensorMarketplace';  // Your Tensor bids (assume similar to Helius)

const connection = new Connection(config.rpcUrl, "confirmed");
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

const SCAN_INTERVAL_MS = config.scanIntervalMs;
const MAX_CONCURRENT_TRADES = config.maxConcurrentTrades;

let runningTrades = 0;

async function loadActiveOpportunities(): Promise<ArbitrageSignal[]> {
  // Stub: Load from store/DB if you have one (e.g., Redis/SQLite for dedup)
  // For now, return empty for fresh runs—expand as needed
  return [];
}

async function updateTradeResult(signal: ArbitrageSignal, result: any): Promise<void> {
  // Stub: Save to store/DB if you have one
  // For now, log to pnlLogger
  pnlLogger.logMetrics({ updatedMint: signal.targetListing.mint, result });
}

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
        const listings = await fetchListings(collectionMint);  // Your Helius func
        const bids = await fetchBids(collectionMint);  // Your Tensor func
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

      executeFlashloanArbitrage(signal)  // Your single trade func
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

main().catch((err) => {
  pnlLogger.logError(err, { cycle: 'startup' });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  pnlLogger.logMetrics({ message: "Shutting down gracefully..." });
  process.exit(0);
});
