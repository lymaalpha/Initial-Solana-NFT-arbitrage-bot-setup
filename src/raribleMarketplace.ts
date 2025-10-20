import axios from 'axios';
import BN from 'bn.js';
import { NFTListing, NFTBid } from './types';
import { pnlLogger } from './pnlLogger';

const RARIBLE_GATEWAY = 'https://solana-api.rarible.com';

export async function fetchListings(collectionMint: string): Promise<NFTListing[]> {
  try {
    // ✅ Rarible: Get items by collection
    const response = await axios.get(`${RARIBLE_GATEWAY}/items/byCollection`, {
      params: {
        collection: collectionMint,
        status: 'ACTIVE',
        size: 50,
        sort: { value: 'PRICE_ASC', type: 'ASC' },
      },
      timeout: 10000,
    });

    const listings: NFTListing[] = [];
    const now = Date.now();

    if (response.data?.items) {
      for (const item of response.data.items) {
        const sellOrder = item.sellOrders?.[0];
        if (sellOrder?.make?.value && item.tokenId) {
          const priceLamports = new BN(sellOrder.make.value);
          listings.push({
            mint: item.tokenId,
            auctionHouse: 'Rarible',
            price: priceLamports,
            currency: 'SOL',
            timestamp: now,
            sellerPubkey: sellOrder.maker || '',
          });
        }
      }
    }

    // Sort by price ascending (cheapest first)
    listings.sort((a, b) => a.price.sub(b.price).toNumber());

    pnlLogger.logMetrics({
      message: `✅ Rarible listings fetched`,
      collection: collectionMint,
      count: listings.length,
      priceRangeSOL:
        listings.length > 0
          ? `${(listings[0].price.toNumber() / 1e9).toFixed(2)} - ${(listings[listings.length - 1].price.toNumber() / 1e9).toFixed(2)} SOL`
          : 'N/A',
      source: 'Rarible API',
    });

    return listings.slice(0, 30); // Limit for performance
  } catch (err: any) {
    pnlLogger.logMetrics({
      message: `⚠️ Rarible listings failed (continuing)`,
      collection: collectionMint,
      error: err.response?.status || err.message,
      source: 'Rarible API',
    });
    return [];
  }
}

export async function fetchBids(collectionMint: string): Promise<NFTBid[]> {
  try {
    // ✅ Rarible: Get bids by collection
    const response = await axios.get(`${RARIBLE_GATEWAY}/orders/bids/byCollection`, {
      params: {
        collection: collectionMint,
        status: 'ACTIVE',
        size: 30,
        sort: { value: 'PRICE_DESC', type: 'DESC' },
      },
      timeout: 10000,
    });

    const bids: NFTBid[] = [];
    const now = Date.now();

    if (response.data?.orders) {
      for (const order of response.data.orders) {
        if (order.take?.value && order.maker) {
          const priceLamports = new BN(order.take.value);
          bids.push({
            mint: collectionMint, // Rarible collection-level bid
            auctionHouse: 'Rarible',
            price: priceLamports,
            currency: 'SOL',
            timestamp: now,
            bidderPubkey: order.maker,
          });
        }
      }
    }

    // Sort highest first
    bids.sort((a, b) => b.price.sub(a.price).toNumber());

    pnlLogger.logMetrics({
      message: `✅ Rarible bids fetched`,
      collection: collectionMint,
      count: bids.length,
      topBidSOL:
        bids.length > 0 ? (bids[0].price.toNumber() / 1e9).toFixed(2) : 'N/A',
      source: 'Rarible API',
    });

    return bids.slice(0, 20);
  } catch (err: any) {
    pnlLogger.logMetrics({
      message: `⚠️ Rarible bids failed (continuing)`,
      collection: collectionMint,
      error: err.response?.status || err.message,
      source: 'Rarible API',
    });
    return [];
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const response = await axios.get(`${RARIBLE_GATEWAY}/items/count`, { timeout: 5000 });
    return response.status === 200;
  } catch {
    return false;
  }
}
export default { fetchListings, fetchBids, healthCheck };
