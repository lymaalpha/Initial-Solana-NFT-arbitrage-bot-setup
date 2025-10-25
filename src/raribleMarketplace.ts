// src/raribleMarketplace.ts (FINAL - USING YOUR POST/SEARCH DISCOVERY)
import axios from 'axios';
import BN from 'bn.js';
import { NFTListing, NFTBid } from './types';
import { pnlLogger } from './pnlLogger';

// Using the correct domain you discovered
const RARIBLE_API_BASE = 'https://api.rarible.org';
const headers = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'X-API-KEY': process.env.RARIBLE_API_KEY || '',
};

// This function is now built entirely on your discovery.
async function searchRarible(collectionId: string, sort: 'PRICE_ASC' | 'PRICE_DESC' ): Promise<any[]> {
  const url = `${RARIBLE_API_BASE}/v0.1/items/search`;
  const data = {
    filter: {
      "@type": "by_collection",
      collection: collectionId,
    },
    size: 50,
    sort: sort,
  };

  try {
    const response = await axios.post(url, data, { headers, timeout: 15000 });
    return response.data?.items || [];
  } catch (err: any) {
    pnlLogger.logError(err, { message: `Rarible search failed`, url, collection: collectionId, error: err.response?.status });
    return [];
  }
}

export async function fetchListings(collectionId: string): Promise<NFTListing[]> {
  const items = await searchRarible(collectionId, 'PRICE_ASC');
  const listings: NFTListing[] = [];

  for (const item of items) {
    if (item.bestSellOrder?.take?.value && item.bestSellOrder?.maker) {
      listings.push({
        mint: item.id.split(':')[1],
        auctionHouse: 'Rarible',
        price: new BN(item.bestSellOrder.take.value),
        currency: 'SOL',
        timestamp: Date.parse(item.bestSellOrder.lastUpdatedAt),
        sellerPubkey: item.bestSellOrder.maker,
      });
    }
  }
  return listings;
}

export async function fetchBids(collectionId: string): Promise<NFTBid[]> {
  const items = await searchRarible(collectionId, 'PRICE_DESC'); // Bids are often on higher-value items
  const bids: NFTBid[] = [];

  for (const item of items) {
    if (item.bestBidOrder?.make?.value && item.bestBidOrder?.maker) {
      bids.push({
        mint: item.id.split(':')[1],
        auctionHouse: 'Rarible',
        price: new BN(item.bestBidOrder.make.value),
        currency: 'SOL',
        timestamp: Date.parse(item.bestBidOrder.lastUpdatedAt),
        bidderPubkey: item.bestBidOrder.maker,
      });
    }
  }
  
  // If no direct bids are found, use your brilliant fallback logic
  if (bids.length === 0) {
      pnlLogger.logMetrics({ message: "Rarible: No direct bids found, creating synthetic bids." });
      const listings = await fetchListings(collectionId);
      return listings.slice(0, 20).map(listing => ({
          ...listing,
          price: new BN(listing.price.muln(88).divn(100)), // 88% of listing price
          bidderPubkey: "synthetic_bidder",
      }));
  }
  
  return bids;
}
