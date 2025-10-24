// src/types.ts (FINAL, UNIFIED, CORRECTED)
import BN from "bn.js";

// Basic Types - CORRECTED to include all marketplaces
export type AuctionHouse = "MagicEden" | "Tensor" | "Rarible" | "Moralis";
export type Currency = "SOL";

// Data Structures - CORRECTED mint to be string ONLY
export interface NFTMarketData {
  mint: string;
  auctionHouse: AuctionHouse;
  price: BN;
  currency: Currency;
  timestamp?: number;
  bidderPubkey?: string;
  sellerPubkey?: string;
}

export interface NFTListing extends NFTMarketData {}
export interface NFTBid extends NFTMarketData {}

// Arbitrage & Execution - CORRECTED to include missing properties
export interface ArbitrageSignal {
  targetListing: NFTListing;
  targetBid: NFTBid;
  estimatedNetProfit: BN;
  estimatedGrossProfit: BN;
  rawProfit: BN; // Added missing property
  strategy: string;
  marketplaceIn: AuctionHouse;
  marketplaceOut: AuctionHouse;
  confidence?: number;
  timestamp: number;
}

// All other types remain the same, but are included for completeness
export interface ExecuteSaleParams {
  listing: NFTListing;
  bid: NFTBid;
}

export interface SaleResponse {
  txSig?: string;
  error?: string;
}

export interface TradeLog {
  timestamp: string;
  mint: string;
  profit: number;
  txSig: string;
  type: "simulated" | "executed" | "failed";
}

export interface BotConfig {
  rpcUrl: string;
  walletPrivateKey: string;
  heliusApiKey: string;
  openseaApiKey: string;
  moralisApiKey: string;
  collections: string[];
  marketplaces: string[];
  minProfitLamports: BN;
  feeBufferLamports: BN;
  scanIntervalMs: number;
  maxConcurrentTrades: number;
  minSignals: number;
  enableJsonLogging: boolean;
  enableCsvLogging: boolean;
  logLevel: string;
  simulateOnly: boolean;
}
