// src/simpleHashMarketplace.ts
import BN from 'bn.js';
import axios from 'axios';
import { NFTListing, NFTBid } from './types';
import { config } from './config'; // Assuming config has simpleHashApiKey
import { pnlLogger } from './pnlLogger';

const API_BASE_URL = 'https://api.simplehash.com/api/v0/nfts';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'X-API-KEY': config.simpleHashApiKey, // Make sure to add this key to your config.ts
  },
} );

/**
 * Fetches active listings (asks) for a collection from SimpleHash.
 * SimpleHash aggregates data from multiple marketplaces.
 */
export async function fetchListings(collectionId: string): Promise<NFTListing[]> {
  try {
    // The endpoint for collection listings
    const response = await api.get(`/listings/collection/${collectionId}`, {
      params: {
        // You can add more params here if needed, e.g., limit
        limit: 50,
      },
    });

    const now = Date.now();
    const listings: NFTListing[] = response.data.listings.map((item: any) => ({
      mint: item.nft_id.split('/')[2], // Extract mint from 'solana/{mint}/0'
      auctionHouse: item.marketplace_id, // e.g., 'tensor', 'magiceden'
      price: new BN(item.price), // Price is already in lamports (as a string)
      assetMint: item.nft_id.split('/')[2],
      currency: 'SOL',
      timestamp: now,
      sellerPubkey: item.seller_address,
    }));

    return listings;
  } catch (err) {
    pnlLogger.logError(err as Error, {
      message: `SimpleHash fetchListings error for collection ${collectionId}`,
      source: 'SimpleHash',
      collection: collectionId,
    });
    return [];
  }
}

/**
 * Fetches active bids (offers) for a collection from SimpleHash.
 * This provides the crucial bid data that was missing.
 */
export async function fetchBids(collectionId: string): Promise<NFTBid[]> {
  try {
    // The endpoint for collection bids
    const response = await api.get(`/bids/collection/${collectionId}`, {
      params: {
        limit: 50,
      },
    });

    const now = Date.now();
    const bids: NFTBid[] = response.data.bids.map((item: any) => ({
      // Note: Collection bids don't have a specific mint, so we can use the collectionId
      // or a placeholder. For arbitrage, the bid applies to any NFT in the collection.
      mint: collectionId, 
      auctionHouse: item.marketplace_id,
      price: new BN(item.price), // Price is in lamports
      assetMint: 'So11111111111111111111111111111111111111112', // Standard for SOL bids
      currency: 'SOL',
      timestamp: now,
      bidderPubkey: item.bidder_address,
    }));

    return bids;
  } catch (err) {
    pnlLogger.logError(err as Error, {
      message: `SimpleHash fetchBids error for collection ${collectionId}`,
      source: 'SimpleHash',
      collection: collectionId,
    });
    return [];
  }
}
