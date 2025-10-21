// src/types.ts - ✅ COMPLETE TYPE DEFINITIONS
import BN from 'bn.js';

export type AuctionHouse = 'MagicEden' | 'Tensor' | 'Rarible' | 'moralis';

export interface NFTListing {
  mint: string;
  auctionHouse: AuctionHouse;
  price: BN;
  currency: 'SOL';
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

export interface ArbitrageSignal {
  targetListing: NFTListing;
  targetBid: NFTBid | NFTListing;
  estimatedNetProfit: BN;
  estimatedGrossProfit?: BN;
  strategy?: string;
  marketplaceIn?: string;
  marketplaceOut?: string;
  confidence?: number;
  rawProfit?: BN;
  timestamp?: number;  // ✅ ADDED
}

export interface TradeLog {
  success: boolean;
  signal: ArbitrageSignal;
  txHash?: string;
  error?: string;
  profitSOL?: number;
  timestamp: number;
  mint?: string;
  buyPrice?: BN;
  sellPrice?: BN;
  netProfit?: BN;
  currency?: string;
  type?: 'executed' | 'simulated' | 'failed';
  executorType?: 'flash_loan' | 'wallet';
}

// ✅ Marketplace instruction types
export interface ExecuteSaleParams {
  connection: Connection;
  payerKeypair: Keypair;  // ✅ Fixed param name
  listing: Partial<NFTListing>;
  bid?: Partial<NFTBid>;
}

export interface SaleResponse {
  instructions: TransactionInstruction[];
  signers: Keypair[];
}
