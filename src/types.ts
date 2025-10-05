import { Connection, Transaction } from '@solana/web3.js';
import BN from 'bn.js';

export type AuctionHouse = 'MagicEden' | 'Tensor' | 'OpenSea' | 'Solanart' | 'DigitalEyes';
export type Currency = 'SOL' | 'USDC';
export type ExecutorType = 'direct' | 'flash_loan';
export type TradeType = 'signal' | 'executed' | 'failed';

export interface NFTMarketData {
  mint: string; // NFT mint address
  auctionHouse: AuctionHouse;
  price: BN; // Price in lamports for precision
  assetMint: string; // SPL token mint (e.g., SOL: So111...)
  currency: Currency;
  timestamp?: number; // Unix timestamp in ms
  sellerPubkey?: string; // For tracking/validation
}

export interface NFTListing extends NFTMarketData {
  duration?: number; // Listing duration in seconds
  reservePrice?: BN; // Reserve if applicable
}

export interface NFTBid extends NFTMarketData {
  bidderPubkey?: string; // Bidder's public key
  expiresAt?: number; // Bid expiration timestamp
}

export interface ArbitrageSignal {
  targetListing: NFTListing;
  targetBid: NFTBid;
  estimatedNetProfit: BN; // Net after fees
  rawProfit: BN; // Gross before fees
  confidence: number; // Score 0-1
  timestamp: number; // Signal creation time
}

export interface TxParams {
  connection: Connection; // Typed Solana connection
  walletPubkey: string; // Wallet public key
  auctionHouse: AuctionHouse; // Enforce enum
  mint: string;
  price: BN;
  buyerTokenAccount?: string;
  sellerTokenAccount?: string;
}

export interface FlashLoanParams {
  amount: number; // In reserve units
  asset: string; // Reserve mint
  receiver: string; // Receiver pubkey
  callback: (flashLoanTx: Transaction) => Promise<Transaction>; // Modify & return tx
}

export interface TradeLog {
  timestamp: number;
  mint: string;
  buyPrice: BN;
  sellPrice: BN;
  netProfit: BN;
  currency: Currency;
  txSig?: string;
  type: TradeType;
  notes?: string;
  gasUsed?: number;
  executorType?: ExecutorType; // Optional for flexibility
}

export interface ScanMetrics {
  totalScans: number;
  signalsFound: number;
  tradesExecuted: number;
  totalProfit: BN;
  averageProfit: BN;
  successRate: number; // 0-1
  lastScanTime: number;
  scanDuration?: number; // ms, optional for perf tracking
}
