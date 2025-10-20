import Moralis from 'moralis';
import { NFTListing, NFTBid } from './types';
import { config } from './config';
import { pnlLogger } from './pnlLogger';

Moralis.start({
  apiKey: config.moralisApiKey,
});

export async function fetchListings(collectionId: string): Promise<NFTListing[]> {
  try {
    const response = await Moralis.EvmApi.nft.getWalletNFTs({
      chain: 'solana',
      address: collectionId,  // Or wallet address for marketplace
      limit: 50,
    });
    const listings = response.result.map((item: any) => ({
      mint: item.token_id,
      auctionHouse: 'moralis',
      price: new BN(item.price?.total_price || 0),
      assetMint: item.token_id,
      currency: 'SOL',
      timestamp: Date.now(),
      sellerPubkey: item.owner_of,
    }));
    pnlLogger.logMetrics({ fetchedListings: listings.length, source: 'Moralis' });
    return listings;
  } catch (err) {
    pnlLogger.logError(err as Error, { collectionId });
    return [];
  }
}

export async function fetchBids(collectionId: string): Promise<NFTBid[]> {
  try {
    const response = await Moralis.EvmApi.nft.getNFTTrades({
      chain: 'solana',
      address: collectionId,
      limit: 50,
    });
    const bids = response.result.map((item: any) => ({
      mint: item.token_id,
      auctionHouse: 'moralis',
      price: new BN(item.price?.total_price || 0),
      assetMint: 'So11111111111111111111111111111111111111112',
      currency: 'SOL',
      timestamp: Date.now(),
      bidderPubkey: item.buyer,
    }));
    pnlLogger.logMetrics({ fetchedBids: bids.length, source: 'Moralis' });
    return bids;
  } catch (err) {
    pnlLogger.logError(err as Error, { collectionId });
    return [];
  }
}
