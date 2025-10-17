// src/tensorMarketplace.ts (FINAL DIAGNOSTIC CODE)
import * as TensorSDK from "@tensor-foundation/marketplace";
import { NFTListing, NFTBid } from "./types";

// THIS IS THE ONLY THING THAT MATTERS.
// It will print the contents of the SDK directly to the log.
console.log("TENSOR_SDK_CONTENTS:", Object.keys(TensorSDK));

// Return empty arrays to prevent the rest of the bot from crashing.
export async function fetchListings(collectionId: string): Promise<NFTListing[]> {
  return [];
}

export async function fetchBids(collectionId: string): Promise<NFTBid[]> {
  return [];
}
