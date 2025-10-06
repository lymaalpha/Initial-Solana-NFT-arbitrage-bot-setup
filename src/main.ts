import { Connection, Keypair } from '@solana/web3.js';
import { scanForArbitrage } from './scanForArbitrage';
import { executeFlashloanTrade } from './autoFlashloanExecutor';  // Fixed name
import { pnlLogger } from './pnlLogger';
import { config } from './config';
import { ArbitrageSignal, TradeLog } from './types';  // Added TradeLog
import BN from 'bn.js';
import bs58 from 'bs58';

import { fetchListings } from './heliusMarketplace';
import { fetchBids } from './tensorMarketplace';

const connection = new Connection(config.rpcUrl, 'confirmed');
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

const SCAN_INTERVAL_MS = config.scanIntervalMs;
const MAX_CONCURRENT_TRADES = config.maxConcurrentTrades;  // Fixed property

interface BotStats {
  totalProfit: number;
  totalTrades: number;
  lastScan: number;
}
const botStats: BotStats = { totalProfit: 0, totalTrades: 0, lastScan: 0 };

async function runBot() {
  pnlLogger.logMetrics({ message: '🚀 Flashloan Arbitrage Bot starting...' });

  while (true) {
    const startTime = Date.now();
    try {
      const opportunities = config.collections;  // Fixed: collections array
      let signals: ArbitrageSignal[] = [];

      for (const collectionMint of opportunities) {
        const listings = await fetchListings(collectionMint);
        const bids = await fetchBids(collectionMint);

        const cycleSignals = await scanForArbitrage(listings, bids);  // Fixed: 2 args

        signals = signals.concat(cycleSignals);
      }

      const topSignals = signals
        .filter((s) => s.estimatedNetProfit.gt(new BN(0)))
        .sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber())
        .slice(0, MAX_CONCURRENT_TRADES);

      if (topSignals.length > 0) {
        pnlLogger.logMetrics({ message: `🚀 Executing top ${topSignals.length} signals...` });
        const trades = await executeBatch(topSignals);  // Use batch

        trades.forEach((trade: TradeLog | null) => {  // Typed
          if (trade) {
            botStats.totalTrades++;
            botStats.totalProfit += trade.netProfit.toNumber()
