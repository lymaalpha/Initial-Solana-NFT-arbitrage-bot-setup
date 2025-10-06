import BN from 'bn.js';
import axios from 'axios';
import { NFTListing, NFTBid } from './types';
import { config } from './config';

export async function fetchListings(collectionMint: string): Promise<NFTListing[]> {
  try {
    const url = `https://api.helius.xyz/v0/collections/${collectionMint}/listings?api-key=${config.heliusApiKey}&limit=50`;
    const resp = await axios.get(url);
    const now = Date.now();

    return resp.data.map((item: any) => ({  // Typed as any for API flexibility
      mint: item.tokenMint,
      auctionHouse: 'Helius',
      price: new BN(item.price * 1e9),
      assetMint: item.tokenMint,
      currency: 'SOL',
      timestamp: now,
      sellerPubkey: item.seller,
    }));
  } catch (err) {
    console.error('Helius fetchListings error:', err);
    return [];
  }
}

export async function fetchBids(collectionMint: string): Promise<NFTBid[]> {
  try {
    // Helius bids endpoint (if available; fallback to Tensor)
    const url = `https://api.helius.xyz/v0/collections/${collectionMint}/bids?api-key=${config.heliusApiKey}&limit=50`;
    const resp = await axios.get(url);
    const now = Date.now();

    return resp.data.map((item: any) => ({
      mint: item.mint,
      auctionHouse: 'Helius',
      price: new BN(item.price * 1e9),
      assetMint: 'So11111111111111111111111111111111111111112',
      currency: 'SOL',
      timestamp: now,
      bidderPubkey: item.bidder,
    }));
  } catch (err) {
    console.error('Helius fetchBids error:', err);
    return [];
  }
}
