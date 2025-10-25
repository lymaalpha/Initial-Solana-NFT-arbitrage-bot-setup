// src/raribleMarketplace.ts (FINAL - CORRECT BASE URL )
import axios from 'axios';
import BN from 'bn.js';
import { NFTListing, NFTBid, AuctionHouse } from './types';
import { pnlLogger } from './pnlLogger';

// CORRECTED: The base URL is .com, not .org
const RARIBLE_API_BASE = 'https://api.rarible.com';
const headers = {
  'Accept': 'application/json',
  'X-API-KEY': process.env.RARIBLE_API_KEY || '',
};

/**
 * Fetches active listings (sell orders ) for a collection.
 */
export async function fetchListings(collectionId: string): Promise<NFTListing[]> {
  const url = `${RARIBLE_API_BASE}/v0.1/orders/sell/by-collection`;
  try {
    const response = await axios.get(url, {
      params: {
        collection: collectionId,
        platform: 'SOLANA',
        status: 'ACTIVE',
        size: 50,
        sort: 'PRICE_ASC',
      },
      headers,
      timeout: 15000,
    });

    const listings: NFTListing[] = [];
    if (response.data?.orders) {
      for (const order of response.data.orders) {
        if (order.take?.value && order.make?.type?.contract && order.maker) {
          const price = new BN(order.take.value);
          const mint = order.make.type.contract.split(':')[1];
          listings.push({
            mint: mint,
            auctionHouse: 'Rarible',
            price: price,
            currency: 'SOL',
            timestamp: Date.parse(order.lastUpdatedAt),
            sellerPubkey: order.maker,
          });
        }
      }
    }
    return listings;
  } catch (err: any) {
    pnlLogger.logError(err, {
      message: `Rarible listings failed`,
      url: url, // Add URL to log for debugging
      collection: collectionId,
      error: err.response?.status || err.message,
    });
    return [];
  }
}

/**
 * Fetches active bids for a collection.
 */
export async function fetchBids(collectionId: string): Promise<NFTBid[]> {
  const url = `${RARIBLE_API_BASE}/v0.1/orders/bids/by-collection`;
  try {
    const response = await axios.get(url, {
      params: {
        collection: collectionId,
        platform: 'SOLANA',
        status: 'ACTIVE',
        size: 50,
        sort: 'PRICE_DESC',
      },
      headers,
      timeout: 15000,
    });

    const bids: NFTBid[] = [];
    if (response.data?.orders) {
      for (const order of response.data.orders) {
        if (order.make?.value && order.maker) {
          const price = new BN(order.make.value);
          bids.push({
            mint: collectionId,
            auctionHouse: 'Rarible',
            price: price,
            currency: 'SOL',
            timestamp: Date.parse(order.lastUpdatedAt),
            bidderPubkey: order.maker,
          });
        }
      }
    }
    return bids;
  } catch (err: any) {
    pnlLogger.logError(err, {
      message: `Rarible bids failed`,
      url: url, // Add URL to log for debugging
      collection: collectionId,
      error: err.response?.status || err.message,
    });
    return [];
  }
}
