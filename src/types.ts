import BN from 'bn.js';

export type AuctionHouse = 'Tensor';
export type Currency = 'SOL';
export type ExecutorType = 'direct' | 'flash_loan';
export type TradeType = 'signal' | 'executed' | 'failed';

export interface NFTMarketData {
  mint: string;
  auctionHouse: AuctionHouse;
  price: BN;
  currency: Currency;
  timestamp?: number;
  bidderPubkey?: string;
}

export interface NFTListing extends NFTMarketData {}
export interface NFTBid extends NFTMarketData {}

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
}
