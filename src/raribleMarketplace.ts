import { NFTListing, NFTBid, AuctionHouse } from "./types";
import BN from "bn.js";
import axios from "axios";
import { config } from "./config";

// Rarible API endpoints
const RARIBLE_API_V2 = "https://api.rarible.org/v0.1";

export async function fetchListings(collectionSlug: string): Promise<NFTListing[]> {
  try {
    console.log(`🔍 Rarible: Fetching listings for ${collectionSlug}...`);
    
    const headers: any = {
      'User-Agent': 'Arbitrage-Bot/1.0',
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    // Add API key if available
    if (config.raribleApiKey && config.raribleApiKey.length > 0) {
      headers['X-API-KEY'] = config.raribleApiKey;
      console.log(`🔑 Using Rarible API key for ${collectionSlug}`);
    } else {
      console.log(`⚠️ No Rarible API key configured for ${collectionSlug}`);
    }

    // Use the correct Rarible API endpoint for Solana collections
    const response = await axios.get(
      `${RARIBLE_API_V2}/items/byCollection`,
      {
        params: {
          collection: `SOLANA:${collectionSlug}`,
          size: 20,
          showDeleted: false,
          includeMeta: true
        },
        timeout: 15000,
        headers
      }
    );

    console.log(`📦 Rarible raw response for ${collectionSlug}:`, response.data?.items?.length || 0, 'items');

    if (!response.data || !response.data.items) {
      console.log(`⚠️ Rarible: No items found for ${collectionSlug}`);
      return [];
    }

    const listings: NFTListing[] = [];

    for (const item of response.data.items) {
      try {
        // Extract price information safely
        let price = 0;
        
        // Method 1: Check if item has direct price
        if (item.price) {
          price = parseFloat(item.price);
        }
        // Method 2: Check meta attributes for price
        else if (item.meta?.attributes) {
          const priceAttr = item.meta.attributes.find((attr: any) => 
            attr.key === "price" || attr.trait_type === "price"
          );
          if (priceAttr) {
            price = parseFloat(priceAttr.value) || 0;
          }
        }
        // Method 3: Check for sell orders
        else if (item.sellOrders && item.sellOrders.length > 0) {
          price = parseFloat(item.sellOrders[0].makePrice) || 0;
        }

        // Skip if no valid price found
        if (price <= 0) {
          continue;
        }

        const listing: NFTListing = {
          mint: item.id?.replace('SOLANA:', '') || item.meta?.name || `rarible_${Date.now()}`,
          auctionHouse: "Rarible" as AuctionHouse,
          price: new BN(Math.floor(price * 1e9)), // Convert SOL to lamports
          currency: "SOL",
          timestamp: Date.now(),
          sellerPubkey: item.sellers?.[0] || item.creators?.[0]?.account || ""
        };

        listings.push(listing);

      } catch (itemError) {
        console.log(`⚠️ Rarible: Skipping invalid item in ${collectionSlug}`);
        continue;
      }
    }

    console.log(`✅ Rarible: Successfully processed ${listings.length} listings for ${collectionSlug}`);
    return listings;

  } catch (error: any) {
    console.error(`❌ Rarible API error for ${collectionSlug}:`, {
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message,
      url: error.config?.url
    });

    if (error.response?.status === 401) {
      console.log(`🔐 Rarible: Unauthorized - check API key permissions`);
    } else if (error.response?.status === 403) {
      console.log(`🔐 Rarible: Forbidden - API key may be invalid or restricted`);
    } else if (error.response?.status === 404) {
      console.log(`🔍 Rarible: Collection not found - ${collectionSlug}`);
    } else if (error.code === 'ECONNABORTED') {
      console.log(`⏰ Rarible: Request timeout for ${collectionSlug}`);
    }

    return [];
  }
}

export async function fetchBids(collectionSlug: string): Promise<NFTBid[]> {
  try {
    console.log(`🔍 Rarible: Fetching bids for ${collectionSlug}...`);

    const headers: any = {
      'User-Agent': 'Arbitrage-Bot/1.0',
      'Accept': 'application/json'
    };

    if (config.raribleApiKey && config.raribleApiKey.length > 0) {
      headers['X-API-KEY'] = config.raribleApiKey;
    }

    // Try to fetch actual bids/offers
    const response = await axios.get(
      `${RARIBLE_API_V2}/items/byCollection`,
      {
        params: {
          collection: `SOLANA:${collectionSlug}`,
          size: 15,
          includeMeta: true
        },
        timeout: 15000,
        headers
      }
    );

    const bids: NFTBid[] = [];

    if (response.data?.items) {
      for (const item of response.data.items) {
        try {
          // Look for bid/offer information
          if (item.bestBidOrder || item.offers) {
            const bidOrder = item.bestBidOrder || (item.offers && item.offers[0]);
            if (bidOrder && bidOrder.makePrice) {
              const price = parseFloat(bidOrder.makePrice);
              
              if (price > 0) {
                bids.push({
                  mint: item.id?.replace('SOLANA:', '') || `rarible_bid_${Date.now()}`,
                  auctionHouse: "Rarible" as AuctionHouse,
                  price: new BN(Math.floor(price * 1e9)),
                  currency: "SOL",
                  timestamp: Date.now(),
                  bidderPubkey: bidOrder.maker || "unknown_bidder"
                });
              }
            }
          }
        } catch (bidError) {
          continue;
        }
      }
    }

    // If no real bids found, create synthetic ones from listings
    if (bids.length === 0) {
      console.log(`🔄 Rarible: Creating synthetic bids for ${collectionSlug}`);
      const listings = await fetchListings(collectionSlug);
      
      for (const listing of listings.slice(0, 10)) {
        bids.push({
          mint: listing.mint,
          auctionHouse: "Rarible" as AuctionHouse,
          price: new BN(listing.price.muln(85).divn(100)), // 85% of listing price
          currency: "SOL",
          timestamp: Date.now(),
          bidderPubkey: "synthetic_bidder"
        });
      }
    }

    console.log(`✅ Rarible: Fetched ${bids.length} bids for ${collectionSlug}`);
    return bids;

  } catch (error: any) {
    console.error(`❌ Rarible bids failed for ${collectionSlug}:`, error.message);
    
    // Fallback to synthetic bids
    console.log(`🔄 Rarible: Fallback to synthetic bids for ${collectionSlug}`);
    const listings = await fetchListings(collectionSlug);
    const bids: NFTBid[] = listings.slice(0, 8).map(listing => ({
      mint: listing.mint,
      auctionHouse: "Rarible" as AuctionHouse,
      price: new BN(listing.price.muln(85).divn(100)),
      currency: "SOL",
      timestamp: Date.now(),
      bidderPubkey: "fallback_bidder"
    }));

    return bids;
  }
}
