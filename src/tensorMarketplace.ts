// src/tensorMarketplace.ts - ✅ FIXED: Real Tensor V1 API
import axios from 'axios';
import BN from 'bn.js';
import { NFTListing, NFTBid } from './types';
import { pnlLogger } from './pnlLogger';

const TENSOR_API_URL = 'https://api.mainnet.beta.tensor.trade';

export async function fetchListings(collectionMint: string): Promise<NFTListing[]> {
  try {
    const response = await axios.get(`${TENSOR_API_URL}/listings`, {
      params: {
        collection: collectionMint,
        limit: 30,
        sort: 'created_timestamp',
        order: 'desc'
      },
      timeout: 10000
    });

    const listings: NFTListing[] = [];
    const now = Date.now();

    if (response.data?.items) {
      for (const item of response.data.items) {
        if (item.mint && item.price && item.price > 0) {
          listings.push({
            mint: item.mint,
            auctionHouse: 'Tensor',
            price: new BN(item.price),
            currency: 'SOL',
            timestamp: now,
            sellerPubkey: item.owner || item.seller || ''
          });
        }
      }
    }

    pnlLogger.logMetrics({
      message: `✅ Tensor listings fetched`,
      collection: collectionMint,
      count: listings.length,
      source: 'Tensor V1'
    });

    return listings.slice(0, 25);

  } catch (err: any) {
    pnlLogger.logMetrics({
      message: `⚠️ Tensor listings failed (continuing)`,
      collection: collectionMint,
      error: err.response?.status || err.message
    });
    return [];
  }
}

export async function fetchBids(collectionMint: string): Promise<NFTBid[]> {
  try {
    const response = await axios.get(`${TENSOR_API_URL}/bids`, {
      params: {
        collection: collectionMint,
        limit: 20,
        sort: 'created_timestamp',
        order: 'desc'
      },
      timeout: 10000
    });

    const bids: NFTBid[] = [];
    const now = Date.now();

    if (response.data?.items) {
      for (const item of response.data.items) {
        if (item.mint && item.price && item.price > 0) {
          bids.push({
            mint: item.mint || collectionMint,
            auctionHouse: 'Tensor',
            price: new BN(item.price),
            currency: 'SOL',
            timestamp: now,
            bidderPubkey: item.buyer || item.owner || ''
          });
        }
      }
    }

    bids.sort((a, b) => b.price.sub(a.price).toNumber());

    pnlLogger.logMetrics({
      message: `✅ Tensor bids fetched`,
      collection: collectionMint,
      count: bids.length,
      source: 'Tensor V1'
    });

    return bids.slice(0, 15);

  } catch (err: any) {
    pnlLogger.logMetrics({
      message: `⚠️ Tensor bids failed (continuing)`,
      collection: collectionMint,
      error: err.response?.status || err.message
    });
    return [];
  }
}

export default { fetchListings, fetchBids };
