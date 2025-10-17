// src/tensorMarketplace.ts (DIAGNOSTIC CODE)
import * as TensorSDK from "@tensor-foundation/marketplace";
import { pnlLogger } from "./pnlLogger";
import { NFTListing, NFTBid } from "./types";
import BN from "bn.js";

// Log the entire SDK to see what functions are actually available.
pnlLogger.logMetrics({
  message: "DIAGNOSTIC: Logging contents of Tensor SDK",
  sdkContents: Object.keys(TensorSDK),
});

// Return empty arrays to prevent the rest of the bot from crashing.
export async function fetchListings(collectionId: string): Promise<NFTListing[]> {
  pnlLogger.logMetrics({
    message: "Tensor fetchListings is in diagnostic mode.",
    collection: collectionId,
  });
  return [];
}

export async function fetchBids(collectionId: string): Promise<NFTBid[]> {
  pnlLogger.logMetrics({
    message: "Tensor fetchBids is in diagnostic mode.",
    collection: collectionId,
  });
  return [];
}
