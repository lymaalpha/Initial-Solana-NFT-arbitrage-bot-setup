// src/moralisMarketplace.ts - ✅ CORRECT Solana Gateway API
import axios from 'axios';
import BN from 'bn.js';
import { NFTListing, NFTBid } from './types';
import { config } from './config';
import { pnlLogger } from './pnlLogger';

const MORALIS_API_KEY = config.moralisApiKey;
const SOLANA_GATEWAY_URL = 'https://solana-gateway.moralis.io/nft/mainnet';

// Axios instance for Solana Gateway
const api = axios.create({
  baseURL: SOLANA_GATEWAY_URL,
  headers: {
    'X-API-Key': MORALIS_API_KEY,        // ✅ CORRECT header
    'accept': 'application/json',
  },
  timeout: 15000,
});

// ✅ fetchListings - Get active NFT listings from Solana marketplaces
export async function fetchListings(collectionMint: string): Promise<NFTListing[]> {
  if (!MORALIS_API_KEY) {
    pnlLogger.logError(new Error('MORALIS_API_KEY missing'), { 
      source: 'Moralis Solana Gateway', 
      collection: collectionMint 
    });
    return [];
  }

  try {
    // Step 1: Get collection metadata to verify & get NFTs
    const metadataResponse = await api.get(`/${collectionMint}/metadata?mediaItems=false`);
    const collectionMetadata = metadataResponse.data;
    
    if (!collectionMetadata || collectionMetadata.possibleSpam) {
      pnlLogger.logMetrics({
        message: `⚠️ Collection may be spam or invalid`,
        collection: collectionMint,
        possibleSpam: collectionMetadata?.possibleSpam
      });
      return [];
    }

    // Step 2: Get recent NFT trades (proxy for active listings)
    // Moralis doesn't have direct "active listings" endpoint, so use recent trades
    const tradesResponse = await api.get(`/trades?collection=${collectionMint}&limit=50`);
    
    const now = Date.now();
    const listings: NFTListing[] = [];

    if (tradesResponse.data && Array.isArray(tradesResponse.data)) {
      for (const trade of tradesResponse.data) {
        // Use trade price as "listing price" proxy (recent market activity)
        const priceLamports = new BN(trade.total_price || 0);
        
        if (priceLamports.gt(new BN(0))) {
          listings.push({
            mint: trade.token_id || trade.mint,
            auctionHouse: trade.marketplace || 'moralis_solana',
            price: priceLamports,
            assetMint: trade.token_id || trade.mint,
            currency: 'SOL',
            timestamp: now,
            sellerPubkey: trade.seller || '',
          });
        }
      }
    }

    // Step 3: Supplement with individual NFT metadata for active listings
    // Get first 20 NFTs from collection for additional listing data
    try {
      const nftsResponse = await api.get(`/collection/${collectionMint}/nfts?limit=20`);
      
      if (nftsResponse.data && Array.isArray(nftsResponse.data)) {
        for (const nft of nftsResponse.data) {
          // Check if NFT has recent sale price (proxy for listing)
          if (nft.last_sale_price && nft.last_sale_price > 0) {
            const priceLamports = new BN(nft.last_sale_price * 1e9); // Convert SOL to lamports
            
            if (priceLamports.gt(new BN(0)) && 
                !listings.some(l => l.mint === nft.mint)) {
              listings.push({
                mint: nft.mint,
                auctionHouse: 'moralis_solana',
                price: priceLamports,
                assetMint: nft.mint,
                currency: 'SOL',
                timestamp: now,
                sellerPubkey: nft.owner || '',
              });
            }
          }
        }
      }
    } catch (supplementalErr) {
      console.log('Supplemental NFT listings fetch failed:', supplementalErr.message);
    }

    // Deduplicate listings by mint
    const uniqueListings = listings.filter((listing, index, self) => 
      index === self.findIndex(l => l.mint === listing.mint)
    );

    pnlLogger.logMetrics({
      message: `✅ Moralis Solana listings fetched`,
      collection: collectionMint,
      count: uniqueListings.length,
      source: 'Moralis Solana Gateway',
      tradesCount: tradesResponse.data?.length || 0
    });

    return uniqueListings.slice(0, 50); // Limit to 50 listings

  } catch (err: any) {
    const errorDetails = {
      message: `❌ Moralis Solana fetchListings failed`,
      collection: collectionMint,
      source: 'Moralis Solana Gateway',
      statusCode: err.response?.status,
      statusText: err.response?.statusText || err.message,
      endpoint: `/${collectionMint}/metadata`
    };
    pnlLogger.logError(err as Error, errorDetails);
    return [];
  }
}

// ✅ fetchBids - Get recent buyer activity as bids proxy
export async function fetchBids(collectionMint: string): Promise<NFTBid[]> {
  if (!MORALIS_API_KEY) {
    pnlLogger.logError(new Error('MORALIS_API_KEY missing'), { 
      source: 'Moralis Solana Gateway', 
      collection: collectionMint 
    });
    return [];
  }

  try {
    // Get recent trades where buyers purchased (proxy for bids)
    const tradesResponse = await api.get(`/trades?collection=${collectionMint}&limit=50&order=DESC`);
    
    const now = Date.now();
    const bids: NFTBid[] = [];

    if (tradesResponse.data && Array.isArray(tradesResponse.data)) {
      for (const trade of tradesResponse.data) {
        // Buyer price = "bid" (what they were willing to pay)
        const bidPrice = new BN(trade.total_price || 0);
        
        if (bidPrice.gt(new BN(0))) {
          bids.push({
            mint: trade.token_id || collectionMint,
            auctionHouse: trade.marketplace || 'moralis_solana',
            price: bidPrice,
            assetMint: 'So11111111111111111111111111111111111111112', // WSOL
            currency: 'SOL',
            timestamp: now,
            bidderPubkey: trade.buyer || '',
          });
        }
      }
    }

    // Deduplicate and sort by highest price first
    const uniqueBids = bids
      .filter((bid, index, self) => 
        index === self.findIndex(b => b.price.eq(bid.price) && b.bidderPubkey === bid.bidderPubkey)
      )
      .sort((a, b) => b.price.sub(a.price).toNumber());

    pnlLogger.logMetrics({
      message: `✅ Moralis Solana bids fetched`,
      collection: collectionMint,
      count: uniqueBids.length,
      source: 'Moralis Solana Gateway',
      tradesCount: tradesResponse.data?.length || 0
    });

    return uniqueBids.slice(0, 30); // Top 30 bids

  } catch (err: any) {
    const errorDetails = {
      message: `❌ Moralis Solana fetchBids failed`,
      collection: collectionMint,
      source: 'Moralis Solana Gateway',
      statusCode: err.response?.status,
      statusText: err.response?.statusText || err.message,
      endpoint: `/trades?collection=${collectionMint}`
    };
    pnlLogger.logError(err as Error, errorDetails);
    return [];
  }
}

// ✅ Health check using the metadata endpoint you found
export async function healthCheck(): Promise<boolean> {
  if (!MORALIS_API_KEY) return false;
  
  try {
    // Test with WSOL metadata endpoint (always exists)
    const response = await api.get('/So11111111111111111111111111111111111111112/metadata?mediaItems=false');
    return response.status === 200 && response.data.mint === 'So11111111111111111111111111111111111111112';
  } catch {
    return false;
  }
}

// Export for main.ts
export default { fetchListings, fetchBids, healthCheck };
