import { startOpportunityScanner } from "./scanner";
import { executeFlashloanArbitrage } from "./autoFlashloanExecutor";
import { loadActiveOpportunities, updateTradeResult } from "./store";
import logger from "./utils/logger";

const SCAN_INTERVAL_MS = 10_000; // 10 seconds

// --- Safe fetch wrapper ---
async function safeFetch(fetchFn: () => Promise<any[]>, source: string, mint: string) {
  try {
    const result = await fetchFn();
    logger.info(`[FETCH] ${source} for ${mint}: ${result.length} items`);
    return result;
  } catch (err) {
    logger.error(`[ERROR] Failed fetch from ${source} for ${mint}: ${(err as Error).message}`);
    return [];
  }
}

// --- Main scan loop ---
async function runScanner() {
  const collections = loadActiveOpportunities(); // Array of collection mints
  for (const collection of collections) {
    const mint = collection.mint;

    // Fetch listings/bids safely
    const heliusListings = await safeFetch(
      () => startOpportunityScanner.fetchHeliusListings(mint),
      "HeliusListings",
      mint
    );
    const heliusBids = await safeFetch(
      () => startOpportunityScanner.fetchHeliusBids(mint),
      "HeliusBids",
      mint
    );
    const tensorListings = await safeFetch(
      () => startOpportunityScanner.fetchTensorListings(mint),
      "TensorListings",
      mint
    );
    const tensorBids = await safeFetch(
      () => startOpportunityScanner.fetchTensorBids(mint),
      "TensorBids",
      mint
    );

    // If nothing fetched, skip
    if (
      heliusListings.length === 0 &&
      heliusBids.length === 0 &&
      tensorListings.length === 0 &&
      tensorBids.length === 0
    ) {
      logger.warn(`[WARN] No data fetched for ${mint}, skipping arbitrage`);
      continue;
    }

    // Process arbitrage opportunities
    const signalsFound = startOpportunityScanner.findArbitrageSignals({
      heliusListings,
      heliusBids,
      tensorListings,
      tensorBids,
      mint,
    });

    logger.info(`[INFO] Signals found for ${mint}: ${signalsFound.length}`);

    // Execute if any
    for (const signal of signalsFound) {
      try {
        await executeFlashloanArbitrage(signal);
        updateTradeResult(signal, "success");
      } catch (err) {
        logger.error(`[ERROR] Failed execution for ${mint}: ${(err as Error).message}`);
        updateTradeResult(signal, "failed");
      }
    }
  }

  // Schedule next cycle
  setTimeout(runScanner, SCAN_INTERVAL_MS);
}

// --- Start scanner ---
logger.info("Starting NFT arbitrage bot...");
runScanner();
