// src/main.ts (✅ FIXED: SimpleHash → Moralis)
import { Connection, Keypair } from "@solana/web3.js";
import { scanForArbitrage } from "./scanForArbitrage";
import { executeBatch } from "./autoFlashloanExecutor";
import { pnlLogger } from "./pnlLogger";
import { ArbitrageSignal, NFTBid, NFTListing } from "./types";
import { config } from "./config";
import BN from 'bn.js';
import bs58 from 'bs58';

// ✅ FIXED: Import Moralis instead of SimpleHash
import * as MagicEdenAPI from './magicEdenMarketplace';
import * as TensorAPI from './tensorMarketplace';
import * as MoralisAPI from './moralisMarketplace'; // ✅ CHANGED

let totalProfit = 0;
let totalTrades = 0;
let cycleCount = 0;

// ✅ FIXED: Collection mappings with moralis field
const COLLECTIONS = [
  {
    name: 'Mad Lads',
    magicEden: 'mad_lads',
    tensor: 'DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6WK3GChEySUpHSS4x',
    moralis: 'DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6WK3GChEySUpHSS4x' // ✅ CHANGED: simpleHash → moralis
  },
  {
    name: 'Okay Bears',
    magicEden: 'okay_bears',
    tensor: 'BUjZjAS2vbbb65g7Z1Ca9ZRVYoJscURG5L3AkVvHP9ac',
    moralis: 'BUjZjAS2vbbb65g7Z1Ca9ZRVYoJscURG5L3AkVvHP9ac' // ✅ CHANGED
  },
  {
    name: 'DeGods',
    magicEden: 'degods',
    tensor: '6XxjKYFbcndh2gDcsUrmZgVEsoDxXMnfsaGY6fpTJzNr',
    moralis: '6XxjKYFbcndh2gDcsUrmZgVEsoDxXMnfsaGY6fpTJzNr' // ✅ CHANGED
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
      source,
      collection,
      type,
      status: 'starting'
    });

    const result = await fetchFn();
    const fetchTime = Date.now() - startTime;

    pnlLogger.logMetrics({
      message: `✅ Fetch successful: ${source} ${type} for ${collection} - ${result.length} items in ${fetchTime}ms`,
      source,
      collection,
      type,
      count: result.length,
      fetchTimeMs: fetchTime,
      status: 'success'
    });

    return result;
  } catch (err: any) {
    const fetchTime = Date.now() - startTime;
    const errorDetails = {
      message: `❌ Fetch failed: ${source} ${type} for ${collection}`,
      source,
      collection,
      type,
      fetchTimeMs: fetchTime,
      status: 'error',
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
  // ✅ FIXED: Health check Moralis API
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
    dataSources: ['MagicEden', 'Tensor', 'Moralis (Aggregator)'], // ✅ CHANGED
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

          // ✅ FIXED: Use MoralisAPI instead of SimpleHashAPI
          const fetchPromises = [
            safeFetch(() => MagicEdenAPI.fetchListings(collection.magicEden), 'MagicEden', collection.name, 'listings'),
            safeFetch(() => MagicEdenAPI.fetchBids(collection.magicEden), 'MagicEden', collection.name, 'bids'),
            safeFetch(() => TensorAPI.fetchListings(collection.tensor), 'Tensor', collection.name, 'listings'),
            safeFetch(() => TensorAPI.fetchBids(collection.tensor), 'Tensor', collection.name, 'bids'),
            safeFetch(() => MoralisAPI.fetchListings(collection.moralis), 'Moralis', collection.name, 'listings'), // ✅ CHANGED
            safeFetch(() => MoralisAPI.fetchBids(collection.moralis), 'Moralis', collection.name, 'bids'),         // ✅ CHANGED
          ];

          // ✅ FIXED: Variable names (moralisListings instead of shListings)
          const [meListings, meBids, tensorListings, tensorBids, moralisListings, moralisBids] = await Promise.all(fetchPromises);

          const allListings: NFTListing[] = [...meListings, ...tensorListings, ...moralisListings]; // ✅ CHANGED
          const allBids: NFTBid[] = [...meBids, ...tensorBids, ...moralisBids]; // ✅ CHANGED
          totalItems += allListings.length + allBids.length;

          // ✅ FIXED: Metrics logging
          pnlLogger.logMetrics({
            message: `📈 Collection ${collection.name} summary:`,
            collection: collection.name,
            magicEdenListings: meListings.length,
            magicEdenBids: meBids.length,
            tensorListings: tensorListings.length,
            tensorBids: tensorBids.length,
            moralisListings: moralisListings.length, // ✅ CHANGED
            moralisBids: moralisBids.length,         // ✅ CHANGED
            totalListings: allListings.length,
            totalBids: allBids.length,
          });

          // Scan for arbitrage opportunities between the combined lists
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

      // Cycle summary (UNCHANGED)
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

        // Filter and sort signals (UNCHANGED)
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

// Graceful shutdown (UNCHANGED)
process.on('SIGINT', () => {
  pnlLogger.logMetrics({
    message: `🛑 Shutting down | ${totalTrades} trades, ${totalProfit.toFixed(3)} SOL profit, ${cycleCount} cycles`,
  });
  process.exit(0);
});

// Start the bot (UNCHANGED)
runBot().catch((err: unknown) => {
  pnlLogger.logError(err as Error, { message: 'Fatal error in bot startup' });
  process.exit(1);
});
