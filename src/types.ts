// src/types.ts (ABSOLUTE FINAL)
import BN from "bn.js";

export type AuctionHouse = "MagicEden" | "Rarible" | "Moralis" | "Tensor";

export interface NFTMarketData {
  mint: string; // ALWAYS A STRING
  auctionHouse: AuctionHouse;
  price: BN;
  sellerPubkey?: string;
  bidderPubkey?: string;
}

export interface NFTListing extends NFTMarketData {}
export interface NFTBid extends NFTMarketData {}

export interface ArbitrageSignal {
  targetListing: NFTListing;
  targetBid: NFTBid;
  estimatedNetProfit: BN;
  estimatedGrossProfit: BN;
  rawProfit: BN;
  strategy: string;
  marketplaceIn: AuctionHouse;
  marketplaceOut: Auctionhouse;
  confidence?: number;
  timestamp: number;
}

export interface ExecuteSaleParams {
  listing: NFTListing;
  bid: NFTBid;
}

export interface SaleResponse {
  txSig?: string;
  error?: string;
}

export interface BotConfig { /* ... your full config interface ... */ }
