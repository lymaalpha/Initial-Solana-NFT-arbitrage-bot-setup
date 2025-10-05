import BN from 'bn.js';

export type AuctionHouse = 'MagicEden' | 'Tensor' | 'OpenSea';
export type Currency = 'SOL' | 'USDC';
export type ExecutorType = 'direct' | 'flash_loan';
export type TradeType = 'signal' | 'executed' | 'failed';

export interface NFTMarketData {
  mint: string;
  auctionHouse: AuctionHouse;
  price: BN;
  assetMint: string;
  currency: Currency;
  timestamp?: number;
  sellerPubkey?: string;
}

export interface NFTListing extends NFTMarketData {
  duration?: number;
  reservePrice?: BN;
}

export interface NFTBid extends NFTMarketData {
  bidderPubkey?: string;
  expiresAt?: number;
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
  notes?: string;
  executorType?: ExecutorType;
}

export interface ScanMetrics {
  totalScans: number;
  signalsFound: number;
  tradesExecuted: number;
  totalProfit: BN;
  averageProfit: BN;
  successRate: number;
  lastScanTime: number;
  scanDuration?: number;
}
