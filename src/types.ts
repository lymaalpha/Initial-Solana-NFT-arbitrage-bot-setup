// src/types.ts - ✅ COMPLETE TYPE DEFINITIONS FOR ARBITRAGE BOT
import BN from 'bn.js';
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  TransactionInstruction 
} from '@solana/web3.js';

// ============================================================================
// CORE NFT TYPES
// ============================================================================

/** Supported NFT marketplaces */
export type AuctionHouse = 'MagicEden' | 'Tensor' | 'Rarible' | 'moralis';

/** NFT Listing (for sale) */
export interface NFTListing {
  mint: string;                    // NFT mint address
  auctionHouse: AuctionHouse;      // Marketplace
  price: BN;                       // Price in lamports
  currency: 'SOL';                 // Only SOL supported
  timestamp: number;               // When listing was fetched
  sellerPubkey: string;            // Seller's public key
}

/** NFT Bid (offer to buy) */
export interface NFTBid {
  mint: string;                    // NFT mint address
  auctionHouse: AuctionHouse;      // Marketplace
  price: BN;                       // Bid amount in lamports
  currency: 'SOL';                 // Only SOL supported
  timestamp: number;               // When bid was fetched
  bidderPubkey: string;            // Bidder's public key
}

// ============================================================================
// ARBITRAGE TYPES
// ============================================================================

/** Complete arbitrage opportunity */
export interface ArbitrageSignal {
  targetListing: NFTListing;       // NFT to buy (low price)
  targetBid: NFTBid | NFTListing;  // NFT to sell (high price/bid)
  estimatedNetProfit: BN;          // Profit after fees
  estimatedGrossProfit?: BN;       // Raw profit before fees
  rawProfit?: BN;                  // Alternative raw profit field
  strategy?: string;               // e.g., "ME→Tensor", "Listing Arb"
  marketplaceIn?: string;          // Buy marketplace
  marketplaceOut?: string;         // Sell marketplace
  confidence?: number;             // 0.0-1.0 confidence score
  timestamp?: number;              // When signal was detected
}

/** Bot configuration */
export interface BotConfig {
  simulateOnly: boolean;           // Skip real transactions
  minProfitLamports: BN;           // Minimum profitable trade (lamports)
  feeBufferLamports: BN;           // Fee buffer for safety (lamports)
  maxConcurrentTrades: number;     // Max simultaneous trades
  scanIntervalMs: number;          // Scan frequency (ms)
}

// ============================================================================
// TRADE EXECUTION TYPES
// ============================================================================

/** Result of a trade execution */
export interface TradeLog {
  success: boolean;                // Did trade succeed?
  signal: ArbitrageSignal;         // Original arbitrage signal
  txHash?: string;                 // Transaction signature
  error?: string;                  // Error message if failed
  profitSOL?: number;              // Actual profit in SOL
  timestamp: number;               // When trade was executed
  mint?: string;                   // NFT mint (for logging)
  buyPrice?: BN;                   // Purchase price
  sellPrice?: BN;                  // Sale price
  netProfit?: BN;                  // Net profit in lamports
  currency?: string;               // Trade currency
  type?: 'executed' | 'simulated' | 'failed';  // Trade type
  executorType?: 'arbitrage' | 'flash_loan' | 'single_sale' | 'wallet';  // Execution method
}

// ============================================================================
// MARKETPLACE INSTRUCTION TYPES
// ============================================================================

/** Partial listing for marketplace operations */
export type ListingLike = Partial<NFTListing>;

/** Partial bid for marketplace operations */
export type BidLike = Partial<NFTBid>;

/** Parameters for marketplace sale execution */
export interface ExecuteSaleParams {
  connection: Connection;
  payerKeypair: Keypair;
  listing: ListingLike;
  bid?: BidLike;                   // Optional for bid fulfillment
}

/** Response from marketplace sale execution */
export interface SaleResponse {
  instructions: TransactionInstruction[];  // Instructions to include in tx
  signers: Keypair[];                      // Additional signers needed
  signature?: string;                      // Transaction signature (if executed)
  response?: any;                          // Raw marketplace response
}

// ============================================================================
// SOLEND FLASH LOAN TYPES
// ============================================================================

/** Solend flash loan parameters */
export interface FlashLoanParams {
  connection: Connection;
  payer: Keypair;
  reservePubkey: PublicKey;        // Solend reserve to borrow from
  borrowAmount: BN;                // Amount to borrow (lamports)
  arbitrageInstructions: TransactionInstruction[];  // Arbitrage logic
}

/** Flash loan execution result */
export interface FlashLoanResult {
  success: boolean;
  signature?: string;
  error?: string;
  borrowedAmount?: BN;
  repaidAmount?: BN;
  profit?: BN;
}

// ============================================================================
// LOGGING & METRICS TYPES
// ============================================================================

/** Flexible metrics logging */
export interface MetricsLog {
  message: string;                 // Log message
  [key: string]: any;              // Additional key-value pairs
}

/** Collection configuration */
export interface CollectionConfig {
  name: string;                    // Human readable name
  magicEden: string;               // ME slug
  tensor?: string;                 // Tensor slug  
  rarible?: string;                // Rarible collection ID
}

/** Health check result */
export interface HealthCheckResult {
  marketplace: AuctionHouse;
  status: 'healthy' | 'unhealthy';
  latencyMs?: number;
  error?: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/** Generic API response wrapper */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

/** Price comparison result */
export interface PriceComparison {
  mint: string;
  lowestPrice: BN;
  highestPrice: BN;
  spread: BN;
  spreadPercent: number;
  marketplaces: {
    [auctionHouse in AuctionHouse]?: BN;
  };
}

// ============================================================================
// CONFIGURATION UTILITY
// ============================================================================

/** Environment configuration */
export interface EnvConfig {
  rpcUrl: string;
  privateKey: string;
  simulateOnly: boolean;
  minProfitSol: number;
}

// ============================================================================
// EXPORT CONVENIENCE TYPES
// ============================================================================

// Extract types for easier imports
export type {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction
} from '@solana/web3.js';

export type {
  NFTListing,
  NFTBid,
  ArbitrageSignal,
  TradeLog,
  BotConfig,
  ExecuteSaleParams,
  SaleResponse,
  ListingLike,
  BidLike,
  MetricsLog,
  CollectionConfig
};
