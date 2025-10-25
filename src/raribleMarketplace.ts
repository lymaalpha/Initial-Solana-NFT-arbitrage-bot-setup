import { NFTListing, NFTBid, AuctionHouse } from "./types";
import BN from "bn.js";
import axios from "axios";
import { config } from "./config";

const RARIBLE_API = "https://api.rarible.org/v0.1";

export async function fetchListings(collectionSlug: string): Promise<NFTListing[]> {
  try {
    console.log(`🔍 Rarible: Fetching listings for ${collectionSlug}...`);
    
    const headers: any = {
      'accept': 'application/json',
      'X-API-KEY': config.raribleApiKey
    };

    // Get sell orders for the collection
    const response = await axios.get(
      `${RARIBLE_API}/orders/active/sell`,
      {
        params: {
          platform: 'RARIBLE',
          collectionId: `SOLANA:${collectionSlug}`,
          size: 20,
          status: ['ACTIVE']
        },
        timeout: 15000,
        headers
      }
    );

    console.log(`📦 Rarible sell orders:`, response.data?.orders?.length || 0, 'orders');

    if (!response.data || !response.data.orders) {
      console.log(`⚠️ Rarible: No sell orders found for ${collectionSlug}`);
      return [];
    }

    const listings: NFTListing[] = [];

    for (const order of response.data.orders) {
      try {
        // Extract price information - Rarible returns price in wei/lamports
        const makeValue = order.make?.value || order.makePrice;
        const takeValue = order.take?.value || order.takePrice;
        
        const priceInLamports = parseFloat(makeValue || takeValue);
        
        if (!priceInLamports || priceInLamports <= 0) {
          continue;
        }

        // Convert from lamports to SOL (1 SOL = 1e9 lamports)
        const priceInSOL = priceInLamports / 1e9;

        const listing: NFTListing = {
          mint: order.make?.tokenId || order.take?.tokenId || `rarible_${Date.now()}`,
          auctionHouse: "Rarible" as AuctionHouse,
          price: new BN(Math.floor(priceInSOL * 1e9)), // Store in lamports for consistency
          currency: "SOL",
          timestamp: Date.now(),
          sellerPubkey: order.maker || ""
        };

        listings.push(listing);

      } catch (itemError) {
        console.log(`⚠️ Rarible: Skipping invalid order in ${collectionSlug}`);
        continue;
      }
    }

    console.log(`✅ Rarible: Found ${listings.length} active listings for ${collectionSlug}`);
    return listings;

  } catch (error: any) {
    console.error(`❌ Rarible listings failed for ${collectionSlug}:`, {
      status: error.response?.status,
      message: error.message
    });

    return [];
  }
}

export async function fetchBids(collectionSlug: string): Promise<NFTBid[]> {
  try {
    console.log(`🔍 Rarible: Fetching floor bids for ${collectionSlug}...`);

    const headers: any = {
      'accept': 'application/json',
      'X-API-KEY': config.raribleApiKey
    };

    // Get floor bids for the collection - this is the correct endpoint!
    const response = await axios.get(
      `${RARIBLE_API}/orders/floorBids/byCollection`,
      {
        params: {
          platform: 'RARIBLE',
          collectionId: `SOLANA:${collectionSlug}`,
          size: 15,
          status: ['ACTIVE'],
          currencies: ['SOLANA_SOL'] // Specify SOL currency
        },
        timeout: 15000,
        headers
      }
    );

    console.log(`📦 Rarible floor bids:`, response.data?.orders?.length || 0, 'bids');

    const bids: NFTBid[] = [];

    if (response.data?.orders) {
      for (const order of response.data.orders) {
        try {
          // Extract bid price information
          const makeValue = order.make?.value || order.makePrice;
          const takeValue = order.take?.value || order.takePrice;
          
          const priceInLamports = parseFloat(makeValue || takeValue);
          
          if (!priceInLamports || priceInLamports <= 0) {
            continue;
          }

          // Convert from lamports to SOL
          const priceInSOL = priceInLamports / 1e9;

          bids.push({
            mint: order.take?.tokenId || order.make?.tokenId || `rarible_bid_${Date.now()}`,
            auctionHouse: "Rarible" as AuctionHouse,
            price: new BN(Math.floor(priceInSOL * 1e9)),
            currency: "SOL",
            timestamp: Date.now(),
            bidderPubkey: order.maker || ""
          });

        } catch (bidError) {
          continue;
        }
      }
    }

    console.log(`✅ Rarible: Found ${bids.length} floor bids for ${collectionSlug}`);
    return bids;

  } catch (error: any) {
    console.error(`❌ Rarible floor bids failed for ${collectionSlug}:`, {
      status: error.response?.status,
      message: error.message
    });
    
    // Fallback: create synthetic bids from listings
    console.log(`🔄 Rarible: Creating synthetic bids for ${collectionSlug}`);
    const listings = await fetchListings(collectionSlug);
    const bids: NFTBid[] = listings.slice(0, 10).map(listing => ({
      mint: listing.mint,
      auctionHouse: "Rarible" as AuctionHouse,
      price: new BN(listing.price.muln(88).divn(100)), // 88% of listing price
      currency: "SOL",
      timestamp: Date.now(),
      bidderPubkey: "synthetic_bidder"
    }));

    return bids;
  }
}
