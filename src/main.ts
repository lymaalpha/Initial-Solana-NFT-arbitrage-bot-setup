import { Connection, Keypair } from '@solana/web3.js';
import { scanForArbitrage } from './scanForArbitrage';
import { executeBatch } from './autoFlashloanExecutor';
import { pnlLogger } from './pnlLogger';
import { config } from './config';
import BN from 'bn.js';
import bs58 from 'bs58';
import { NFTListing, NFTBid } from './types';
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

// Load collection mint
async function loadActiveOpportunities(): Promise<string[]> {
  return [config.collectionMint];
}

// Fetch bids from Tensor using Helius
async function fetchBids(collectionMint: string): Promise<NFTBid[]> {
  const url = `https://api.helius.xyz/v0/collections/${collectionMint}/bids?api-key=${config.heliusApiKey}`;
  const resp = await axios.get(url);
  return resp.data.map((item: any) => ({
    mint: item.mint,
    auctionHouse: 'Tensor',
    price: new BN(item.price * 1e9),
    currency: 'SOL',
    timestamp: Date.now(),
    bidderPubkey: item.bidder,
  }));
}

async function runBot() {
  pnlLogger.logMetrics({ message: '🚀 NFT Arbitrage Bot starting...' });

  while (true) {
    const startTime = Date.now();
    try {
      const opportunities = await loadActiveOpportunities();
      let signals: any[] = [];

      for (const collectionMint of opportunities) {
        const bids = await fetchBids(collectionMint);
        const listings: NFTListing[] = bids.map(b => ({
          mint: b.mint,
          auctionHouse: 'Tensor',
          price: b.price,
          currency: 'SOL',
          timestamp: b.timestamp,
        }));

        const cycleSignals = await scanForArbitrage(listings, bids);
        signals = signals.concat(cycleSignals);
      }

      const topSignals = signals
        .filter(s => s.estimatedNetProfit.gt(new BN(0)))
        .sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber())
        .slice(0, MAX_CONCURRENT_TRADES);

      if (topSignals.length > 0) {
        pnlLogger.logMetrics({ message: `🚀 Executing top ${topSignals.length} signals...` });
        const trades = await executeBatch(topSignals);

        trades.forEach(trade => {
          if (trade) {
            botStats.totalTrades++;
            botStats.totalProfit += trade.netProfit.toNumber() / 1e9;
            pnlLogger.logMetrics({
              message: `💰 Trade complete | +${trade.netProfit.toNumber() / 1e9} SOL | Total: ${botStats.totalProfit.toFixed(
                3
              )} SOL`,
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

    await new Promise(resolve => setTimeout(resolve, SCAN_INTERVAL_MS));
  }
}

process.on('SIGINT', () => {
  pnlLogger.logMetrics({
    message: `Shutting down | ${botStats.totalTrades} trades, ${botStats.totalProfit.toFixed(3)} SOL profit`,
    finalStats: botStats,
  });
  pnlLogger.close();
  process.exit(0);
});

runBot().catch(err => {
  pnlLogger.logError(err);
  process.exit(1);
});
