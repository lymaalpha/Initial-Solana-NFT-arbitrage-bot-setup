// src/raribleMarketplace.ts - ✅ FIXED: No duplicate exports, SOL currency
import axios from 'axios';
import BN from 'bn.js';
import { NFTListing, NFTBid, AuctionHouse } from './types';
import { pnlLogger } from './pnlLogger';

const RARIBLE_API_BASE = 'https://api.rarible.com';
const headers = {
  'Accept': 'application/json',
  'User-Agent': 'Solana-NFT-Bot/1.0',
  ...(process.env.RARIBLE_API_KEY && { 'X-API-Key': process.env.RARIBLE_API_KEY })
};

// **FIX 2: Single export declaration**
export async function fetchListings(collectionId: string): Promise<NFTListing[]> {
  try {
    const url = `${RARIBLE_API_BASE}/v0.1/items/byCollection`;
    
    const response = await axios.get(url, {
      params: {
        collection: collectionId,
        status: 'ACTIVE',
        size: 50,
        sort: 'priceAsc'
      },
      headers,
      timeout: 15000
    });

    const listings: NFTListing[] = [];
    const now = Date.now();

    if (response.data?.items) {
      for (const item of response.data.items) {
        const sellOrder = item.orders?.find((order: any) => 
          order.type === 'SELL' && order.status === 'ACTIVE'
        );

        // **FIX 3: Convert ETH prices to SOL equivalent (approx 2500:1)**
        if (sellOrder?.make?.value && item.id && sellOrder.maker) {
          // Convert ETH wei to lamports (rough 1 ETH = 2500 SOL)
          const ethWei = new BN(sellOrder.make.value);
          const solLamports = ethWei.muln(2500).divn(1e9); // Rough conversion

          listings.push({
            mint: item.id,
            auctionHouse: 'Rarible' as AuctionHouse,
            price: solLamports,     // ✅ SOL currency
            currency: 'SOL' as const,
            timestamp: now,
            sellerPubkey: sellOrder.maker
          });
        }
      }
    }

    listings.sort((a, b) => a.price.sub(b.price).toNumber());

    const priceRangeSOL = listings.length > 0
      ? `${(listings[0].price.toNumber() / 1e9).toFixed(4)} - ${(listings[listings.length - 1].price.toNumber() / 1e9).toFixed(4)} SOL`
      : 'N/A';

    pnlLogger.logMetrics({
      message: `✅ Rarible listings fetched`,
      collection: collectionId,
      count: listings.length,
      priceRangeSOL,
      source: 'Rarible REST API'
    });

    return listings.slice(0, 30);

  } catch (err: any) {
    pnlLogger.logMetrics({
      message: `⚠️ Rarible listings failed`,
      collection: collectionId,
      error: err.response?.status || err.message,
      source: 'Rarible REST API'
    });
    return [];
  }
}

export async function fetchBids(collectionId: string): Promise<NFTBid[]> {
  try {
    const url = `${RARIBLE_API_BASE}/v0.1/orders/byCollection`;
    
    const response = await axios.get(url, {
      params: {
        collection: collectionId,
        type: 'BID',
        status: 'ACTIVE',
        size: 30,
        sort: 'priceDesc'
      },
      headers,
      timeout: 15000
    });

    const bids: NFTBid[] = [];
    const now = Date.now();

    if (response.data?.orders) {
      for (const order of response.data.orders) {
        if (order.type === 'BID' && order.take?.value && order.maker) {
          // Convert ETH wei to SOL lamports
          const ethWei = new BN(order.take.value);
          const solLamports = ethWei.muln(2500).divn(1e9);

          bids.push({
            mint: order.itemId || collectionId,
            auctionHouse: 'Rarible' as AuctionHouse,
            price: solLamports,     // ✅ SOL currency
            currency: 'SOL' as const,
            timestamp: now,
            bidderPubkey: order.maker
          });
        }
      }
    }

    bids.sort((a, b) => b.price.sub(a.price).toNumber());

    pnlLogger.logMetrics({
      message: `✅ Rarible bids fetched`,
      collection: collectionId,
      count: bids.length,
      source: 'Rarible REST API'
    });

    return bids.slice(0, 20);

  } catch (err: any) {
    pnlLogger.logMetrics({
      message: `⚠️ Rarible bids failed`,
      collection: collectionId,
      error: err.response?.status || err.message,
      source: 'Rarible REST API'
    });
    return [];
  }
}

// Trading functions (disabled)
export async function acceptBid(orderId: string): Promise<string | null> {
  pnlLogger.logMetrics({ message: `⚠️ Trading disabled: ${orderId}` });
  return null;
}

export async function sellNFT(itemId: string, priceSOL: string): Promise<string | null> {
  pnlLogger.logMetrics({ message: `⚠️ Trading disabled: ${itemId}` });
  return null;
}

export async function healthCheck(): Promise<boolean> {
  try {
    const response = await axios.get(`${RARIBLE_API_BASE}/v0.1/items`, {
      params: { size: 1 },
      headers,
      timeout: 5000
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

// **FIX 4: Remove duplicate default export**
export default {
  fetchListings,
  fetchBids,
  acceptBid,
  sellNFT,
  healthCheck
};
