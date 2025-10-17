// src/simpleHashMarketplace.ts
import BN from 'bn.js';
import axios from 'axios';
import { NFTListing, NFTBid } from './types';
import { config } from './config';
import { pnlLogger } from './pnlLogger';

const API_BASE_URL = 'https://api.simplehash.com/api/v0/nfts';

// Create an axios instance with headers and a timeout
const api = axios.create({
  headers: {
    'X-API-KEY': config.simpleHashApiKey,
  },
  timeout: 10000, // 10-second timeout
} );

export async function fetchListings(collectionId: string): Promise<NFTListing[]> {
  // CORRECTED: Construct the full URL manually to avoid redirect issues
  const url = `${API_BASE_URL}/listings/collection/${collectionId}`;
  try {
    const response = await api.get(url, {
      params: {
        limit: 50,
      },
    });

    const now = Date.now();
    // The actual data is in response.data.listings
    return response.data.listings.map((item: any) => ({
      mint: item.nft_id.split('/')[1], // 'solana/{mint}'
      auctionHouse: item.marketplace_id,
      price: new BN(item.price), // Price is already a string of lamports
      assetMint: item.nft_id.split('/')[1],
      currency: 'SOL',
      timestamp: now,
      sellerPubkey: item.seller_address,
    }));
  } catch (err) {
    pnlLogger.logError(err as Error, {
      message: `SimpleHash fetchListings error for collection ${collectionId}`,
      source: 'SimpleHash',
      collection: collectionId,
    });
    return [];
  }
}

export async function fetchBids(collectionId: string): Promise<NFTBid[]> {
  // CORRECTED: Construct the full URL manually
  const url = `${API_BASE_URL}/bids/collection/${collectionId}`;
  try {
    const response = await api.get(url, {
      params: {
        limit: 50,
      },
    });

    const now = Date.now();
    // The actual data is in response.data.bids
    return response.data.bids.map((item: any) => ({
      mint: collectionId, // Collection bid
      auctionHouse: item.marketplace_id,
      price: new BN(item.price), // Price is in lamports
      assetMint: 'So11111111111111111111111111111111111111112',
      currency: 'SOL',
      timestamp: now,
      bidderPubkey: item.bidder_address,
    }));
  } catch (err) {
    pnlLogger.logError(err as Error, {
      message: `SimpleHash fetchBids error for collection ${collectionId}`,
      source: 'SimpleHash',
      collection: collectionId,
    });
    return [];
  }
}
