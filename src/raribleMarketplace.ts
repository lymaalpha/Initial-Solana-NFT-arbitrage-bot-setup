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

    // Add API key if available
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

    // ... rest of implementation
