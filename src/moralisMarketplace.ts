// src/moralisMarketplace.ts
import axios from 'axios';
import BN from 'bn.js';
import { NFTListing, NFTBid } from './types';
import { config } from './config';
import { pnlLogger } from './pnlLogger';

const MORALIS_API_KEY = config.moralisApiKey;
const API_BASE_URL = 'https://deep-index.moralis.io/api/v2.2';

const api = axios.create({
  headers: {
    'x-api-key': MORALIS_API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

export async function fetchListings(collectionId: string): Promise<NFTListing[]> {
  if (!MORALIS_API_KEY) {
    pnlLogger.logError(new Error('MORALIS_API_KEY missing'), { source: 'Moralis', collection: collectionId });
    return [];
  }

  try {
    // Moralis NFT search endpoint for listings
    const response = await api.get(`${API_BASE_URL}/nft/search`, {
      params: {
        chain: 'solana',
        limit: 50,
        collection: collectionId,
      },
    });

    const now = Date.now();
    const listings: NFTListing[] = response.data.result
      .filter((item: any) => item.possible_spam === false && item.price)
      .map((item: any) => ({
        mint: item.token_id,
        auctionHouse: item.marketplace || 'moralis',
        price: new BN(item.price?.total_price || 0),
        assetMint: item.token_id,
        currency: 'SOL',
        timestamp: now,
        sellerPubkey: item.owner_of || '',
      }))
      .filter((listing: NFTListing) => listing.price.gt(new BN(0)));

    pnlLogger.logMetrics({
      message: `Moralis listings fetched`,
      collection: collectionId,
      count: listings.length,
      source: 'Moralis'
    });

    return listings;
  } catch (err: any) {
    pnlLogger.logError(err as Error, {
      message: `Moralis fetchListings failed for ${collectionId}`,
      collection: collectionId,
      source: 'Moralis',
      statusCode: err.response?.status,
      error: err.message
    });
    return [];
  }
}

export async function fetchBids(collectionId: string): Promise<NFTBid[]> {
  if (!MORALIS_API_KEY) {
    pnlLogger.logError(new Error('MORALIS_API_KEY missing'), { source: 'Moralis', collection: collectionId });
    return [];
  }

  try {
    // Moralis NFT trades endpoint (bids are recent trades/bids)
    const response = await api.get(`${API_BASE_URL}/nft/{address}/trades`, {
      params: {
        chain: 'solana',
        limit: 50,
      },
    });

    const now = Date.now();
    const bids: NFTBid[] = response.data.result
      .filter((item: any) => item.buyer && item.total_price)
      .map((item: any) => ({
        mint: collectionId, // Collection-level bids
        auctionHouse: item.marketplace || 'moralis',
        price: new BN(item.total_price || 0),
        assetMint: 'So11111111111111111111111111111111111111112',
        currency: 'SOL',
        timestamp: now,
        bidderPubkey: item.buyer || '',
      }))
      .filter((bid: NFTBid) => bid.price.gt(new BN(0)));

    pnlLogger.logMetrics({
      message: `Moralis bids fetched`,
      collection: collectionId,
      count: bids.length,
      source: 'Moralis'
    });

    return bids;
  } catch (err: any) {
    pnlLogger.logError(err as Error, {
      message: `Moralis fetchBids failed for ${collectionId}`,
      collection: collectionId,
      source: 'Moralis',
      statusCode: err.response?.status,
      error: err.message
    });
    return [];
  }
}
