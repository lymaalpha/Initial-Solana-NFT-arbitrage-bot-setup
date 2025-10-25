// src/openseaMarketplace.ts
import { NFTListing, NFTBid, AuctionHouse } from "./types";
import BN from "bn.js";
import axios from "axios";

const OPENSEA_API = "https://api.opensea.io/api/v2";

export async function fetchListings(collectionSlug: string): Promise<NFTListing[]> {
  try {
    const response = await axios.get(
      `${OPENSEA_API}/chain/solana/collection/${collectionSlug}/nfts`,
      {
        params: {
          limit: 30
        },
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'X-API-KEY': process.env.OPENSEA_API_KEY || ''
        }
      }
    );

    const listings: NFTListing[] = response.data.nfts
      .filter((nft: any) => nft.seaport_sell_orders && nft.seaport_sell_orders.length > 0)
      .map((nft: any) => {
        const order = nft.seaport_sell_orders[0];
        // Convert price from wei to SOL (adjust based on actual API response)
        const price = parseFloat(order.current_price) / 1e9; 
        
        return {
          mint: nft.identifier,
          auctionHouse: "OpenSea" as AuctionHouse,
          price: new BN(Math.floor(price * 1e9)), // Convert SOL to lamports
          currency: "SOL",
          timestamp: Date.now(),
          sellerPubkey: order.maker?.address || "opensea_seller"
        };
      })
      .filter((listing: NFTListing) => listing.price.gt(new BN(0)));

    console.log(`✅ OpenSea: Fetched ${listings.length} listings for ${collectionSlug}`);
    return listings;

  } catch (error: any) {
    console.error(`❌ OpenSea listings failed for ${collectionSlug}:`, error.message);
    return [];
  }
}

// OpenSea doesn't have a simple bids API, return empty array
export async function fetchBids(collectionSlug: string): Promise<NFTBid[]> {
  return [];
}
