import { Connection, Keypair } from '@solana/web3.js';
import BN from 'bn.js';
import bs58 from 'bs58';
import { scanForArbitrage } from './scanForArbitrage';
import { executeBatch } from './autoFlashloanExecutor';
import { pnlLogger } from './pnlLogger';
import { config } from './config';

// Tensor SDK
import { getBidsByCollection } from '@tensor-oss/tensorswap-sdk';

// Helius
import axios from 'axios';

const connection = new Connection(config.rpcUrl, 'confirmed');
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

const SCAN_INTERVAL_MS = config.scanIntervalMs;
const MAX_CONCURRENT_TRADES = config.minSignals;

interface BotStats {
  totalProfit: number;
  totalTrades: number;
  lastScan: number;
}
const botStats: BotStats = { totalProfit: 0, totalTrades: 0, lastScan: 0 };

// Load active collections
async function loadActiveOpportunities(): Promise<string[]> {
  return [config.collectionMint];
}

// Update trade results
async function updateTradeResult(mint: string, result: any): Promise<void> {
  pnlLogger.logMetrics({ updatedMint: mint, result });
}

// Fetch listings using Helius NFT API
async function fetchListings(collectionMint: string) {
  try {
    const resp = await axios.get(
      `https://api.helius.xyz/v0/addresses/${collectionMint}/nfts?api-key=${config.heliusApiKey}&limit=50`
    );

    return resp.data.map((item: any) => ({
      mint: item.mint,
      auctionHouse: 'Helius',
      price: new BN((item.price || 0) * 1e9),
      assetMint: item.mint,
      currency: 'SOL',
      timestamp: Date.now(),
    }));
  } catch (err) {
    pnlLogger.logError(err as Error, { collectionMint });
    return [];
  }
}

// Fetch bids using Tensor SDK
async function fetchBids(collectionMint: string) {
  try {
    const bidsRaw = await getBidsByCollection(collectionMint, { limit: 50 });
    return bidsRaw.map((b: any) => ({
      mint: b.mint,
      auctionHouse: 'Tensor',
      price: new BN(b.price * 1e9),
      assetMint: b.mint,
      currency: 'SOL',
      timestamp: Date.now(),
      bidderPubkey: b.buyer,
    }));
  } catch (err) {
    pnlLogger.logError(err as Error, { collectionMint });
    return [];
  }
}

// Main bot loop
async function runBot() {
  pnlLogger.logMetrics({ message: '🚀 Flashloan Arbitrage Bot starting...' });

  while (true) {
    const startTime = Date.now();
    try {
      const opportunities = await loadActiveOpportunities();
      let signals: any[] = [];

      for (const collectionMint of opportunities) {
        const listings = await fetchListings(collectionMint);
        const bids = await fetchBids(collectionMint);

        const cycleSignals = await scanForArbitrage(listings, bids, {
          minProfit: config.minProfitLamports,
          feeAdjustment: config.feeBufferLamports,
        });

        signals = signals.concat(cycleSignals);
      }

      const topSignals = signals
        .filter((s) => s.estimatedNetProfit.gt(new BN(0)))
        .sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber())
        .slice(0, MAX_CONCURRENT_TRADES);

      if (topSignals.length > 0) {
        pnlLogger.logMetrics({ message: `🚀 Executing top ${topSignals.length} signals...` });
        const trades = await executeBatch(topSignals);

        trades.forEach((trade) => {
          if (trade) {
            botStats.totalTrades++;
            botStats.totalProfit += trade.netProfit.toNumber() / 1e9;
            updateTradeResult(trade.mint, trade);
            pnlLogger.logMetrics({
              message: `💰 Trade complete | +${trade.netProfit.toNumber() / 1e9} SOL | Total: ${botStats.totalProfit.toFixed(3)} SOL`,
              trade,
            });
          }
        });
      } else {
        pnlLogger.logMetrics({ message: '⚡ No profitable signals in this scan.' });
      }

      botStats.lastScan = Date.now();
      pnlLogger.logMetrics({
        cycleTime: (Date.now() - startTime) / 1000,
        totalTrades: botStats.totalTrades,
        totalProfit: botStats.totalProfit,
        signalsFound: signals.length,
        message: '📈 Cycle complete',
      });
    } catch (err: any) {
      pnlLogger.logError(err, { cycle: 'main loop' });
    }

    await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  pnlLogger.logMetrics({
    message: `Shutting down | ${botStats.totalTrades} trades, ${botStats.totalProfit.toFixed(3)} SOL profit`,
    finalStats: botStats,
  });
  pnlLogger.close();
  process.exit(0);
});

runBot().catch((err) => {
  pnlLogger.logError(err);
  process.exit(1);
});
