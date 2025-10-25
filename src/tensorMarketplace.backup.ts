// src/tensorMarketplace.ts - ✅ FIXED: Real Tensor V1 API
import axios from 'axios';
import BN from 'bn.js';
import { NFTListing, NFTBid } from './types';
import { pnlLogger } from './pnlLogger';

const TENSOR_API_BASE = 'https://api.mainnet.beta.tensor.trade/v1';
const TENSOR_COLLECTIONS_URL = `${TENSOR_API_BASE}/collections`;
const TENSOR_ACTIVITIES_URL = `${TENSOR_API_BASE}/activities`;

// **FIX 1: Validate collection mint and get collection state**
async function validateCollection(collectionMint: string): Promise<boolean> {
  try {
    const response = await axios.get(`${TENSOR_COLLECTIONS_URL}`, {
      params: { 
        mint: collectionMint,
        limit: 1 
      },
      timeout: 5000
    });

    const collection = response.data?.items?.[0];
    if (!collection || collection.state !== 'Active') {
      pnlLogger.logMetrics({
        message: `⚠️ Invalid/inactive collection`,
        collection: collectionMint,
        state: collection?.state || 'unknown'
      });
      return false;
    }

    return true;
  } catch (err: any) {
    pnlLogger.logMetrics({
      message: `⚠️ Collection validation failed`,
      collection: collectionMint,
      error: err.response?.status || err.message
    });
    return false;
  }
}

// **FIX 2: Correct listings endpoint + parameters**
export async function fetchListings(collectionMint: string): Promise<NFTListing[]> {
  // Validate collection first
  const isValidCollection = await validateCollection(collectionMint);
  if (!isValidCollection) return [];

  try {
    // **FIX: Use correct endpoint and params**
    const response = await axios.get(`${TENSOR_API_BASE}/nft/listings`, {
      params: {
        // **CRITICAL: Use collection's SYMBOL, not mint**
        collection: collectionMint,
        limit: 50,           // Increased limit
        offset: 0,
        sortBy: 'created_timestamp',
        sortDirection: 'desc'
      },
      timeout: 15000,        // Increased timeout
      headers: {
        'User-Agent': 'Solana-NFT-Bot/1.0'
      }
    });

    const listings: NFTListing[] = [];
    const now = Date.now();

    console.log(`🔍 Tensor listings response:`, {
      success: !!response.data?.success,
      items: response.data?.items?.length || 0,
      total: response.data?.total || 0
    });

    if (response.data?.success && response.data.items) {
      for (const item of response.data.items) {
        // **FIX: Correct price and owner fields**
        const priceLamports = item.priceX || item.price || 0;
        if (priceLamports && priceLamports > 0) {
          listings.push({
            mint: item.mint,
            auctionHouse: 'Tensor',
            price: new BN(priceLamports),  // Price in lamports
            currency: 'SOL',
            timestamp: now,
            sellerPubkey: item.owner || item.seller || item.maker || ''
          });
        }
      }
    }

    // Sort by price ASC (cheapest first for arbitrage)
    listings.sort((a, b) => a.price.sub(b.price).toNumber());

    const priceRangeSOL = listings.length > 0
      ? `${(listings[0].price.toNumber() / 1e9).toFixed(4)} - ${(listings[listings.length - 1].price.toNumber() / 1e9).toFixed(4)} SOL`
      : 'N/A';

    pnlLogger.logMetrics({
      message: `✅ Tensor listings fetched`,
      collection: collectionMint,
      count: listings.length,
      priceRangeSOL,
      minPriceSOL: listings.length > 0 ? (listings[0].price.toNumber() / 1e9).toFixed(4) : '0',
      source: 'Tensor V1 API'
    });

    return listings.slice(0, 30); // Return top 30 cheapest

  } catch (err: any) {
    let errorMsg = err.message;
    
    // **FIX: Better error handling**
    if (err.response) {
      errorMsg = `HTTP ${err.response.status}: ${err.response.statusText}`;
      console.error('Tensor API Error:', err.response.data);
    }

    pnlLogger.logMetrics({
      message: `⚠️ Tensor listings failed`,
      collection: collectionMint,
      error: errorMsg,
      responseStatus: err.response?.status,
      source: 'Tensor V1 API'
    });

    return [];
  }
}

// **FIX 3: Correct bids endpoint**
export async function fetchBids(collectionMint: string): Promise<NFTBid[]> {
  const isValidCollection = await validateCollection(collectionMint);
  if (!isValidCollection) return [];

  try {
    // **FIX: Use correct bids endpoint**
    const response = await axios.get(`${TENSOR_API_BASE}/nft/bids`, {
      params: {
        collection: collectionMint,
        limit: 30,
        offset: 0,
        sortBy: 'created_timestamp',
        sortDirection: 'desc',
        // Filter for active bids only
        state: 'active'
      },
      timeout: 15000,
      headers: {
        'User-Agent': 'Solana-NFT-Bot/1.0'
      }
    });

    const bids: NFTBid[] = [];
    const now = Date.now();

    console.log(`🔍 Tensor bids response:`, {
      success: !!response.data?.success,
      items: response.data?.items?.length || 0
    });

    if (response.data?.success && response.data.items) {
      for (const item of response.data.items) {
        // **FIX: Correct bid fields**
        const priceLamports = item.priceX || item.price || 0;
        if (priceLamports && priceLamports > 0) {
          bids.push({
            mint: item.mint || collectionMint,
            auctionHouse: 'Tensor',
            price: new BN(priceLamports),
            currency: 'SOL',
            timestamp: now,
            bidderPubkey: item.buyer || item.owner || item.maker || ''
          });
        }
      }
    }

    // Sort by price DESC (highest bids first)
    bids.sort((a, b) => b.price.sub(a.price).toNumber());

    const topBidSOL = bids.length > 0 ? (bids[0].price.toNumber() / 1e9).toFixed(4) : '0';

    pnlLogger.logMetrics({
      message: `✅ Tensor bids fetched`,
      collection: collectionMint,
      count: bids.length,
      topBidSOL,
      source: 'Tensor V1 API'
    });

    return bids.slice(0, 20);

  } catch (err: any) {
    let errorMsg = err.message;
    if (err.response) {
      errorMsg = `HTTP ${err.response.status}: ${err.response.statusText}`;
      console.error('Tensor bids API Error:', err.response.data);
    }

    pnlLogger.logMetrics({
      message: `⚠️ Tensor bids failed`,
      collection: collectionMint,
      error: errorMsg,
      source: 'Tensor V1 API'
    });

    return [];
  }
}

// **NEW: Fetch collection metadata for arbitrage opportunities**
export async function fetchCollectionInfo(collectionMint: string): Promise<any> {
  try {
    const response = await axios.get(`${TENSOR_COLLECTIONS_URL}`, {
      params: { mint: collectionMint, limit: 1 },
      timeout: 5000
    });

    return response.data?.items?.[0] || null;
  } catch (err: any) {
    pnlLogger.logMetrics({
      message: `⚠️ Collection info failed`,
      collection: collectionMint,
      error: err.message
    });
    return null;
  }
}

export default { 
  fetchListings, 
  fetchBids, 
  fetchCollectionInfo 
};
