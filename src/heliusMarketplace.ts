import BN from 'bn.js';
import axios from 'axios';
import { NFTListing, NFTBid } from './types';
import { config } from './config';

export async function fetchListings(collectionMint: string, auctionHouse: string = 'Helius'): Promise<NFTListing[]> {
  try {
    let url = '';
    if (auctionHouse === 'Helius') {
      url = `https://api.helius.xyz/v0/collections/${collectionMint}/listings?api-key=${config.heliusApiKey}&limit=50`;
    } else if (auctionHouse === 'MagicEden') {
      url = `https://api-mainnet.magiceden.dev/v2/collections/${collectionMint}/listings?offset=0&limit=50`;
    } // Add more

    const resp = await axios.get(url);
    const now = Date.now();

    return resp.data.map((item: any) => ({
      mint: item.tokenMint,
      auctionHouse,
      price: new BN(item.price * 1e9),
      assetMint: item.tokenMint,  // Or WSOL
      currency: 'SOL',
      timestamp: item.timestamp || now,
      sellerPubkey: item.seller,
    })).filter(item => item.price.gt(new BN(0)));  // Filter invalid
  } catch (err) {
    console.error(`${auctionHouse} fetchListings error:`, err);
    return [];
  }
}

export async function fetchBids(collectionMint: string, auctionHouse: string = 'Tensor'): Promise<NFTBid[]> {
  try {
    let url = '';
    if (auctionHouse === 'Tensor') {
      url = `https://api.tensor.trade/v1/collections/${collectionMint}/bids?limit=50`;
    } else if (auctionHouse === 'MagicEden') {
      url = `https://api-mainnet.magiceden.dev/v2/collections/${collectionMint}/bids?limit=50`;
    } // Add more

    const resp = await axios.get(url);
    const now = Date.now();

    return resp.data.map((item: any) => ({
      mint: item.mint,
      auctionHouse,
      price: new BN(item.price * 1e9),
      assetMint: 'So11111111111111111111111111111111111111112',  // WSOL
      currency: 'SOL',
      timestamp: item.timestamp || now,
      bidderPubkey: item.bidder,
    })).filter(item => item.price.gt(new BN(0)));
  } catch (err) {
    console.error(`${auctionHouse} fetchBids error:`, err);
    return [];
  }
}
