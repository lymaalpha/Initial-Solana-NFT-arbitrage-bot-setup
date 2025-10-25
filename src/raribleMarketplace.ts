import { NFTListing, NFTBid, AuctionHouse } from "./types";
import BN from "bn.js";
import axios from "axios";
import { config } from "./config";

const RARIBLE_API = "https://api.rarible.org/v0.1";

export async function fetchListings(collectionSlug: string): Promise<NFTListing[]> {
  try {
    console.log(`🔍 Rarible: Fetching sell orders for ${collectionSlug}...`);
    
    const headers: any = {
      'accept': 'application/json',
      'X-API-KEY': config.raribleApiKey || '11111111-1111-1111-1111-111111111111' // Use your actual key
    };

    // Get sell orders (listings) for the collection
    const response = await axios.get(
      `${RARIBLE_API}/orders/active/sell`,
      {
        params: {
          blockchain: 'SOLANA',
          collection: collectionSlug,
          size: 20,
          status: ['ACTIVE']
        },
        timeout: 15000,
        headers
      }
    );

    console.log(`📦 Rarible orders response:`, response.data?.orders?.length || 0, 'orders');

    if (!response.data || !response.data.orders) {
      console.log(`⚠️ Rarible: No sell orders found for ${collectionSlug}`);
      return [];
    }

    const listings: NFTListing[] = [];

    for (const order of response.data.orders) {
      try {
        // Extract price from order - convert from wei/lamports to SOL
        const makePrice = parseFloat(order.makePrice);
        const takePrice = parseFloat(order.takePrice);
        
        // Use takePrice (what seller receives) or makePrice (what buyer gives)
        const priceInWei = takePrice || makePrice;
        
        if (!priceInWei || priceInWei <= 0) {
          continue;
        }

        // Convert from wei/lamports to SOL (1 SOL = 1e9 lamports)
        const priceInSOL = priceInWei / 1e9;

        const listing: NFTListing = {
          mint: order.make?.tokenId || order.take?.tokenId || `rarible_${Date.now()}`,
          auctionHouse: "Rarible" as AuctionHouse,
          price: new BN(Math.floor(priceInSOL * 1e9)), // Convert back to lamports for consistency
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

    console.log(`✅ Rarible: Found ${listings.length} active sell orders for ${collectionSlug}`);
    return listings;

  } catch (error: any) {
    console.error(`❌ Rarible sell orders failed for ${collectionSlug}:`, {
      status: error.response?.status,
      message: error.message,
      url: error.config?.url
    });

    return [];
  }
}

export async function fetchBids(collectionSlug: string): Promise<NFTBid[]> {
  try {
    console.log(`🔍 Rarible: Fetching bid orders for ${collectionSlug}...`);

    const headers: any = {
      'accept': 'application/json',
      'X-API-KEY': config.raribleApiKey || '11111111-1111-1111-1111-111111111111'
    };

    // Get bid orders for the collection
    const response = await axios.get(
      `${RARIBLE_API}/orders/active/bid`,
      {
        params: {
          blockchain: 'SOLANA',
          collection: collectionSlug,
          size: 15,
          status: ['ACTIVE']
        },
        timeout: 15000,
        headers
      }
    );

    console.log(`📦 Rarible bids response:`, response.data?.orders?.length || 0, 'bids');

    const bids: NFTBid[] = [];

    if (response.data?.orders) {
      for (const order of response.data.orders) {
        try {
          const makePrice = parseFloat(order.makePrice);
          const takePrice = parseFloat(order.takePrice);
          
          const priceInWei = takePrice || makePrice;
          
          if (!priceInWei || priceInWei <= 0) {
            continue;
          }

          // Convert from wei/lamports to SOL
          const priceInSOL = priceInWei / 1e9;

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

    console.log(`✅ Rarible: Found ${bids.length} active bids for ${collectionSlug}`);
    return bids;

  } catch (error: any) {
    console.error(`❌ Rarible bid orders failed for ${collectionSlug}:`, error.message);
    
    // Fallback to synthetic bids from listings
    console.log(`🔄 Rarible: Creating synthetic bids for ${collectionSlug}`);
    const listings = await fetchListings(collectionSlug);
    const bids: NFTBid[] = listings.slice(0, 10).map(listing => ({
      mint: listing.mint,
      auctionHouse: "Rarible" as AuctionHouse,
      price: new BN(listing.price.muln(90).divn(100)), // 90% of listing price
      currency: "SOL",
      timestamp: Date.now(),
      bidderPubkey: "synthetic_bidder"
    }));

    return bids;
  }
}
