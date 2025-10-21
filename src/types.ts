// src/types.ts
import BN from 'bn.js';

export type AuctionHouse = 'MagicEden' | 'Tensor' | 'Rarible';

export interface NFTListing {
  mint: string;
  auctionHouse: AuctionHouse;
  price: BN;
  currency: 'SOL'; // Only SOL for consistency
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

// **FIX 1: Enhanced ArbitrageSignal with missing properties**
export interface ArbitrageSignal {
  targetListing: NFTListing;
  targetBid: NFTBid | NFTListing; // Can be bid or listing for arbitrage
  estimatedNetProfit: BN;
  estimatedGrossProfit?: BN;     // ✅ ADDED
  strategy?: string;             // ✅ ADDED
  marketplaceIn?: string;        // ✅ ADDED
  marketplaceOut?: string;       // ✅ ADDED
  confidence?: number;           // Optional confidence score
}
