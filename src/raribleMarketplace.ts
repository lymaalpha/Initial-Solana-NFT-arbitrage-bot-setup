// src/raribleMarketplace.ts - ✅ FIXED: Direct REST API (No SDK Issues)
import axios from 'axios';
import BN from 'bn.js';
import { NFTListing, NFTBid, AuctionHouse } from './types';
import { pnlLogger } from './pnlLogger';

const RARIBLE_API_BASE = 'https://api.rarible.com';
const RARIBLE_API_KEY = process.env.RARIBLE_API_KEY || '';

const headers = {
  'Accept': 'application/json',
  'X-API-Key': RARIBLE_API_KEY,
  'User-Agent': 'Solana-NFT-Bot/1.0'
};

// **FIX 1: Direct REST API for listings**
export async function fetchListings(collectionId: string): Promise<NFTListing[]> {
  try {
    // **FIX: Correct endpoint for collection items with orders**
    const url = `${RARIBLE_API_BASE}/v0.1/items/byCollection`;
    
    const response = await axios.get(url, {
      params: {
        collection: collectionId,
        status: 'ACTIVE',
        size: 50,
        sort: 'priceAsc' // Cheapest first for arbitrage
      },
      headers,
      timeout: 15000
    });

    const listings: NFTListing[] = [];
    const now = Date.now();

    console.log(`🔍 Rarible listings response:`, {
      items: response.data?.items?.length || 0,
      total: response.data?.total || 0
    });

    if (response.data?.items) {
      for (const item of response.data.items) {
        // **FIX 2: Correct order structure**
        const sellOrder = item.orders?.find((order: any) => 
          order.type === 'SELL' && order.status === 'ACTIVE'
        );

        if (sellOrder?.make?.value && item.id && sellOrder.maker) {
          listings.push({
            mint: item.id,
            auctionHouse: 'Rarible' as AuctionHouse,
            price: new BN(sellOrder.make.value), // Price in smallest units
            currency: 'ETH', // Rarible primarily ETH
            timestamp: now,
            sellerPubkey: sellOrder.maker
          });
        }
      }
    }

    // Sort by price (cheapest first)
    listings.sort((a, b) => a.price.sub(b.price).toNumber());

    const priceRangeETH = listings.length > 0
      ? `${(listings[0].price.toNumber() / 1e18).toFixed(4)} - ${(listings[listings.length - 1].price.toNumber() / 1e18).toFixed(4)} ETH`
      : 'N/A';

    pnlLogger.logMetrics({
      message: `✅ Rarible listings fetched`,
      collection: collectionId,
      count: listings.length,
      priceRangeETH,
      source: 'Rarible REST API'
    });

    return listings.slice(0, 30);

  } catch (err: any) {
    let errorMsg = err.message;
    if (err.response) {
      errorMsg = `HTTP ${err.response.status}: ${err.response.statusText}`;
      console.error('Rarible API Error:', {
        status: err.response.status,
        data: err.response.data
      });
    }

    pnlLogger.logMetrics({
      message: `⚠️ Rarible listings failed`,
      collection: collectionId,
      error: errorMsg,
      source: 'Rarible REST API'
    });

    return [];
  }
}

// **FIX 3: Direct REST API for bids**
export async function fetchBids(collectionId: string): Promise<NFTBid[]> {
  try {
    // **FIX: Correct endpoint for orders**
    const url = `${RARIBLE_API_BASE}/v0.1/orders/byCollection`;
    
    const response = await axios.get(url, {
      params: {
        collection: collectionId,
        type: 'BID',
        status: 'ACTIVE',
        size: 30,
        sort: 'priceDesc' // Highest bids first
      },
      headers,
      timeout: 15000
    });

    const bids: NFTBid[] = [];
    const now = Date.now();

    console.log(`🔍 Rarible bids response:`, {
      items: response.data?.orders?.length || 0
    });

    if (response.data?.orders) {
      for (const order of response.data.orders) {
        if (order.type === 'BID' && order.take?.value && order.maker) {
          bids.push({
            mint: order.itemId || collectionId, // Fallback to collection
            auctionHouse: 'Rarible' as AuctionHouse,
            price: new BN(order.take.value), // Bid amount
            currency: 'ETH',
            timestamp: now,
            bidderPubkey: order.maker
          });
        }
      }
    }

    // Sort by price DESC (highest first)
    bids.sort((a, b) => b.price.sub(a.price).toNumber());

    const topBidETH = bids.length > 0 ? (bids[0].price.toNumber() / 1e18).toFixed(4) : '0';

    pnlLogger.logMetrics({
      message: `✅ Rarible bids fetched`,
      collection: collectionId,
      count: bids.length,
      topBidETH,
      source: 'Rarible REST API'
    });

    return bids.slice(0, 20);

  } catch (err: any) {
    let errorMsg = err.message;
    if (err.response) {
      errorMsg = `HTTP ${err.response.status}: ${err.response.statusText}`;
    }

    pnlLogger.logMetrics({
      message: `⚠️ Rarible bids failed`,
      collection: collectionId,
      error: errorMsg,
      source: 'Rarible REST API'
    });

    return [];
  }
}

// **FIX 4: Simplified - No trading (focus on data fetching)**
export async function acceptBid(orderId: string): Promise<string | null> {
  pnlLogger.logMetrics({
    message: `⚠️ Trading DISABLED - Accept bid: ${orderId}`,
    warning: 'Implement trading via Rarible SDK or manual execution'
  });
  return null; // Disabled for now
}

export async function sellNFT(itemId: string, priceETH: string): Promise<string | null> {
  pnlLogger.logMetrics({
    message: `⚠️ Trading DISABLED - Sell NFT: ${itemId}`,
    warning: 'Implement trading via Rarible SDK or manual execution'
  });
  return null; // Disabled for now
}

// **FIX 5: Health check**
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await axios.get(`${RARIBLE_API_BASE}/v0.1/items`, {
      params: { size: 1 },
      headers,
      timeout: 5000
    });
    return response.status === 200 && !!response.data;
  } catch {
    return false;
  }
}

// **NEW: Collection validation**
export async function validateCollection(collectionId: string): Promise<boolean> {
  try {
    const response = await axios.get(`${RARIBLE_API_BASE}/v0.1/collections/${collectionId}`, {
      headers,
      timeout: 5000
    });
    return response.data?.status === 'ACTIVE';
  } catch (err: any) {
    console.log(`⚠️ Rarible collection validation failed: ${collectionId}`);
    return false;
  }
}

// Export for main.ts
export default {
  fetchListings,
  fetchBids,
  acceptBid,
  sellNFT,
  healthCheck,
  validateCollection
};

// Export individual functions for type safety
export { fetchListings, fetchBids, acceptBid, sellNFT, healthCheck, validateCollection };
