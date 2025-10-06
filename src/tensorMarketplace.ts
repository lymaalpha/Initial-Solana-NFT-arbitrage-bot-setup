import BN from 'bn.js';
import axios from 'axios';
import { NFTListing, NFTBid } from './types';
import { config } from './config';

export async function fetchListings(collectionMint: string): Promise<NFTListing[]> {
  try {
    const url = `https://api.tensor.trade/v1/collections/${collectionMint}/listings?limit=50`;
    const resp = await axios.get(url);
    const now = Date.now();

    return resp.data.map((item: any) => ({
      mint: item.mint,
      auctionHouse: 'Tensor',
      price: new BN(item.price * 1e9),
      assetMint: item.mint,
      currency: 'SOL',
      timestamp: now,
      sellerPubkey: item.seller,
    }));
  } catch (err: unknown) {  // Fixed: unknown
    console.error('Tensor fetchListings error:', err);
    return [];
  }
}

export async function fetchBids(collectionMint: string): Promise<NFTBid[]> {
  try {
    const url = `https://api.tensor.trade/v1/collections/${collectionMint}/bids?limit=50`;
    const resp = await axios.get(url);
    const now = Date.now();

    return resp.data.map((item: any) => ({
      mint: item.mint,
      auctionHouse: 'Tensor',
      price: new BN(item.price * 1e9),
      assetMint: 'So11111111111111111111111111111111111111112',
      currency: 'SOL',
      timestamp: now,
      bidderPubkey: item.bidder,
    }));
  } catch (err: unknown) {  // Fixed
    console.error('Tensor fetchBids error:', err);
    return [];
  }
}
