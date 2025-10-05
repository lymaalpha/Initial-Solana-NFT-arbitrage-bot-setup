// heliusMarketplace.ts
import BN from 'bn.js';
import axios from 'axios';
import { NFTListing } from './types';
import { config } from './config';

export async function fetchListings(collectionMint: string): Promise<NFTListing[]> {
  try {
    const url = `https://api.helius.xyz/v0/collections/${collectionMint}/nfts?api-key=${config.heliusApiKey}&limit=50`;
    const resp = await axios.get(url);
    const now = Date.now();

    return resp.data
      .filter((item: any) => item.price || item.estimatedPriceSOL) // only include NFTs with a price
      .map((item: any) => {
        const priceSOL = item.price ?? item.estimatedPriceSOL ?? 0;
        return {
          mint: item.mint,
          auctionHouse: 'Helius',
          price: new BN(priceSOL * 1e9),
          assetMint: item.mint,
          currency: 'SOL',
          timestamp: now,
          sellerPubkey: item.seller ?? null,
        };
      });
  } catch (err) {
    console.error('Helius fetchListings error:', err);
    return [];
  }
}
