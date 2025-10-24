// src/types.ts (FINAL, CLEANED VERSION)
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// Basic Types
export type AuctionHouse = "MagicEden" | "Tensor" | "Rarible" | "SimpleHash";
export type Currency = "SOL";

// Data Structures
export interface NFTMarketData {
  mint: string | PublicKey; // Allow both for flexibility
  auctionHouse: AuctionHouse;
  price: BN;
  currency: Currency;
  timestamp?: number;
  bidderPubkey?: string;
  sellerPubkey?: string;
}

export interface NFTListing extends NFTMarketData {}
export interface NFTBid extends NFTMarketData {}

// Arbitrage & Execution
export interface ArbitrageSignal {
  targetListing: NFTListing;
  targetBid: NFTBid;
  estimatedNetProfit: BN;
  estimatedGrossProfit: BN;
  strategy: string;
  marketplaceIn: AuctionHouse;
  marketplaceOut: AuctionHouse;
  confidence?: number;
  timestamp: number;
}

export interface ExecuteSaleParams {
  listing: NFTListing;
  bid: NFTBid;
  connection: Connection;
  payerKeypair: Keypair;
}

export interface SaleResponse {
  txSig?: string; // Corrected: Make optional
  error?: string; // Corrected: Make optional
}

// Logging
export interface TradeLog {
  timestamp: string;
  mint: string;
  profit: number;
  txSig: string;
  type: "simulated" | "executed" | "failed";
}

// Configuration
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
