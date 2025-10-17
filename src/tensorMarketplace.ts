// src/tensorMarketplace.ts
import { Connection } from "@solana/web3.js";
import { TensorMarketplace } from "@tensor-foundation/marketplace";
import BN from "bn.js";
import { NFTListing, NFTBid } from "./types";
import { config } from "./config";
import { pnlLogger } from "./pnlLogger";

// Initialize the connection using the RPC URL from your config
const connection = new Connection(config.rpcUrl, "confirmed");

// Initialize the Tensor Marketplace client
const marketplace = new TensorMarketplace({ connection });

/**
 * Fetches active listings for a collection directly from the blockchain
 * using the Tensor SDK.
 */
export async function fetchListings(collectionId: string): Promise<NFTListing[]> {
  try {
    // The SDK uses the collection mint address (which you already have)
    // It fetches "pools" which represent different types of listings.
    // We'll focus on the most common ones.
    const pools = await marketplace.getPools({
      slug: collectionId,
    });

    const now = Date.now();
    const listings: NFTListing[] = [];

    // Process single-listing pools (Taker-side)
    if (pools.taker.txs) {
      pools.taker.txs.forEach((item) => {
        listings.push({
          mint: item.mint,
          auctionHouse: "Tensor",
          price: new BN(item.grossAmount), // Price is in lamports
          assetMint: item.mint,
          currency: "SOL",
          timestamp: now,
          sellerPubkey: item.seller,
        });
      });
    }

    return listings;
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
 * using the Tensor SDK.
 */
export async function fetchBids(collectionId: string): Promise<NFTBid[]> {
  try {
    // Fetch collection-wide bids (Top bid and Bid-walls)
    const bids = await marketplace.getBids({
      slug: collectionId,
    });

    const now = Date.now();
    const allBids: NFTBid[] = [];

    // Process top bid if it exists
    if (bids.top) {
      allBids.push({
        mint: collectionId, // Collection bid
        auctionHouse: "Tensor",
        price: new BN(bids.top.price), // Price is in lamports
        assetMint: "So11111111111111111111111111111111111111112",
        currency: "SOL",
        timestamp: now,
        bidderPubkey: bids.top.bidder,
      });
    }

    // Process other bids (bid walls)
    if (bids.bids) {
      bids.bids.forEach((bid) => {
        allBids.push({
          mint: collectionId, // Collection bid
          auctionHouse: "Tensor",
          price: new BN(bid.price),
          assetMint: "So1111111111111111111111111111111111111111112",
          currency: "SOL",
          timestamp: now,
          bidderPubkey: bid.bidder,
        });
      });
    }

    return allBids;
  } catch (err) {
    pnlLogger.logError(err as Error, {
      message: `Tensor SDK fetchBids error for collection ${collectionId}`,
      source: "TensorSDK",
      collection: collectionId,
    });
    return [];
  }
}
