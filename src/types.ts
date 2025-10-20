import BN from 'bn.js';

export type AuctionHouse = 'MagicEden' | 'Tensor' | 'moralis'; // ✅ FIXED: Added ALL marketplaces
export type Currency = 'SOL';
export type ExecutorType = 'direct' | 'flash_loan';
export type TradeType = 'signal' | 'executed' | 'failed';

export interface NFTMarketData {
  mint: string;
  auctionHouse: AuctionHouse;  // ✅ Now supports MagicEden, Tensor, moralis
  price: BN;
  currency: Currency;
  timestamp?: number;
  bidderPubkey?: string;       // ✅ Only for bids
}

export interface NFTListing extends NFTMarketData {
  sellerPubkey: string;        // ✅ Only for listings
}

export interface NFTBid extends NFTMarketData {
  bidderPubkey: string;        // ✅ Required for bids
}

export interface ArbitrageSignal {
  targetListing: NFTListing;
  targetBid: NFTBid;
  estimatedNetProfit: BN;
  rawProfit: BN;
  confidence: number;
  timestamp: number;
}

export interface TradeLog {
  timestamp: number;
  mint: string;
  buyPrice: BN;
  sellPrice: BN;
  netProfit: BN;
  currency: Currency;
  txSig?: string;
  type: TradeType;
  executorType?: ExecutorType;
  buyAuctionHouse?: AuctionHouse;  // ✅ Added: Which marketplace bought from
  sellAuctionHouse?: AuctionHouse; // ✅ Added: Which marketplace sold to
}
