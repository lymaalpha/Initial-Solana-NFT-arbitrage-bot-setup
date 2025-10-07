// src/main.ts (FIXED VERSION WITH CORRECT IMPORTS)
import { Connection, Keypair } from "@solana/web3.js";
import { scanForArbitrage } from "./scanForArbitrage";
import { executeBatch } from "./autoFlashloanExecutor";
import { pnlLogger } from "./pnlLogger";
import { ArbitrageSignal } from "./types";
import { config } from "./config";
import BN from 'bn.js';
import bs58 from 'bs58';

// Import real API functions using your actual file structure
import * as MagicEdenAPI from './magicEdenMarketplace';
import * as TensorAPI from './tensorMarketplace';
import * as HeliusAPI from './heliusMarketplace';

let totalProfit = 0;
let totalTrades = 0;
let cycleCount = 0;

// Collection mappings - you'll need to update these with your actual collection identifiers
const COLLECTIONS = [
  { 
    name: 'Mad Lads',
    magicEden: 'mad_lads',  // Magic Eden uses symbols
    tensor: 'DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6WK3GChEySUpHSS4x',  // Tensor uses collection mint
    helius: 'DRiP2Pn2K6fuMLKQmt5rZWyHiUZ6WK3GChEySUpHSS4x'   // Helius uses collection mint
  },
  { 
    name: 'Okay Bears',
    magicEden: 'okay_bears',
    tensor: 'BUjZjAS2vbbb65g7Z1Ca9ZRVYoJscURG5L3AkVvHP9ac',
    helius: 'BUjZjAS2vbbb65g7Z1Ca9ZRVYoJscURG5L3AkVvHP9ac'
  },
  { 
    name: 'DeGods',
    magicEden: 'degods',
    tensor: '6XxjKYFbcndh2gDcsUrmZgVEsoDxXMnfsaGY6fpTJzNr',
    helius: '6XxjKYFbcndh2gDcsUrmZgVEsoDxXMnfsaGY6fpTJzNr'
  },
];

// Enhanced fetch wrapper with detailed debugging
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
    
    // Enhanced error logging with more details
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
    
    // Log specific error types for easier debugging
    if (err.response?.status === 429) {
      pnlLogger.logMetrics({ 
        message: `🚫 Rate limited by ${source} for ${collection} ${type}`,
        source,
        collection,
        type,
        rateLimited: true
      });
    } else if (err.response?.status === 401 || err.response?.status === 403) {
      pnlLogger.logMetrics({ 
        message: `🔐 Authentication failed for ${source} ${type}`,
        source,
        collection,
        type,
        authFailed: true
      });
    } else if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      pnlLogger.logMetrics({ 
        message: `⏰ Timeout for ${source} ${type} for ${collection}`,
        source,
        collection,
        type,
        timeout: true
      });
    }
    
    return [];
  }
}

async function runBot() {
  pnlLogger.logMetrics({ 
    message: "🚀 Real Arbitrage Bot starting with live data...",
    collections: COLLECTIONS.map(c => c.name),
    totalCollections: COLLECTIONS.length,
    minProfitSOL: config.minProfitLamports.toNumber() / 1e9,
    scanIntervalMs: config.scanIntervalMs,
    maxConcurrentTrades: config.maxConcurrentTrades,
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
      let totalFetches = 0;
      let successfulFetches = 0;
      let totalItems = 0;

      for (const collection of COLLECTIONS) {
        try {
          pnlLogger.logMetrics({ 
            message: `📊 Processing collection: ${collection.name}`,
            collection: collection.name,
            magicEden: collection.magicEden,
            tensor: collection.tensor,
            helius: collection.helius
          });

          // Fetch from all three marketplaces with detailed logging
          const fetchPromises = [
            safeFetch(() => MagicEdenAPI.fetchListings(collection.magicEden), 'MagicEden', collection.name, 'listings'),
            safeFetch(() => MagicEdenAPI.fetchBids(collection.magicEden), 'MagicEden', collection.name, 'bids'),
            safeFetch(() => TensorAPI.fetchListings(collection.tensor), 'Tensor', collection.name, 'listings'),
            safeFetch(() => TensorAPI.fetchBids(collection.tensor), 'Tensor', collection.name, 'bids'),
            safeFetch(() => HeliusAPI.fetchListings(collection.helius), 'Helius', collection.name, 'listings'),
            safeFetch(() => HeliusAPI.fetchBids(collection.helius), 'Helius', collection.name, 'bids'),
          ];

          const [meListings, meBids, tensorListings, tensorBids, heliusListings, heliusBids] = await Promise.all(fetchPromises);
          
          totalFetches += 6;
          successfulFetches += [meListings, meBids, tensorListings, tensorBids, heliusListings, heliusBids]
            .filter(result => result.length > 0).length;
          
          const collectionTotal = meListings.length + meBids.length + tensorListings.length + 
                                tensorBids.length + heliusListings.length + heliusBids.length;
          totalItems += collectionTotal;

          // Log collection summary
          pnlLogger.logMetrics({ 
            message: `📈 Collection ${collection.name} summary:`,
            collection: collection.name,
            magicEdenListings: meListings.length,
            magicEdenBids: meBids.length,
            tensorListings: tensorListings.length,
            tensorBids: tensorBids.length,
            heliusListings: heliusListings.length,
            heliusBids: heliusBids.length,
            totalItems: collectionTotal
          });

          // Cross-marketplace arbitrage opportunities
          const arbitrageChecks = [
            { name: 'ME→Tensor', listings: meListings, bids: tensorBids },
            { name: 'ME→Helius', listings: meListings, bids: heliusBids },
            { name: 'Tensor→ME', listings: tensorListings, bids: meBids },
            { name: 'Tensor→Helius', listings: tensorListings, bids: heliusBids },
            { name: 'Helius→ME', listings: heliusListings, bids: meBids },
            { name: 'Helius→Tensor', listings: heliusListings, bids: tensorBids },
          ];

          for (const check of arbitrageChecks) {
            if (check.listings.length > 0 && check.bids.length > 0) {
              const signals = await scanForArbitrage(check.listings, check.bids);
              if (signals.length > 0) {
                pnlLogger.logMetrics({ 
                  message: `💰 Found ${signals.length} arbitrage signals for ${collection.name} (${check.name})`,
                  collection: collection.name,
                  arbitrageType: check.name,
                  signalsFound: signals.length
                });
                allSignals = allSignals.concat(signals);
              }
            } else {
              pnlLogger.logMetrics({ 
                message: `⚪ No arbitrage check for ${collection.name} (${check.name}) - listings: ${check.listings.length}, bids: ${check.bids.length}`,
                collection: collection.name,
                arbitrageType: check.name,
                listingsCount: check.listings.length,
                bidsCount: check.bids.length,
                reason: 'insufficient_data'
              });
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
        totalFetches,
        successfulFetches,
        totalItems,
        totalSignals: allSignals.length,
        fetchSuccessRate: totalFetches > 0 ? (successfulFetches / totalFetches * 100).toFixed(1) + '%' : '0%'
      });

      if (allSignals.length === 0) {
        pnlLogger.logMetrics({ 
          message: "⚠️ No arbitrage opportunities found in real data",
          totalItemsScanned: totalItems,
          reason: totalItems === 0 ? 'No data fetched from any source' : 'No profitable opportunities found'
        });
      } else {
        pnlLogger.logMetrics({ 
          message: `🎯 Found ${allSignals.length} REAL arbitrage opportunities!`,
          totalSignals: allSignals.length
        });

        // Sort by profit and take top signals
        const minProfitThreshold = config.minProfitLamports;
        const topSignals = allSignals
          .filter((s) => s.estimatedNetProfit.gt(minProfitThreshold))
          .sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber())
          .slice(0, config.maxConcurrentTrades);

        pnlLogger.logMetrics({ 
          message: `💎 Filtered to ${topSignals.length} signals above minimum profit threshold`,
          totalSignals: allSignals.length,
          filteredSignals: topSignals.length,
          minProfitSOL: minProfitThreshold.toNumber() / 1e9
        });

        if (topSignals.length > 0) {
          pnlLogger.logMetrics({ 
            message: `🚀 ${config.simulateOnly ? 'Simulating' : 'Executing'} ${topSignals.length} profitable trades...`,
            signalsToExecute: topSignals.length,
            simulateOnly: config.simulateOnly
          });
          
          // Log potential profits
          topSignals.forEach((signal, i) => {
            const profit = signal.estimatedNetProfit.toNumber() / 1e9;
            const buyPrice = signal.targetListing.price.toNumber() / 1e9;
            const sellPrice = signal.targetBid.price.toNumber() / 1e9;
            
            pnlLogger.logMetrics({ 
              message: `💰 Trade ${i + 1}: Buy ${buyPrice.toFixed(3)} SOL → Sell ${sellPrice.toFixed(3)} SOL = +${profit.toFixed(3)} SOL profit`,
              tradeIndex: i + 1,
              buyPrice: buyPrice.toFixed(3),
              sellPrice: sellPrice.toFixed(3),
              estimatedProfit: profit.toFixed(3),
              mint: signal.targetListing.mint
            });
          });

          if (!config.simulateOnly) {
            const trades = await executeBatch(topSignals);

            trades.forEach((trade, i) => {
              if (trade) {
                totalTrades++;
                const profit = trade.netProfit.toNumber() / 1e9;
                totalProfit += profit;
                pnlLogger.logMetrics({ 
                  message: `✅ Trade ${i + 1} executed | +${profit.toFixed(3)} SOL | Total: ${totalProfit.toFixed(3)} SOL`,
                  tradeIndex: i + 1,
                  profit: profit.toFixed(3),
                  totalProfit: totalProfit.toFixed(3),
                  totalTrades
                });
              } else {
                pnlLogger.logMetrics({ 
                  message: `❌ Trade ${i + 1} failed`,
                  tradeIndex: i + 1,
                  status: 'failed'
                });
              }
            });
          } else {
            pnlLogger.logMetrics({ 
              message: "🔍 SIMULATION MODE: Trades not executed",
              simulatedTrades: topSignals.length,
              simulatedProfit: topSignals.reduce((sum, s) => sum + s.estimatedNetProfit.toNumber() / 1e9, 0).toFixed(3)
            });
          }
        } else {
          pnlLogger.logMetrics({ 
            message: `⚡ No trades met minimum profit threshold (${minProfitThreshold.toNumber() / 1e9} SOL)`,
            minProfitSOL: minProfitThreshold.toNumber() / 1e9,
            signalsFound: allSignals.length
          });
        }
      }

      const cycleTime = (Date.now() - startTime) / 1000;
      pnlLogger.logMetrics({
        message: "📈 Real data cycle complete",
        cycle: cycleCount,
        cycleTimeSeconds: cycleTime.toFixed(2),
        totalTrades,
        totalProfitSOL: parseFloat(totalProfit.toFixed(3)),
        signalsFound: allSignals.length,
        itemsScanned: totalItems,
        avgItemsPerSecond: totalItems > 0 ? (totalItems / cycleTime).toFixed(1) : '0'
      });
      
    } catch (err: unknown) {
      pnlLogger.logError(err as Error, { 
        message: 'Error in main bot loop',
        cycle: cycleCount 
      });
    }

    // Wait before next cycle
    pnlLogger.logMetrics({ 
      message: `⏳ Waiting ${config.scanIntervalMs / 1000}s before next scan...`,
      nextScanIn: config.scanIntervalMs / 1000
    });
    
    await new Promise((resolve) => setTimeout(resolve, config.scanIntervalMs));
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  pnlLogger.logMetrics({ 
    message: `🛑 Shutting down | ${totalTrades} trades, ${totalProfit.toFixed(3)} SOL profit, ${cycleCount} cycles`,
    totalTrades,
    totalProfit: totalProfit.toFixed(3),
    totalCycles: cycleCount,
    avgProfitPerTrade: totalTrades > 0 ? (totalProfit / totalTrades).toFixed(3) : '0'
  });
  process.exit(0);
});

// Start the bot
runBot().catch((err: unknown) => {
  pnlLogger.logError(err as Error, { message: 'Fatal error in bot startup' });
  process.exit(1);
});
