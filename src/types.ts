// src/types.ts - IMPROVED & COMPLETE
import BN from "bn.js";
import { Connection, Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js';

// ============================================================================
// CORE TYPES - IMPROVED
// ============================================================================

export type AuctionHouse = "MagicEden" | "Rarible";
export type Currency = "SOL";
export type BotMode = 'SIMULATION' | 'DRY_RUN' | 'LIVE_TRADING' | 'MAINTENANCE';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';
export type TradeType = "simulated" | "executed" | "failed";
export type TradeStatus = 'PENDING' | 'SIMULATED' | 'EXECUTING' | 'CONFIRMED' | 'FAILED';

// ============================================================================
// NFT MARKET DATA TYPES - IMPROVED VALIDATION
// ============================================================================

export interface NFTMarketData {
  mint: string;                    // ✅ Required - no optional
  auctionHouse: AuctionHouse;      // ✅ Strictly typed
  price: BN;                       // ✅ Required - no optional
  currency: Currency;              // ✅ Only "SOL" supported
  timestamp: number;               // ✅ Required - always track when data was fetched
  sellerPubkey?: string;
  bidderPubkey?: string;
}

export interface NFTListing extends NFTMarketData {
  // Could add listing-specific fields later
  // listingId?: string;
  // expiration?: number;
}

export interface NFTBid extends NFTMarketData {
  // Could add bid-specific fields later  
  // bidId?: string;
  // expiration?: number;
}

// ============================================================================
// ARBITRAGE TYPES - IMPROVED WITH BETTER STRUCTURE
// ============================================================================

export interface ArbitrageSignal {
  id: string;                      // ✅ ADDED: Unique identifier for tracking
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
  expiry?: number;                 // ✅ ADDED: When signal becomes invalid
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH'; // ✅ ADDED: Risk assessment
}

// ============================================================================
// TRADE EXECUTION TYPES - IMPROVED WITH BETTER ERROR HANDLING
// ============================================================================

export interface ExecuteSaleParams {
  connection: Connection;          // ✅ ADDED: Connection context
  payerKeypair: Keypair;           // ✅ ADDED: Payer context
  listing: NFTListing;
  bid: NFTBid;
  retryCount?: number;             // ✅ ADDED: Retry mechanism
}

export interface SaleResponse {
  success: boolean;                // ✅ ADDED: Explicit success flag
  txSig?: string;
  error?: string;
  instructions?: TransactionInstruction[]; // ✅ ADDED: For flash loan integration
  signers?: Keypair[];             // ✅ ADDED: Additional signers if needed
}

// ============================================================================
// TRADE LOG TYPES - IMPROVED WITH BETTER METRICS
// ============================================================================

export interface TradeLog {
  id: string;                      // ✅ ADDED: Unique trade ID
  timestamp: string;
  mint: string;
  profit: number;
  txSig: string;
  type: TradeType;
  
  // ✅ ADDED: Enhanced fields for better analytics
  signal?: ArbitrageSignal;        // Reference to original signal
  status: TradeStatus;             // More detailed status
  executionTimeMs?: number;        // How long execution took
  gasUsed?: BN;                    // Gas costs
  fees?: {                         // Detailed fee breakdown
    marketplace: BN;
    network: BN;
    total: BN;
  };
  retryCount?: number;             // How many retries were attempted
}

// ============================================================================
// BOT CONFIGURATION - IMPROVED TYPE SAFETY
// ============================================================================

export interface BotConfig {
  // Core settings
  mode: BotMode;
  rpcUrl: string;
  walletPrivateKey: string;
  
  // API Keys
  heliusApiKey: string;
  openseaApiKey: string;
  moralisApiKey: string;
  
  // Trading parameters - IMPROVED TYPE SAFETY
  collections: string[];
  marketplaces: AuctionHouse[];    // ✅ CHANGED: Now properly typed, not string[]
  minProfitLamports: BN;
  feeBufferLamports: BN;
  maxSlippageBps: number;
  
  // Execution limits
  scanIntervalMs: number;
  maxConcurrentTrades: number;
  minSignals: number;
  maxGasPerTradeLamports: BN;
  
  // Risk management
  riskLimits: {
    maxDailyLossLamports: BN;
    maxTradesPerHour: number;
    cooloffAfterFailureMs: number;
    enableCircuitBreaker: boolean;
  };
  
  // Logging
  enableJsonLogging: boolean;
  enableCsvLogging: boolean;
  enableSheetsLogging: boolean;
  logLevel: LogLevel;
  
  // Marketplace-specific
  marketplaceSettings: {
    timeoutMs: number;
    retryAttempts: number;
    rateLimitDelayMs: number;
  };
  
  // Notifications
  notifications: {
    enabled: boolean;
    webhookUrl?: string;
    minProfitAlertSOL: number;
    errorAlerts: boolean;
  };
}

// ============================================================================
// UTILITY TYPES - ADDED FOR BETTER DX
// ============================================================================

export interface CollectionConfig {
  name: string;
  magicEden: string;
  rarible: string;
}

export interface MetricsLog {
  message: string;
  [key: string]: any;
}

export interface HealthCheckResult {
  marketplace: AuctionHouse;
  status: 'healthy' | 'unhealthy';
  latencyMs?: number;
  error?: string;
}

// ============================================================================
// TYPE GUARDS - ADDED FOR RUNTIME SAFETY
// ============================================================================

export const TypeGuards = {
  isAuctionHouse(value: any): value is AuctionHouse {
    return value === "MagicEden" || value === "Rarible";
  },
  
  isNFTListing(obj: any): obj is NFTListing {
    return obj && 
      typeof obj.mint === 'string' &&
      obj.price instanceof BN &&
      this.isAuctionHouse(obj.auctionHouse) &&
      typeof obj.timestamp === 'number';
  },
  
  isArbitrageSignal(obj: any): obj is ArbitrageSignal {
    return obj &&
      this.isNFTListing(obj.targetListing) &&
      this.isNFTListing(obj.targetBid) && // NFTBid has same structure
      obj.estimatedNetProfit instanceof BN &&
      this.isAuctionHouse(obj.marketplaceIn) &&
      this.isAuctionHouse(obj.marketplaceOut);
  }
} as const;

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

export type { Connection, Keypair, PublicKey, TransactionInstruction };
