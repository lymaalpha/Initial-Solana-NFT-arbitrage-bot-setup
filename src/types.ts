// src/types.ts - ✅ COMPLETE TYPE DEFINITIONS
import BN from 'bn.js';

export type AuctionHouse = 'MagicEden' | 'Tensor' | 'Rarible' | 'moralis';

export interface NFTListing {
  mint: string;
  auctionHouse: AuctionHouse;
  price: BN;
  currency: 'SOL';
  timestamp: number;
  sellerPubkey: string;
}

export interface NFTBid {
  mint: string;
  auctionHouse: AuctionHouse;
  price: BN;
  currency: 'SOL';
  timestamp: number;
  bidderPubkey: string;
}

// ✅ COMPLETE ArbitrageSignal
export interface ArbitrageSignal {
  targetListing: NFTListing;
  targetBid: NFTBid | NFTListing;
  estimatedNetProfit: BN;
  estimatedGrossProfit?: BN;
  strategy?: string;
  marketplaceIn?: string;
  marketplaceOut?: string;
  confidence?: number;
  rawProfit?: BN; // ✅ ADDED for scanForArbitrage
}

// ✅ MISSING TradeLog type
export interface TradeLog {
  success: boolean;
  signal: ArbitrageSignal;
  txHash?: string;
  error?: string;
  profitSOL?: number;
  timestamp: number;
}

// ✅ Config type
export interface BotConfig {
  simulateOnly: boolean;
  minProfitLamports: BN;
  maxConcurrentTrades: number;
  scanIntervalMs: number;
}

// ✅ Metrics type for logging
export interface MetricsLog {
  message: string;
  [key: string]: any;
}
