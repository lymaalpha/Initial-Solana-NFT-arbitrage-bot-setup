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
          limit: 30  // Smaller for reliability
        },
        timeout: 15000,
        headers: {
          'User-Agent': 'Arbitrage-Bot/1.0'
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
    // For Magic Eden, we'll create synthetic bids from listings
    const listings = await fetchListings(collectionSlug);
    
    // Create bids that are 90% of listing prices
    const bids: NFTBid[] = listings.slice(0, 20).map(listing => ({
      mint: listing.mint,
      auctionHouse: "MagicEden" as AuctionHouse,
      price: new BN(listing.price.muln(90).divn(100)), // 90% as bid
      currency: "SOL",
      timestamp: Date.now(),
      bidderPubkey: "synthetic_bidder_me"
    }));

    console.log(`✅ Magic Eden: Created ${bids.length} synthetic bids for ${collectionSlug}`);
    return bids;

  } catch (error: any) {
    console.error(`❌ Magic Eden bids failed for ${collectionSlug}:`, error.message);
    return [];
  }
}
