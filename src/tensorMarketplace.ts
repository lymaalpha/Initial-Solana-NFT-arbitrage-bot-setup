// tensorMarketplace.ts
import BN from 'bn.js';
import { NFTBid } from './types';
import { TensorswapClient } from '@tensor-oss/tensorswap-sdk';

const client = new TensorswapClient();

export async function fetchBids(collectionMint: string): Promise<NFTBid[]> {
  try {
    const offers = await client.getOffersByCollection(collectionMint); // SDK call
    const now = Date.now();

    return offers.map((offer: any) => ({
      mint: offer.mint,
      auctionHouse: 'Tensor',
      price: new BN(offer.price * 1e9), // SOL → lamports
      assetMint: offer.mint,
      currency: 'SOL',
      timestamp: now,
      bidderPubkey: offer.bidder,
      expiresAt: offer.expiresAt ? new Date(offer.expiresAt).getTime() : undefined,
    }));
  } catch (err) {
    console.error('Tensor fetchBids error:', err);
    return [];
  }
}
