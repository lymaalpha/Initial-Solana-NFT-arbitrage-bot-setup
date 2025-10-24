// src/types.ts (ABSOLUTE FINAL - COMPLETE)
import BN from "bn.js";

export type AuctionHouse = "MagicEden" | "Rarible" | "Moralis" | "Tensor";
export type Currency = "SOL";

export interface NFTMarketData {
  mint: string;
  auctionHouse: AuctionHouse;
  price: BN;
  currency: Currency;
  timestamp?: number;
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
  marketplaceOut: AuctionHouse;
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

// RE-ADDED THE MISSING INTERFACE
export interface TradeLog {
  timestamp: string;
  mint: string;
  profit: number;
  txSig: string;
  type: "simulated" | "executed" | "failed";
}

// RE-ADDED THE MISSING INTERFACE
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
