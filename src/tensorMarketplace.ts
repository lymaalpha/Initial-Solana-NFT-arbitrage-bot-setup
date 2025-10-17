// src/tensorMarketplace.ts (FINAL CORRECTED VERSION)
import { Connection } from "@solana/web3.js";
import { findNftListings, findCollectionBids } from "@tensor-foundation/marketplace";
import BN from "bn.js";
import { NFTListing, NFTBid } from "./types";
import { config } from "./config";
import { pnlLogger } from "./pnlLogger";

// Initialize the connection using the RPC URL from your config
const connection = new Connection(config.rpcUrl, "confirmed");

/**
 * Fetches active listings for a collection directly from the blockchain
 * using the Tensor SDK's exported functions.
 */
export async function fetchListings(collectionId: string): Promise<NFTListing[]> {
  try {
    // Call the exported findNftListings function directly
    const listings = await findNftListings({
      connection,
      slug: collectionId,
    });

    const now = Date.now();
    // Map the response to your NFTListing type, WITHOUT assetMint
    return listings.map((listing) => ({
      mint: listing.mint.toBase58(),
      auctionHouse: "Tensor", // Set as 'Tensor' as per your types
      price: new BN(listing.price),
      currency: "SOL",
      timestamp: now,
      sellerPubkey: listing.seller.toBase58(),
    }));
  } catch (err) {
    pnlLogger.logError(err as Error, {
      message: `Tensor SDK fetchListings error for collection ${collectionId}`,
      source: "TensorSDK",
      collection: collectionId,
    });
    return [];
  }
}

/**
 * Fetches active bids for a collection directly from the blockchain
 * using the Tensor SDK's exported functions.
 */
export async function fetchBids(collectionId: string): Promise<NFTBid[]> {
  try {
    // Call the exported findCollectionBids function directly
    const bids = await findCollectionBids({
      connection,
      slug: collectionId,
    });

    const now = Date.now();
    // Map the response to your NFTBid type, WITHOUT assetMint
    return bids.map((bid) => ({
      mint: collectionId, // This is a collection bid
      auctionHouse: "Tensor", // Set as 'Tensor' as per your types
      price: new BN(bid.price),
      currency: "SOL",
      timestamp: now,
      bidderPubkey: bid.bidder.toBase58(),
    }));
  } catch (err) {
    pnlLogger.logError(err as Error, {
      message: `Tensor SDK fetchBids error for collection ${collectionId}`,
      source: "TensorSDK",
      collection: collectionId,
    });
    return [];
  }
}
