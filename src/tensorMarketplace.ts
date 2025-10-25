import { NFTListing, NFTBid, AuctionHouse } from "./types";
import BN from "bn.js";
import axios from "axios";

const TENSOR_API = "https://api.tensor.so/api";

export async function fetchListings(collectionSlug: string): Promise<NFTListing[]> {
  try {
    const response = await axios.post(
      `${TENSOR_API}/graphql`,
      {
        query: `
          query GetListings($slug: String!) {
            activeListings(collection: $slug, limit: 50) {
              mint
              price
              seller
            }
          }
        `,
        variables: { slug: collectionSlug }
      },
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const listings: NFTListing[] = response.data.data.activeListings.map((item: any) => ({
      mint: item.mint,
      auctionHouse: "Tensor" as AuctionHouse,
      price: new BN(Math.floor(item.price * 1e9)), // Convert to lamports
      currency: "SOL",
      timestamp: Date.now(),
      sellerPubkey: item.seller
    }));

    console.log(`✅ Tensor: Fetched ${listings.length} listings for ${collectionSlug}`);
    return listings;

  } catch (error: any) {
    console.error(`❌ Tensor listings failed for ${collectionSlug}:`, error.message);
    return [];
  }
}

export async function fetchBids(collectionSlug: string): Promise<NFTBid[]> {
  try {
    const response = await axios.post(
      `${TENSOR_API}/graphql`,
      {
        query: `
          query GetBids($slug: String!) {
            activeBids(collection: $slug, limit: 30) {
              mint
              price
              buyer
            }
          }
        `,
        variables: { slug: collectionSlug }
      },
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const bids: NFTBid[] = response.data.data.activeBids.map((item: any) => ({
      mint: item.mint,
      auctionHouse: "Tensor" as AuctionHouse,
      price: new BN(Math.floor(item.price * 1e9)),
      currency: "SOL",
      timestamp: Date.now(),
      bidderPubkey: item.buyer
    }));

    console.log(`✅ Tensor: Fetched ${bids.length} bids for ${collectionSlug}`);
    return bids;

  } catch (error: any) {
    console.error(`❌ Tensor bids failed for ${collectionSlug}:`, error.message);
    return [];
  }
}
