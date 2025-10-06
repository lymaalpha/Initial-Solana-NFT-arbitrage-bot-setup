import BN from 'bn.js';
import axios from 'axios';
import { NFTListing, NFTBid } from './types';
import { config } from './config';

const MAGIC_EDEN_API = 'https://api-mainnet.magiceden.dev/v2';

export async function fetchListings(collectionSymbol: string): Promise<NFTListing[]> {
  try {
    const url = `${MAGIC_EDEN_API}/collections/${collectionSymbol}/listings?limit=50`;
    const resp = await axios.get(url, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ArbitrageBot/1.0'
      }
    });
    const now = Date.now();

    return resp.data.map((item: any) => ({
      mint: item.tokenMint,
      auctionHouse: 'MagicEden',
      price: new BN(item.price * 1e9), // Convert SOL to lamports
      assetMint: item.tokenMint,
      currency: 'SOL',
      timestamp: now,
      sellerPubkey: item.seller,
    }));
  } catch (err: unknown) {
    console.error('Magic Eden fetchListings error:', err);
    return [];
  }
}

export async function fetchBids(collectionSymbol: string): Promise<NFTBid[]> {
  try {
    const url = `${MAGIC_EDEN_API}/collections/${collectionSymbol}/activities?limit=50`;
    const resp = await axios.get(url, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ArbitrageBot/1.0'
      }
    });
    const now = Date.now();

    // Filter for bid activities only
    const bids = resp.data
      .filter((item: any) => item.type === 'bid')
      .map((item: any) => ({
        mint: item.tokenMint,
        auctionHouse: 'MagicEden',
        price: new BN(item.price * 1e9),
        assetMint: item.tokenMint,
        currency: 'SOL',
        timestamp: now,
        bidderPubkey: item.buyer,
      }));

    return bids;
  } catch (err: unknown) {
    console.error('Magic Eden fetchBids error:', err);
    return [];
  }
}
