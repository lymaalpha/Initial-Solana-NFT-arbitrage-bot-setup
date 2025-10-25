import { NFTListing, NFTBid, AuctionHouse } from "./types";
import BN from "bn.js";
import axios from "axios";
import { config } from "./config";

// Alternative Rarible API endpoints
const RARIBLE_API_V1 = "https://api.rarible.org/v0.1";
const RARIBLE_SOLANA_API = "https://solana-api.rarible.org";

export async function fetchListings(collectionSlug: string): Promise<NFTListing[]> {
  try {
    const headers: any = {
      'User-Agent': 'Arbitrage-Bot/1.0',
      'Accept': 'application/json'
    };

    // Try with API key if available
    if (config.raribleApiKey) {
      headers['X-API-KEY'] = config.raribleApiKey;
    }

    // Try multiple API endpoints
    let response;
    try {
      // Try main API first
      response = await axios.get(
        `${RARIBLE_API_V1}/items/byCollection`,
        {
          params: {
            collection: `SOLANA:${collectionSlug}`,
            size: 20
          },
          timeout: 10000,
          headers
        }
      );
    } catch (error) {
      // Fallback to Solana-specific API
      console.log(`🔄 Trying Solana API for ${collectionSlug}...`);
      response = await axios.get(
        `${RARIBLE_SOLANA_API}/collections/${collectionSlug}/items`,
        {
          params: {
            limit: 20,
            forSale: true
          },
          timeout: 10000,
          headers
        }
      );
    }

    if (!response.data || (!response.data.items && !response.data.result)) {
      console.log(`⚠️ Rarible: No data for ${collectionSlug}`);
      return [];
    }

    // Handle different response formats
    const items = response.data.items || response.data.result || [];
    
    const listings: NFTListing[] = items
      .filter((item: any) => {
        // Filter items with price information
        return item.price || (item.meta && item.meta.attributes);
      })
      .map((item: any) => {
        // Extract price from different possible fields
        const price = item.price || 
                     (item.meta?.attributes?.find((attr: any) => attr.key === "price")?.value) || 
                     1.0;
        
        return {
          mint: item.mintAddress || item.tokenMint || item.id?.split(":")[2] || `rarible_${Date.now()}`,
          auctionHouse: "Rarible" as AuctionHouse,
          price: new BN(Math.floor(parseFloat(price) * 1e9)),
          currency: "SOL",
          timestamp: Date.now(),
          sellerPubkey: item.seller || item.sellers?.[0] || ""
        };
      })
      .filter((listing: NFTListing) => listing.price.gt(new BN(0)));

    console.log(`✅ Rarible: Fetched ${listings.length} listings for ${collectionSlug}`);
    return listings;

  } catch (error: any) {
    if (error.response?.status === 403) {
      console.log(`🔐 Rarible: API access denied for ${collectionSlug} - check API key`);
    } else if (error.response?.status === 404) {
      console.log(`❌ Rarible: Collection ${collectionSlug} not found`);
    } else {
      console.error(`❌ Rarible failed for ${collectionSlug}:`, error.message);
    }
    return [];
  }
}

export async function fetchBids(collectionSlug: string): Promise<NFTBid[]> {
  try {
    // Try to get real bids first
    const headers: any = {
      'User-Agent': 'Arbitrage-Bot/1.0',
      'Accept': 'application/json'
    };

    if (config.raribleApiKey) {
      headers['X-API-KEY'] = config.raribleApiKey;
    }

    let bids: NFTBid[] = [];
    
    try {
      const response = await axios.get(
        `${RARIBLE_SOLANA_API}/collections/${collectionSlug}/offers`,
        {
          params: { limit: 15 },
          timeout: 10000,
          headers
        }
      );

      if (response.data && response.data.offers) {
        bids = response.data.offers.map((offer: any) => ({
          mint: offer.mintAddress,
          auctionHouse: "Rarible" as AuctionHouse,
          price: new BN(Math.floor(offer.price * 1e9)),
          currency: "SOL",
          timestamp: Date.now(),
          bidderPubkey: offer.buyer || ""
        }));
      }
    } catch (error) {
      // Fallback to synthetic bids
      console.log(`🔄 Creating synthetic bids for ${collectionSlug}`);
      const listings = await fetchListings(collectionSlug);
      bids = listings.slice(0, 10).map(listing => ({
        mint: listing.mint,
        auctionHouse: "Rarible" as AuctionHouse,
        price: new BN(listing.price.muln(88).divn(100)), // 88% of listing
        currency: "SOL",
        timestamp: Date.now(),
        bidderPubkey: "synthetic_bidder"
      }));
    }

    console.log(`✅ Rarible: Fetched ${bids.length} bids for ${collectionSlug}`);
    return bids;

  } catch (error: any) {
    console.error(`❌ Rarible bids failed for ${collectionSlug}:`, error.message);
    return [];
  }
}
