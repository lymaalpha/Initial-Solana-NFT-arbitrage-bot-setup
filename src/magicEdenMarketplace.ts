import { NFTListing, NFTBid, AuctionHouse } from "./types";
import BN from "bn.js";
import axios from "axios";

const MAGIC_EDEN_API = "https://api-mainnet.magiceden.dev/v2";

export async function fetchListings(collectionSlug: string): Promise<NFTListing[]> {
  try {
    const response = await axios.get(
      `${MAGIC_EDEN_API}/collections/${collectionSlug}/listings`,
      {
        params: {
          offset: 0,
          limit: 50 // Reduced for stability
        },
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );

    const listings: NFTListing[] = response.data.map((item: any) => ({
      mint: item.tokenMint,
      auctionHouse: "MagicEden" as AuctionHouse,
      price: new BN(Math.floor(item.price * 1e9)),
      currency: "SOL",
      timestamp: Date.now(),
      sellerPubkey: item.seller || ""
    }));

    console.log(`✅ Magic Eden: Fetched ${listings.length} listings for ${collectionSlug}`);
    return listings;

  } catch (error: any) {
    console.error(`❌ Magic Eden listings failed for ${collectionSlug}:`, error.message);
    return [];
  }
}

export async function fetchBids(collectionSlug: string): Promise<NFTBid[]> {
  try {
    // Magic Eden doesn't have a reliable bids endpoint, so we'll use activities
    const response = await axios.get(
      `${MAGIC_EDEN_API}/collections/${collectionSlug}/activities`,
      {
        params: {
          offset: 0,
          limit: 50,
          type: "buyNow" // Use buyNow activities as proxy for current market
        },
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );

    // Use recent sales as proxy for bid levels
    const bids: NFTBid[] = response.data
      .filter((activity: any) => activity.type === "buyNow")
      .slice(0, 20) // Take most recent 20
      .map((activity: any) => ({
        mint: activity.tokenMint,
        auctionHouse: "MagicEden" as AuctionHouse,
        price: new BN(Math.floor(activity.price * 1e9 * 1.05)), // Add 5% as potential bid
        currency: "SOL",
        timestamp: Date.now(),
        bidderPubkey: activity.buyer || ""
      }));

    console.log(`✅ Magic Eden: Fetched ${bids.length} bid proxies for ${collectionSlug}`);
    return bids;

  } catch (error: any) {
    console.error(`❌ Magic Eden bids failed for ${collectionSlug}:`, error.message);
    return [];
  }
}
