import BN from 'bn.js';

export type AuctionHouse = 'MagicEden' | 'Tensor' | 'OpenSea' | 'Solanart' | 'DigitalEyes';
export type Currency = 'SOL' | 'USDC';

export interface NFTMarketData {
  mint: string;
  auctionHouse: AuctionHouse;
  price: BN; // Price in lamports for precision
  assetMint: string; // SPL token mint (e.g., SOL mint)
  currency: Currency;
  timestamp?: number; // Unix timestamp in milliseconds
  sellerPubkey?: string; // For tracking and validation
}

export interface NFTListing extends NFTMarketData {
  duration?: number; // Listing duration in seconds
  reservePrice?: BN; // Reserve price if applicable
}

export interface NFTBid extends NFTMarketData {
  bidderPubkey?: string; // Bidder's public key
  expiresAt?: number; // Bid expiration timestamp
}

export interface ArbitrageSignal {
  targetListing: NFTListing;
  targetBid: NFTBid;
  estimatedNetProfit: BN; // Net profit after fees
  rawProfit: BN; // Gross profit before fees
  confidence: number; // Confidence score (0-1)
  timestamp: number; // Signal generation timestamp
}

export interface TxParams {
  connection: any; // Connection object
  walletPubkey: string; // Wallet public key
  auctionHouse: string;
  mint: string;
  price: BN;
  buyerTokenAccount?: string;
  sellerTokenAccount?: string;
}

export interface FlashLoanParams {
  amount: number;
  asset: string;
  receiver: string;
  callback: (tx: any) => Promise<any>;
}

export interface TradeLog {
  timestamp: number;
  mint: string;
  buyPrice: BN;
  sellPrice: BN;
  netProfit: BN;
  currency: string;
  txSig?: string;
  type: 'signal' | 'executed' | 'failed';
  notes?: string;
  gasUsed?: number;
  executorType: 'direct' | 'flash_loan';
}

export interface ScanMetrics {
  totalScans: number;
  signalsFound: number;
  tradesExecuted: number;
  totalProfit: BN;
  averageProfit: BN;
  successRate: number;
  lastScanTime: number;
}
