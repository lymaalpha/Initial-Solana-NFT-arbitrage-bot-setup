// src/moralisMarketplace.ts - ✅ FIXED: ME V2 + Rate Limit Backoff
import axios from 'axios';
import BN from 'bn.js';
import { NFTListing, NFTBid } from './types';
import { pnlLogger } from './pnlLogger';

const ME_V2_URL = 'https://api-mainnet.magiceden.dev/v2';
let rateLimitBackoff = 1000; // Start with 1s

async function rateLimitDelay(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, rateLimitBackoff));
}

// ✅ Use collection SYMBOLS (from main.ts)
export async function fetchListings(collectionSymbol: string): Promise<NFTListing[]> {
  const listings: NFTListing[] = [];
  const now = Date.now();

  try {
    await rateLimitDelay();

    // ME V2: Collection activities (recent listings)
    const activitiesResponse = await axios.get(
      `${ME_V2_URL}/collections/${collectionSymbol}/activities?offset=0&limit=50`,
      { timeout: 8000 }
    );

    if (activitiesResponse.data) {
      for (const activity of activitiesResponse.data) {
        // Filter for listings
        if (activity.type === 'list' && activity.tokenMint && activity.price) {
          listings.push({
            mint: activity.tokenMint,
            auctionHouse: 'moralis',
            price: new BN(activity.price),
            currency: 'SOL',
            timestamp: now,
            sellerPubkey: activity.userAddress || ''
          });
        }
      }
    }

    // Dedupe by mint
    const uniqueListings = listings.filter((l, i, self) => 
      i === self.findIndex(l2 => l2.mint === l.mint)
    );

    pnlLogger.logMetrics({
      message: `✅ Moralis listings (ME V2 activities)`,
      collection: collectionSymbol,
      count: uniqueListings.length,
      backoffMs: rateLimitBackoff
    });

    return uniqueListings.slice(0, 20);

  } catch (err: any) {
    if (err.response?.status === 429) {
      rateLimitBackoff = Math.min(rateLimitBackoff * 2, 10000);
      pnlLogger.logMetrics({
        message: `🔄 Rate limited, backoff ${rateLimitBackoff}ms`,
        collection: collectionSymbol
      });
    }
    
    pnlLogger.logMetrics({
      message: `⚠️ Moralis listings failed`,
      collection: collectionSymbol,
      error: err.response?.status || err.message
    });
    return [];
  }
}

export async function fetchBids(collectionSymbol: string): Promise<NFTBid[]> {
  const bids: NFTBid[] = [];
  const now = Date.now();

  try {
    await rateLimitDelay();

    // ME V2: Recent sales as bid proxy
    const activitiesResponse = await axios.get(
      `${ME_V2_URL}/collections/${collectionSymbol}/activities?offset=0&limit=30`,
      { timeout: 8000 }
    );

    if (activitiesResponse.data) {
      for (const activity of activitiesResponse.data) {
        // Use sales as "bids" (buyers willing to pay)
        if (activity.type === 'sale' && activity.tokenMint && activity.price) {
          bids.push({
            mint: activity.tokenMint || collectionSymbol,
            auctionHouse: 'moralis',
            price: new BN(activity.price),
            currency: 'SOL',
            timestamp: now,
            bidderPubkey: activity.userAddress || ''
          });
        }
      }
    }

    // Sort highest first
    bids.sort((a, b) => b.price.sub(a.price).toNumber());

    pnlLogger.logMetrics({
      message: `✅ Moralis bids (ME V2 sales)`,
      collection: collectionSymbol,
      count: bids.length,
      topBidSOL: bids.length > 0 ? (bids[0].price.toNumber() / 1e9).toFixed(2) : 'N/A'
    });

    return bids.slice(0, 12);

  } catch (err: any) {
    if (err.response?.status === 429) {
      rateLimitBackoff = Math.min(rateLimitBackoff * 2, 10000);
    }
    
    pnlLogger.logMetrics({
      message: `⚠️ Moralis bids failed`,
      collection: collectionSymbol,
      error: err.response?.status || err.message
    });
    return [];
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    await axios.get(`${ME_V2_URL}/collections/mad_lads`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export default { fetchListings, fetchBids, healthCheck };
