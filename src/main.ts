// src/main.ts
import { Connection, Keypair } from '@solana/web3.js';
import BN from 'bn.js';
import bs58 from 'bs58';
import { MultiMarketplaceDataFetcher, MarketplaceListing, MarketplaceBid } from './marketDataFetcher';
import { ArbitrageDetector } from './arbitrageDetector';
import { executeBatch } from './autoFlashloanExecutor';
import { pnlLogger } from './pnlLogger';
import { config } from './config';

// --- Setup connection and wallet ---
const connection = new Connection(config.rpcUrl, 'confirmed');
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

// --- Marketplace & collections setup ---
const heliusApiKey = process.env.HELIUS_API_KEY!;
const dataFetcher = new MultiMarketplaceDataFetcher(heliusApiKey, config.rpcUrl);

// Collections
const PRIMARY_COLLECTION = process.env.COLLECTION_MINT!;
const BACKUP_COLLECTIONS = (process.env.BACKUP_COLLECTIONS || '').split(',').filter(Boolean);
const TEST_COLLECTION = process.env.TEST_COLLECTION || '';

// --- Bot runtime config ---
const SCAN_INTERVAL_MS = config.scanIntervalMs || 5000;
const MIN_PROFIT_SOL = config.minProfitSol || 0.01;

// --- Bot stats ---
interface BotStats {
  totalProfit: number;
  totalTrades: number;
  lastScan: number;
}
const botStats: BotStats = { totalProfit: 0, totalTrades: 0, lastScan: 0 };

// --- Arbitrage detector ---
const arbitrageDetector = new ArbitrageDetector();

// --- Main bot loop ---
async function runBot() {
  pnlLogger.logMetrics({ message: '🚀 Flashloan Arbitrage Bot starting...' });

  while (true) {
    const startTime = Date.now();
    try {
      const collections = [PRIMARY_COLLECTION, ...BACKUP_COLLECTIONS];
      const signals: any[] = [];

      for (const collectionMint of collections) {
        // Fetch all listings and bids across marketplaces
        const [listings, bids] = await Promise.all([
          dataFetcher.fetchAllListings(collectionMint),
          dataFetcher.fetchAllBids(collectionMint)
        ]);

        // Detect arbitrage opportunities
        const opportunities = arbitrageDetector.detectOpportunities(listings, bids, MIN_PROFIT_SOL);
        signals.push(...opportunities);
      }

      // Sort by highest profit
      const topSignals = signals
        .sort((a, b) => b.profitSOL - a.profitSOL)
        .slice(0, 5); // Execute top 5 signals per scan

      if (topSignals.length > 0) {
        pnlLogger.logMetrics({ message: `🚀 Executing top ${topSignals.length} arbitrage signals...` });
        const trades = await executeBatch(topSignals);

        trades.forEach((trade) => {
          if (trade) {
            botStats.totalTrades++;
            botStats.totalProfit += trade.netProfit.toNumber() / 1e9;
            pnlLogger.logMetrics({
              message: `💰 Trade complete | +${(trade.netProfit.toNumber() / 1e9).toFixed(3)} SOL | Total: ${botStats.totalProfit.toFixed(3)} SOL`,
              trade,
            });
          }
        });
      } else {
        pnlLogger.logMetrics({ message: '⚡ No profitable signals this cycle.' });
      }

      botStats.lastScan = Date.now();
      pnlLogger.logMetrics({
        cycleTime: (Date.now() - startTime) / 1000,
        totalTrades: botStats.totalTrades,
        totalProfit: botStats.totalProfit,
        signalsFound: signals.length,
        message: '📈 Scan cycle complete',
      });
    } catch (err: any) {
      pnlLogger.logError(err, { cycle: 'main loop' });
    }

    await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
  }
}

// --- Graceful shutdown ---
process.on('SIGINT', () => {
  pnlLogger.logMetrics({
    message: `Shutting down | ${botStats.totalTrades} trades, ${botStats.totalProfit.toFixed(3)} SOL profit`,
    finalStats: botStats,
  });
  pnlLogger.close();
  process.exit(0);
});

// --- Start bot ---
runBot().catch((err) => {
  pnlLogger.logError(err);
  process.exit(1);
});
