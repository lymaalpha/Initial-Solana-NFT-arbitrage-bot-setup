import { config } from "./config";
import { startOpportunityScanner } from "./scanner";
import { executeFlashloanArbitrage } from "./autoFlashloanExecutor";
import { loadActiveOpportunities, updateTradeResult } from "./store";
import logger from "./utils/logger";

// 🧠 Bot runtime constants
const SCAN_INTERVAL_MS = config.scanIntervalMs;
const MAX_CONCURRENT_TRADES = config.maxConcurrentTrades;

let runningTrades = 0;

async function processOpportunities() {
  try {
    logger.info(`🔍 Scanning ${config.COLLECTIONS.length} collections on ${config.MARKETPLACES.join(", ")}`);

    // 1️⃣ Scan for opportunities across all collections & marketplaces
    const opportunities = await startOpportunityScanner(config.COLLECTIONS, config.MARKETPLACES);

    if (!opportunities || opportunities.length === 0) {
      logger.debug("No arbitrage opportunities found this round.");
      return;
    }

    // 2️⃣ Load previous trade history
    const active = await loadActiveOpportunities();

    // 3️⃣ Execute new opportunities only
    for (const opp of opportunities) {
      if (runningTrades >= MAX_CONCURRENT_TRADES) {
        logger.warn("⚠️ Max concurrent trades reached. Skipping new opportunities...");
        break;
      }

      const alreadyTraded = active.find((a) => a.opportunityId === opp.opportunityId);
      if (alreadyTraded) continue;

      runningTrades++;

      executeFlashloanArbitrage(opp)
        .then(async (result) => {
          await updateTradeResult(opp, result);
          logger.info(`✅ Trade complete for ${opp.collectionName} | Profit: ${result?.profitSol || 0} SOL`);
        })
        .catch((err) => {
          logger.error(`❌ Trade failed for ${opp.collectionName}: ${err}`);
        })
        .finally(() => {
          runningTrades--;
        });
    }
  } catch (err) {
    logger.error("Error in processOpportunities:", err);
  }
}

// 🚀 Main bot loop
async function main() {
  logger.info("🟢 NFT Arbitrage Bot started...");
  logger.info(`Monitoring ${config.COLLECTIONS.length} collections on ${config.MARKETPLACES.length} marketplaces.`);
  logger.info(`Using RPC: ${config.rpcUrl}`);

  // Initial scan
  await processOpportunities();

  // Repeated scans
  setInterval(processOpportunities, SCAN_INTERVAL_MS);
}

// Start the bot
main().catch((err) => {
  logger.error("Fatal startup error:", err);
  process.exit(1);
});
