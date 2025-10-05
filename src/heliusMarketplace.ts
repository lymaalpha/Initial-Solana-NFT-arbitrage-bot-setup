import BN from 'bn.js';
import axios from 'axios';
import { NFTListing } from './types';
import { config } from './config';

export async function fetchListings(collectionMint: string): Promise<NFTListing[]> {
  try {
    const url = `https://api.helius.xyz/v0/collections/${collectionMint}/listings?api-key=${config.heliusApiKey}&limit=50`;
    const resp = await axios.get(url);
    const now = Date.now();

    return resp.data.map((item: any) => ({
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
