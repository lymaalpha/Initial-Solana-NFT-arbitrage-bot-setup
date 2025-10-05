import { Connection, Keypair } from "@solana/web3.js";
import { scanForArbitrage } from "./scanForArbitrage";
import { executeBatch } from "./autoFlashloanExecutor";  // Your batch function
import { pnlLogger } from "./pnlLogger";
import { config } from "./config";
import { ArbitrageSignal } from "./types";
import axios from 'axios';
import BN from 'bn.js';
import bs58 from 'bs58';  // For key decode

// Connection & payer from config
const connection = new Connection(config.rpcUrl, "confirmed");
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

// Runtime from config
const SCAN_INTERVAL_MS = config.scanIntervalMs;
const MAX_CONCURRENT_TRADES = config.minSignals;

// Stats (sync with pnlLogger for exact BN)
interface BotStats {
  totalProfit: number;
  totalTrades: number;
  lastScan: number;
}

const botStats: BotStats = {
  totalProfit: 0,
  totalTrades: 0,
  lastScan: 0,
};

// Stub for loadActiveOpportunities (single collection for now—expand to array)
async function loadActiveOpportunities(): Promise<string[]> {
  // If store/DB, load here; else single from config
  return [config.collectionMint];
}

// Stub for updateTradeResult (log to pnlLogger if no store)
async function updateTradeResult(mint: string, result: any): Promise<void> {
  // If store, update DB; else already logged
  pnlLogger.logMetrics({ updatedMint: mint, result });
}

// Real fetch from Magic Eden (listings)
async function fetchListings(collectionMint: string): Promise<any[]> {  // NFTListing[]
  try {
    const response = await axios.get(`https://api-mainnet.magiceden.dev/v2/collections/${collectionMint}/listings?offset=0&limit=50`);
    return response.data.map((item: any) => ({
      mint: item.tokenMint,
      auctionHouse: 'MagicEden',
      price: new BN(item.price * 1e9),  // Lamports
      assetMint: 'So11111111111111111111111111111111111111112',  // WSOL
      currency: 'SOL',
      timestamp: Date.now(),
    }));
  } catch (err) {
    pnlLogger.logError(err as Error, { collectionMint });
    return [];
  }
}

// Real fetch from Tensor (bids)
async function fetchBids(collectionMint: string): Promise<any[]> {  // NFTBid[]
  try {
    const response = await axios.get(`https://api.tensor.trade/v1/collections/${collectionMint}/bids?limit=50`);
    return response.data.map((item: any) => ({
      mint: item.mint,
      auctionHouse: 'Tensor',
      price: new BN(item.price * 1e9),
      assetMint: 'So11111111111111111111111111111111111111112',
      currency: 'SOL',
      timestamp: Date.now(),
    }));
  } catch (err) {
    pnlLogger.logError(err as Error, { collectionMint });
    return [];
  }
}

async function runBot() {
  pnlLogger.logInfo("🚀 Flashloan Arbitrage Bot starting up...");
  
  while (true) {
    const startTime = Date.now();
    try {
      pnlLogger.logInfo("🔍 Starting new scan cycle...");
      const opportunities = await loadActiveOpportunities();  // Collections

      let signals: ArbitrageSignal[] = [];
      for (const collectionMint of opportunities) {
        pnlLogger.logInfo(`📊 Fetching listings for collection: ${collectionMint}`);
        const listings = await fetchListings(collectionMint);
        pnlLogger.logInfo(`📊 Fetching bids for collection: ${collectionMint}`);
        const bids = await fetchBids(collectionMint);
        const cycleSignals = await scanForArbitrage(listings, bids, {
          minProfit: config.minProfitLamports,
          feeAdjustment: config.feeBufferLamports,
        });
        signals = signals.concat(cycleSignals);
      }

      if (signals.length === 0) {
        pnlLogger.logInfo("⚠️ No opportunities found. Skipping execution cycle.");
      } else {
        pnlLogger.logInfo(`✅ Found ${signals.length} arbitrage signals!`);

        // Sort by net profit desc
        const topSignals = signals
          .filter((s) => s.estimatedNetProfit.gt(new BN(0)))
          .sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber())
          .slice(0, MAX_CONCURRENT_TRADES);

        if (topSignals.length > 0) {
          pnlLogger.logInfo(`🚀 Executing top ${topSignals.length} signals...`);
          const trades = await executeBatch(topSignals);  // Your batch func

          trades.forEach(trade => {
            if (trade) {
              botStats.totalTrades++;
              botStats.totalProfit += trade.netProfit.toNumber() / 1e9;
              updateTradeResult(trade.mint, trade);
              pnlLogger.logInfo(
                `💰 Trade complete | +${trade.netProfit.toNumber() / 1e9} SOL | Total: ${botStats.totalProfit.toFixed(3)} SOL`
              );
            }
          });
        } else {
          pnlLogger.logInfo("⚡ No profitable signals in this scan.");
        }
      }

      const cycleTime = (Date.now() - startTime) / 1000;
      botStats.lastScan = Date.now();
      pnlLogger.logMetrics({
        cycleTime,
        totalTrades: botStats.totalTrades,
        totalProfit: botStats.totalProfit,
        signalsFound: signals.length,
      });
    } catch (err: any) {
      pnlLogger.logError(err, { cycle: 'main loop' });
    }

    await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  pnlLogger.logInfo(`Shutting down | Final Stats: ${botStats.totalTrades} trades, ${botStats.totalProfit.toFixed(3)} SOL profit`);
  pnlLogger.close();
  process.exit(0);
});

runBot().catch((err) => {
  pnlLogger.logError(err);
  process.exit(1);
});
