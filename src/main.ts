import { startOpportunityScanner } from "./scanner";
import { executeFlashloanArbitrage } from "./autoFlashloanExecutor";
import { loadActiveOpportunities, updateTradeResult } from "./store";
import logger from "./utils/logger";

// Bot runtime settings
const SCAN_INTERVAL_MS = 10_000; // 10 seconds between scans
const MAX_CONCURRENT_TRADES = 2;

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

async function runBot() {
  logger.info("🚀 Flashloan Arbitrage Bot starting up...");
  while (true) {
    const startTime = Date.now();
    try {
      logger.info("🔍 Starting new scan cycle...");
      const opportunities = await loadActiveOpportunities();

      if (!opportunities || opportunities.length === 0) {
        logger.info("⚠️ No opportunities found in store. Skipping execution cycle.");
      } else {
        logger.info(`📊 Found ${opportunities.length} potential opportunities`);

        const liveSignals = await startOpportunityScanner(opportunities);
        const topSignals = liveSignals
          .filter((s) => s.netProfit > 0)
          .sort((a, b) => b.netProfit - a.netProfit)
          .slice(0, MAX_CONCURRENT_TRADES);

        if (topSignals.length > 0) {
          logger.info(`✅ Executing top ${topSignals.length} signals...`);
          for (const signal of topSignals) {
            try {
              const result = await executeFlashloanArbitrage(signal);
              botStats.totalTrades++;
              botStats.totalProfit += result.netProfit;
              await updateTradeResult(signal.mint, result);
              logger.info(
                `💰 Trade complete | +${result.netProfit.toFixed(3)} ${result.currency} | Total: ${botStats.totalProfit.toFixed(3)} ${result.currency}`
              );
            } catch (err: any) {
              logger.error(`❌ Trade failed for ${signal.mint}: ${err.message}`);
            }
          }
        } else {
          logger.info("⚡ No profitable signals in this scan.");
        }
      }

      const cycleTime = (Date.now() - startTime) / 1000;
      botStats.lastScan = Date.now();
      logger.info(
        `📈 Cycle complete in ${cycleTime}s | Total Trades: ${botStats.totalTrades} | Total Profit: ${botStats.totalProfit.toFixed(
          3
        )} SOL`
      );
    } catch (err: any) {
      logger.error(`❌ Bot runtime error: ${err.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, SCAN_INTERVAL_MS));
  }
}

runBot().catch((err) => logger.error(`Fatal error: ${err.message}`));
