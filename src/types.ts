// src/types.ts (FINAL, SIMPLIFIED)
import BN from "bn.js";

export type AuctionHouse = "MagicEden" | "Tensor" | "Rarible" | "Moralis";
export type Currency = "SOL";

export interface NFTMarketData {
  mint: string; // MINT IS ALWAYS A STRING
  auctionHouse: AuctionHouse;
  price: BN;
  currency: Currency;
  timestamp?: number;
  bidderPubkey?: string;
  sellerPubkey?: string;
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

// SIMPLIFIED: Only contains the data needed for the trade itself.
export interface ExecuteSaleParams {
  listing: NFTListing;
  bid: NFTBid;
}

export interface SaleResponse {
  txSig?: string;
  error?: string;
}

// Other types for logging and config
export interface TradeLog { /* ... as before ... */ }
export interface BotConfig { /* ... as before ... */ }
