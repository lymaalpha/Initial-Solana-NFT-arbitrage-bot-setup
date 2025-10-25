import { NFTListing, NFTBid, AuctionHouse } from "./types";
import BN from "bn.js";
import axios from "axios";

const MAGIC_EDEN_API = "https://api-mainnet.magiceden.io/v2";

export async function fetchListings(collectionSlug: string): Promise<NFTListing[]> {
  try {
    const response = await axios.get(
      `${MAGIC_EDEN_API}/collections/${collectionSlug}/listings`,
      {
        params: {
          offset: 0,
          limit: 100 // Adjust based on your needs
        },
        timeout: 10000
      }
    );

    const listings: NFTListing[] = response.data.map((item: any) => ({
      mint: item.tokenMint,
      auctionHouse: "MagicEden" as AuctionHouse,
      price: new BN(Math.floor(item.price * 1e9)), // Convert SOL to lamports
      currency: "SOL",
      timestamp: Date.now(),
      sellerPubkey: item.seller
    }));

    console.log(`✅ Magic Eden: Fetched ${listings.length} listings for ${collectionSlug}`);
    return listings;

  } catch (error) {
    console.error(`❌ Magic Eden listings failed for ${collectionSlug}:`, error);
    return [];
  }
}

export async function fetchBids(collectionSlug: string): Promise<NFTBid[]> {
  try {
    const response = await axios.get(
      `${MAGIC_EDEN_API}/collections/${collectionSlug}/activities`,
      {
        params: {
          offset: 0,
          limit: 100,
          type: "bid" // Filter for bids only
        },
        timeout: 10000
      }
    );

    const bids: NFTBid[] = response.data
      .filter((activity: any) => activity.type === "bid")
      .map((activity: any) => ({
        mint: activity.tokenMint,
        auctionHouse: "MagicEden" as AuctionHouse,
        price: new BN(Math.floor(activity.price * 1e9)),
        currency: "SOL",
        timestamp: Date.now(),
        bidderPubkey: activity.buyer
      }));

    console.log(`✅ Magic Eden: Fetched ${bids.length} bids for ${collectionSlug}`);
    return bids;

  } catch (error) {
    console.error(`❌ Magic Eden bids failed for ${collectionSlug}:`, error);
    return [];
  }
}
