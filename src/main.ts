// src/main.ts (DEBUG-ENHANCED VERSION)
import { Connection, Keypair } from "@solana/web3.js";
import { scanForArbitrage } from "./scanForArbitrage";
import { executeBatch } from "./autoFlashloanExecutor";
import { pnlLogger } from "./pnlLogger";
import { ArbitrageSignal } from "./types";
import BN from 'bn.js';
import bs58 from 'bs58';

// Import real API functions
import { fetchMagicEdenListings, fetchMagicEdenBids } from './magicEdenAPI';
import { fetchTensorListings, fetchTensorBids } from './tensorAPI';

const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || "10000"); // 10 seconds
const MAX_CONCURRENT_TRADES = parseInt(process.env.MAX_CONCURRENT_TRADES || "3");

let totalProfit = 0;
let totalTrades = 0;

// Collection mappings (Magic Eden symbol -> Tensor slug)
const COLLECTIONS = [
  { magicEden: 'mad_lads', tensor: 'madlads' },
  { magicEden: 'okay_bears', tensor: 'okay_bears' },
  { magicEden: 'degods', tensor: 'degods' },
];

async function runBot() {
  pnlLogger.logMetrics({ message: "🚀 Real Arbitrage Bot starting with live data..." });
  
  while (true) {
    const startTime = Date.now();
    try {
      pnlLogger.logMetrics({ message: "🔍 Starting scan with REAL marketplace data..." });
      
      let allSignals: ArbitrageSignal[] = [];

      for (const collection of COLLECTIONS) {
        try {
          // 🐛 DEBUG: Log collection being processed
          console.log(`\n=== 🧩 Fetching data for ${collection.magicEden} / ${collection.tensor} ===`);

          // Fetch from both marketplaces
          const [meListings, meBids, tensorListings, tensorBids] = await Promise.all([
            fetchMagicEdenListings(collection.magicEden),
            fetchMagicEdenBids(collection.magicEden),
            fetchTensorListings(collection.tensor),
            fetchTensorBids(collection.tensor),
          ]);

          // 🐛 DEBUG: Show quick summary of data counts
          console.log(`Fetched: ME(${meListings.length} listings, ${meBids.length} bids), Tensor(${tensorListings.length} listings, ${tensorBids.length} bids)`);

          // Cross-marketplace arbitrage: ME listings vs Tensor bids
          const meToTensorSignals = await scanForArbitrage(meListings, tensorBids);
          
          // Cross-marketplace arbitrage: Tensor listings vs ME bids  
          const tensorToMeSignals = await scanForArbitrage(tensorListings, meBids);

          allSignals = allSignals.concat(meToTensorSignals, tensorToMeSignals);

          pnlLogger.logMetrics({ 
            message: `📊 ${collection.magicEden}: ME(${meListings.length}L,${meBids.length}B) vs Tensor(${tensorListings.length}L,${tensorBids.length}B)` 
          });
        } catch (err) {
          console.error(`❌ Error processing ${collection.magicEden}:`, err);
        }
      }

      // 🐛 DEBUG: Total signals found in cycle
      console.log(`\n🧮 Total raw signals found: ${allSignals.length}`);

      if (allSignals.length === 0) {
        pnlLogger.logMetrics({ message: "⚠️ No arbitrage opportunities found in real data" });
      } else {
        pnlLogger.logMetrics({ message: `🎯 Found ${allSignals.length} REAL arbitrage opportunities!` });

        // Sort by profit and take top signals
        const topSignals = allSignals
          .filter((s) => s.estimatedNetProfit.gt(new BN(50000000))) // Min 0.05 SOL profit
          .sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber())
          .slice(0, MAX_CONCURRENT_TRADES);

        // 🐛 DEBUG: Print filtered signals
        console.log(`📈 ${topSignals.length} signals passed profit threshold.`);

        if (topSignals.length > 0) {
          pnlLogger.logMetrics({ message: `🚀 Executing ${topSignals.length} profitable trades...` });
          
          // Log potential profits
          topSignals.forEach((signal, i) => {
            const profit = signal.estimatedNetProfit.toNumber() / 1e9;
            const buyPrice = signal.targetListing.price.toNumber() / 1e9;
            const sellPrice = signal.targetBid.price.toNumber() / 1e9;
            
            pnlLogger.logMetrics({ 
              message: `💰 Trade ${i + 1}: Buy ${buyPrice.toFixed(3)} SOL → Sell ${sellPrice.toFixed(3)} SOL = +${profit.toFixed(3)} SOL profit` 
            });
          });

          const trades = await executeBatch(topSignals);

          trades.forEach(trade => {
            if (trade) {
              totalTrades++;
              const profit = trade.netProfit.toNumber() / 1e9;
              totalProfit += profit;
              pnlLogger.logMetrics({ 
                message: `✅ Trade executed | +${profit.toFixed(3)} SOL | Total: ${totalProfit.toFixed(3)} SOL` 
              });
            }
          });
        } else {
          pnlLogger.logMetrics({ message: "⚡ No trades met minimum profit threshold (0.05 SOL)" });
        }
      }

      const cycleTime = (Date.now() - startTime) / 1000;
      pnlLogger.logMetrics({
        cycleTime,
        totalTrades,
        totalProfit: parseFloat(totalProfit.toFixed(3)),
        signalsFound: allSignals.length,
        message: "📈 Real data cycle complete"
      });

      // 🐛 DEBUG: End of cycle marker
      console.log(`\n🌀 Cycle completed in ${cycleTime}s | Trades: ${totalTrades} | Profit: ${totalProfit.toFixed(3)} SOL\n`);
      
    } catch (err: unknown) {
      pnlLogger.logError(err as Error, { cycle: 'main loop' });
    }

    await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  pnlLogger.logMetrics({ 
    message: `🛑 Shutting down | ${totalTrades} trades, ${totalProfit.toFixed(3)} SOL profit` 
  });
  process.exit(0);
});

runBot().catch((err: unknown) => {
  pnlLogger.logError(err as Error);
  process.exit(1);
});
