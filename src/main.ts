// src/main.ts (✅ FIXED: Separate listings vs bids arrays)
import { Connection, Keypair } from "@solana/web3.js";
import { scanForArbitrage } from "./scanForArbitrage";
import { executeBatch } from "./autoFlashloanExecutor";
import { pnlLogger } from "./pnlLogger";
import { ArbitrageSignal, NFTBid, NFTListing } from "./types";
import { config } from "./config";
import BN from 'bn.js';
import bs58 from 'bs58';

// Import real API functions
import * as MagicEdenAPI from './magicEdenMarketplace';
import * as TensorAPI from './tensorMarketplace';
import * as MoralisAPI from './moralisMarketplace';

let totalProfit = 0;
let totalTrades = 0;
let cycleCount = 0;

// Collection mappings
const COLLECTIONS = [
  {
    name: 'Mad Lads',
    magicEden: 'mad_lads',
    tensor: 'DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6WK3GChEySUpHSS4x',
    moralis: 'DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6WK3GChEySUpHSS4x'
  },
  {
    name: 'Okay Bears',
    magicEden: 'okay_bears',
    tensor: 'BUjZjAS2vbbb65g7Z1Ca9ZRVYoJscURG5L3AkVvHP9ac',
    moralis: 'BUjZjAS2vbbb65g7Z1Ca9ZRVYoJscURG5L3AkVvHP9ac'
  },
  {
    name: 'DeGods',
    magicEden: 'degods',
    tensor: '6XxjKYFbcndh2gDcsUrmZgVEsoDxXMnfsaGY6fpTJzNr',
    moralis: '6XxjKYFbcndh2gDcsUrmZgVEsoDxXMnfsaGY6fpTJzNr'
  },
];

// Enhanced fetch wrapper (UNCHANGED)
async function safeFetch<T>(
  fetchFn: () => Promise<T[]>,
  source: string,
  collection: string,
  type: 'listings' | 'bids'
): Promise<T[]> {
  const startTime = Date.now();
  try {
    pnlLogger.logMetrics({
      message: `🔄 Starting fetch: ${source} ${type} for ${collection}`,
      source, collection, type, status: 'starting'
    });

    const result = await fetchFn();
    const fetchTime = Date.now() - startTime;

    pnlLogger.logMetrics({
      message: `✅ Fetch successful: ${source} ${type} for ${collection} - ${result.length} items in ${fetchTime}ms`,
      source, collection, type, count: result.length, fetchTimeMs: fetchTime, status: 'success'
    });

    return result;
  } catch (err: any) {
    const fetchTime = Date.now() - startTime;
    const errorDetails = {
      message: `❌ Fetch failed: ${source} ${type} for ${collection}`,
      source, collection, type, fetchTimeMs: fetchTime, status: 'error',
      errorType: err.name || 'Unknown',
      errorMessage: err.message || 'Unknown error',
      statusCode: err.response?.status,
      statusText: err.response?.statusText,
      responseData: err.response?.data ? JSON.stringify(err.response.data).substring(0, 200) : undefined
    };
    pnlLogger.logError(err, errorDetails);
    return [];
  }
}

async function runBot() {
  // Health check Moralis
  try {
    const moralisHealthy = await MoralisAPI.healthCheck();
    pnlLogger.logMetrics({
      message: `Moralis API health: ${moralisHealthy ? '✅ Healthy' : '❌ Unhealthy'}`,
      moralisHealthy
    });
  } catch (err) {
    pnlLogger.logError(err as Error, { message: 'Moralis health check failed' });
  }

  pnlLogger.logMetrics({
    message: "🚀 Real Arbitrage Bot starting with live data...",
    collections: COLLECTIONS.map(c => c.name),
    dataSources: ['MagicEden', 'Tensor', 'Moralis (Aggregator)'],
    minProfitSOL: config.minProfitLamports.toNumber() / 1e9,
    scanIntervalMs: config.scanIntervalMs,
    simulateOnly: config.simulateOnly
  });

  while (true) {
    const startTime = Date.now();
    cycleCount++;

    try {
      pnlLogger.logMetrics({
        message: `🔍 Starting scan cycle #${cycleCount} with REAL marketplace data...`,
        cycle: cycleCount,
        timestamp: new Date().toISOString()
      });

      let allSignals: ArbitrageSignal[] = [];
      let totalItems = 0;

      for (const collection of COLLECTIONS) {
        try {
          pnlLogger.logMetrics({
            message: `📊 Processing collection: ${collection.name}`,
            collection: collection.name,
          });

          // ✅ FIXED: Separate listings and bids fetches
          const listingsPromises = [
            safeFetch(() => MagicEdenAPI.fetchListings(collection.magicEden), 'MagicEden', collection.name, 'listings'),
            safeFetch(() => TensorAPI.fetchListings(collection.tensor), 'Tensor', collection.name, 'listings'),
            safeFetch(() => MoralisAPI.fetchListings(collection.moralis), 'Moralis', collection.name, 'listings'),
          ] as const; // ✅ Type assertion for tuple

          const bidsPromises = [
            safeFetch(() => MagicEdenAPI.fetchBids(collection.magicEden), 'MagicEden', collection.name, 'bids'),
            safeFetch(() => TensorAPI.fetchBids(collection.tensor), 'Tensor', collection.name, 'bids'),
            safeFetch(() => MoralisAPI.fetchBids(collection.moralis), 'Moralis', collection.name, 'bids'),
          ] as const; // ✅ Type assertion for tuple

          // ✅ FIXED: Fetch listings and bids SEPARATELY
          const [meListings, tensorListings, moralisListings] = await Promise.all(listingsPromises);
          const [meBids, tensorBids, moralisBids] = await Promise.all(bidsPromises);

          // ✅ FIXED: Combine ONLY listings → NFTListing[]
          const allListings: NFTListing[] = [...meListings, ...tensorListings, ...moralisListings];
          
          // ✅ FIXED: Combine ONLY bids → NFTBid[]
          const allBids: NFTBid[] = [...meBids, ...tensorBids, ...moralisBids];
          
          totalItems += allListings.length + allBids.length;

          // Log collection summary
          pnlLogger.logMetrics({
            message: `📈 Collection ${collection.name} summary:`,
            collection: collection.name,
            magicEdenListings: meListings.length,
            magicEdenBids: meBids.length,
            tensorListings: tensorListings.length,
            tensorBids: tensorBids.length,
            moralisListings: moralisListings.length,
            moralisBids: moralisBids.length,
            totalListings: allListings.length,
            totalBids: allBids.length,
          });

          // ✅ FIXED: Pass PURE NFTListing[] and NFTBid[] to scanForArbitrage
          if (allListings.length > 0 && allBids.length > 0) {
            const signals = await scanForArbitrage(allListings, allBids);
            if (signals.length > 0) {
              pnlLogger.logMetrics({
                message: `💰 Found ${signals.length} arbitrage signals for ${collection.name}`,
                collection: collection.name,
                signalsFound: signals.length
              });
              allSignals = allSignals.concat(signals);
            }
          }

        } catch (err) {
          pnlLogger.logError(err as Error, {
            message: `Error processing collection ${collection.name}`,
            collection: collection.name
          });
        }
      }

      // Cycle summary
      pnlLogger.logMetrics({
        message: `📊 Scan cycle #${cycleCount} complete`,
        cycle: cycleCount,
        totalItemsScanned: totalItems,
        totalSignalsFound: allSignals.length,
      });

      if (allSignals.length > 0) {
        pnlLogger.logMetrics({
          message: `🎯 Found ${allSignals.length} TOTAL arbitrage opportunities!`,
          totalSignals: allSignals.length
        });

        // Filter and sort signals
        const minProfitThreshold = config.minProfitLamports;
        const topSignals = allSignals
          .filter((s) => s.estimatedNetProfit.gt(minProfitThreshold))
          .sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber())
          .slice(0, config.maxConcurrentTrades);

        if (topSignals.length > 0) {
          pnlLogger.logMetrics({
            message: `💎 Filtered to ${topSignals.length} signals above ${minProfitThreshold.toNumber() / 1e9} SOL profit`,
            filteredSignals: topSignals.length,
          });

          topSignals.forEach((signal, i) => {
            const profit = signal.estimatedNetProfit.toNumber() / 1e9;
            const buyPrice = signal.targetListing.price.toNumber() / 1e9;
            const sellPrice = signal.targetBid.price.toNumber() / 1e9;
            pnlLogger.logMetrics({
              message: `💰 Trade ${i + 1}: Buy @ ${signal.targetListing.auctionHouse} for ${buyPrice.toFixed(3)} -> Sell @ ${signal.targetBid.auctionHouse} for ${sellPrice.toFixed(3)} | Profit: +${profit.toFixed(3)} SOL`,
              mint: signal.targetListing.mint,
            });
          });

          if (!config.simulateOnly) {
            pnlLogger.logMetrics({ message: `🚀 Executing ${topSignals.length} profitable trades...` });
            const trades = await executeBatch(topSignals);
            trades.forEach((trade, i) => {
              if (trade) {
                totalTrades++;
                const profit = trade.netProfit.toNumber() / 1e9;
                totalProfit += profit;
                pnlLogger.logMetrics({
                  message: `✅ Trade ${i + 1} executed | +${profit.toFixed(3)} SOL | Total: ${totalProfit.toFixed(3)} SOL`,
                });
              } else {
                pnlLogger.logMetrics({ message: `❌ Trade ${i + 1} failed` });
              }
            });
          } else {
            pnlLogger.logMetrics({ message: "🔍 SIMULATION MODE: Trades not executed" });
          }
        } else {
          pnlLogger.logMetrics({ message: `⚡ No trades met minimum profit threshold.` });
        }
      } else {
        pnlLogger.logMetrics({ message: "⚠️ No arbitrage opportunities found in this cycle." });
      }

      const cycleTime = (Date.now() - startTime) / 1000;
      pnlLogger.logMetrics({
        message: "📈 Cycle complete",
        cycle: cycleCount,
        cycleTimeSeconds: cycleTime.toFixed(2),
        totalProfitSOL: parseFloat(totalProfit.toFixed(3)),
      });

    } catch (err: unknown) {
      pnlLogger.logError(err as Error, {
        message: 'Error in main bot loop',
        cycle: cycleCount
      });
    }

    pnlLogger.logMetrics({
      message: `⏳ Waiting ${config.scanIntervalMs / 1000}s before next scan...`,
    });
    await new Promise((resolve) => setTimeout(resolve, config.scanIntervalMs));
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  pnlLogger.logMetrics({
    message: `🛑 Shutting down | ${totalTrades} trades, ${totalProfit.toFixed(3)} SOL profit, ${cycleCount} cycles`,
  });
  process.exit(0);
});

// Start the bot
runBot().catch((err: unknown) => {
  pnlLogger.logError(err as Error, { message: 'Fatal error in bot startup' });
  process.exit(1);
});
