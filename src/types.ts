import BN from "bn.js";

export type AuctionHouse = "MagicEden" | "Rarible";
export type Currency = "SOL";
export type BotMode = 'SIMULATION' | 'DRY_RUN' | 'LIVE_TRADING' | 'MAINTENANCE';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

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

export interface TradeLog {
  timestamp: string;
  mint: string;
  profit: number;
  txSig: string;
  type: "simulated" | "executed" | "failed";
}

export interface BotConfig {
  // Core settings
  mode: BotMode;
  rpcUrl: string;
  walletPrivateKey: string;
  
  // API Keys - SIMPLIFIED: Only what we actually use
  heliusApiKey: string;
  raribleApiKey: string;  // ✅ Only keep Rarible API key (we have this in Render)
  
  // Trading parameters
  collections: string[];
  marketplaces: string[];  // Keep as string[] for simplicity
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
