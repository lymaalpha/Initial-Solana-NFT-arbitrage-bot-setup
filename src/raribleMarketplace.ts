import { NFTListing, NFTBid, AuctionHouse } from "./types";
import BN from "bn.js";
import axios from "axios";

const RARIBLE_API = "https://api.rarible.org/v0.1";

export async function fetchListings(collectionSlug: string): Promise<NFTListing[]> {
  try {
    const response = await axios.get(
      `${RARIBLE_API}/items/byCollection`,
      {
        params: {
          collection: `SOLANA:${collectionSlug}`,
          size: 100
        },
        timeout: 10000
      }
    );

    const listings: NFTListing[] = response.data.items
      .filter((item: any) => item.meta && item.meta.attributes && item.meta.attributes.price)
      .map((item: any) => ({
        mint: item.meta.attributes.mint || item.id,
        auctionHouse: "Rarible" as AuctionHouse,
        price: new BN(Math.floor(parseFloat(item.meta.attributes.price) * 1e9)),
        currency: "SOL",
        timestamp: Date.now(),
        sellerPubkey: item.sellers?.[0] || ""
      }));

    console.log(`✅ Rarible: Fetched ${listings.length} listings for ${collectionSlug}`);
    return listings;

  } catch (error) {
    console.error(`❌ Rarible listings failed for ${collectionSlug}:`, error);
    return [];
  }
}

export async function fetchBids(collectionSlug: string): Promise<NFTBid[]> {
  try {
    // Rarible bids/offers endpoint
    const response = await axios.get(
      `${RARIBLE_API}/items/byCollection`,
      {
        params: {
          collection: `SOLANA:${collectionSlug}`,
          size: 100,
          showDeleted: false,
          includeMeta: true
        },
        timeout: 10000
      }
    );

    const bids: NFTBid[] = response.data.items
      .filter((item: any) => item.bestBidOrder)
      .map((item: any) => ({
        mint: item.meta?.attributes?.mint || item.id,
        auctionHouse: "Rarible" as AuctionHouse,
        price: new BN(Math.floor(parseFloat(item.bestBidOrder.makePrice) * 1e9)),
        currency: "SOL",
        timestamp: Date.now(),
        bidderPubkey: item.bestBidOrder.maker || ""
      }));

    console.log(`✅ Rarible: Fetched ${bids.length} bids for ${collectionSlug}`);
    return bids;

  } catch (error) {
    console.error(`❌ Rarible bids failed for ${collectionSlug}:`, error);
    return [];
  }
}
