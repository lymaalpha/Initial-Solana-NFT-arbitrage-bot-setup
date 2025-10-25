import { NFTListing, NFTBid, AuctionHouse } from "./types";
import BN from "bn.js";
import axios from "axios";
import { config } from "./config";

const RARIBLE_API = "https://api.rarible.org/v0.1";

export async function fetchListings(collectionSlug: string): Promise<NFTListing[]> {
  try {
    const headers: any = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    };

    // Use Rarible API key if available
    if (config.raribleApiKey) {
      headers['X-API-KEY'] = config.raribleApiKey;
    }

    const response = await axios.get(
      `${RARIBLE_API}/items/byCollection`,
      {
        params: {
          collection: `SOLANA:${collectionSlug}`,
          size: 30
        },
        timeout: 15000,
        headers
      }
    );

    if (!response.data || !response.data.items) {
      console.log(`⚠️ Rarible: No items found for ${collectionSlug}`);
      return [];
    }

    const listings: NFTListing[] = response.data.items
      .filter((item: any) => {
        // Filter items that have price information
        return item.meta && item.meta.attributes;
      })
      .map((item: any) => {
        // Extract price from attributes or use default
        const priceAttr = item.meta.attributes?.find((attr: any) => attr.key === "price");
        const price = priceAttr ? parseFloat(priceAttr.value) : 1.0; // Default price
        
        return {
          mint: item.meta.attributes?.mint || item.id?.split(":")[2] || `rarible_${Date.now()}`,
          auctionHouse: "Rarible" as AuctionHouse,
          price: new BN(Math.floor(price * 1e9)),
          currency: "SOL",
          timestamp: Date.now(),
          sellerPubkey: item.sellers?.[0]?.split(":")[1] || ""
        };
      })
      .filter((listing: NFTListing) => listing.price.gt(new BN(0)));

    console.log(`✅ Rarible: Fetched ${listings.length} listings for ${collectionSlug}`);
    return listings;

  } catch (error: any) {
    console.error(`❌ Rarible listings failed for ${collectionSlug}:`, error.message);
    return [];
  }
}

export async function fetchBids(collectionSlug: string): Promise<NFTBid[]> {
  try {
    // For Rarible, create synthetic bids based on listings
    const listings = await fetchListings(collectionSlug);
    
    // Create bids that are 85% of listing prices
    const bids: NFTBid[] = listings.slice(0, 15).map(listing => ({
      mint: listing.mint,
      auctionHouse: "Rarible" as AuctionHouse,
      price: new BN(listing.price.muln(85).divn(100)), // 85% of listing price as bid
      currency: "SOL",
      timestamp: Date.now(),
      bidderPubkey: "synthetic_bidder_rarible"
    }));

    console.log(`✅ Rarible: Created ${bids.length} synthetic bids for ${collectionSlug}`);
    return bids;

  } catch (error: any) {
    console.error(`❌ Rarible bids failed for ${collectionSlug}:`, error.message);
    return [];
  }
}
