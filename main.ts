main.ts
import { Connection, Keypair } from "@solana/web3.js";
import { scanForArbitrage } from "./scanForArbitrage"; // Corrected path
import { NFTListing, NFTBid, ArbitrageSignal } from "./types"; // Corrected path
import { pnlLogger } from "./pnlLogger"; // Corrected path
import { config } from "./config"; // Corrected path
import axios from 'axios';
import BN from 'bn.js';

// Mock Solend client for now - replace with actual implementation
class MockSolendClient {
  constructor(options: any) {
    console.log('MockSolendClient initialized');
  }

  async executeFlashLoan(params: any): Promise<string> {
    // This is a mock - replace with actual Solend SDK implementation
    console.log('Mock flash loan execution:', params);
    return 'mock_transaction_signature';
  }
}

// Mock Flash Loan Executor
class FlashLoanExecutor {
  private connection: Connection;
  private solendClient: MockSolendClient;
  private payer: Keypair;
  private feeBufferSOL: number;

  constructor(options: {
    connection: Connection;
    solendClient: MockSolendClient;
    payer: Keypair;
    feeBufferSOL: number;
  }) {
    this.connection = options.connection;
    this.solendClient = options.solendClient;
    this.payer = options.payer;
    this.feeBufferSOL = options.feeBufferSOL;
  }

  async executeSignal(signal: ArbitrageSignal): Promise<string | null> {
    try {
      console.log(`🔄 Executing arbitrage for ${signal.targetListing.mint}`);
      console.log(`💰 Expected profit: ${signal.estimatedNetProfit.toNumber() / 1e9} SOL`);
      
      // Mock execution - replace with actual flash loan logic
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate execution time
      
      const mockTxSig = `mock_tx_${Date.now()}`;
      
      // Log successful trade
      await pnlLogger.logTrade({
        timestamp: Date.now(),
        mint: signal.targetListing.mint,
        buyPrice: signal.targetListing.price,
        sellPrice: signal.targetBid.price,
        netProfit: signal.estimatedNetProfit,
        currency: signal.targetListing.currency,
        txSig: mockTxSig,
        type: 'executed',
        executorType: 'flash_loan',
        notes: `Mock execution - Confidence: ${signal.confidence}`
      });

      return mockTxSig;
    } catch (error) {
      await pnlLogger.logError(error as Error, { signal });
      return null;
    }
  }

  async executeBatch(signals: ArbitrageSignal[]): Promise<string[]> {
    const signatures: string[] = [];
    
    for (const signal of signals) {
      const sig = await this.executeSignal(signal);
      if (sig) {
        signatures.push(sig);
      }
      
      // Add jitter to avoid rate limits
      await new Promise(resolve => 
        setTimeout(resolve, 1000 + Math.random() * 2000)
      );
    }
    
    return signatures;
  }
}

// Mock API functions - replace with actual marketplace APIs
async function fetchListings(collectionMint: string): Promise<NFTListing[]> {
  try {
    console.log(`📊 Fetching listings for collection: ${collectionMint}`);
    
    // Mock data - replace with actual API calls to Magic Eden, Tensor, etc.
    const mockListings: NFTListing[] = [
      {
        mint: `${collectionMint}_item_1`,
        auctionHouse: 'MagicEden',
        price: new BN(1.5 * 1e9), // 1.5 SOL
        assetMint: 'So11111111111111111111111111111111111111112', // SOL mint
        currency: 'SOL',
        timestamp: Date.now(),
        sellerPubkey: 'mock_seller_1'
      },
      {
        mint: `${collectionMint}_item_2`,
        auctionHouse: 'Tensor',
        price: new BN(2.1 * 1e9), // 2.1 SOL
        assetMint: 'So11111111111111111111111111111111111111112',
        currency: 'SOL',
        timestamp: Date.now(),
        sellerPubkey: 'mock_seller_2'
      }
    ];

    return mockListings;
  } catch (error) {
    await pnlLogger.logError(error as Error, { context: 'fetchListings', collectionMint });
    return [];
  }
}

async function fetchBids(collectionMint: string): Promise<NFTBid[]> {
  try {
    console.log(`📊 Fetching bids for collection: ${collectionMint}`);
    
    // Mock data - replace with actual API calls
    const mockBids: NFTBid[] = [
      {
        mint: `${collectionMint}_item_1`,
        auctionHouse: 'Tensor',
        price: new BN(1.8 * 1e9), // 1.8 SOL (higher than listing)
        assetMint: 'So11111111111111111111111111111111111111112',
        currency: 'SOL',
        timestamp: Date.now(),
        bidderPubkey: 'mock_bidder_1',
        expiresAt: Date.now() + 3600000 // Expires in 1 hour
      }
    ];

    return mockBids;
  } catch (error) {
    await pnlLogger.logError(error as Error, { context: 'fetchBids', collectionMint });
    return [];
  }
}

async function main() {
  try {
    console.log('🚀 Starting Solana NFT Arbitrage Bot on Railway...');
    console.log(`📍 Environment: ${config.rpcUrl.includes('devnet') ? 'DEVNET' : 'MAINNET'}`);
    
    // Initialize Solana connection
    const connection = new Connection(config.rpcUrl, 'confirmed');
    
    // Load wallet from private key
    const payer = Keypair.fromSecretKey(
      Uint8Array.from(Buffer.from(config.walletPrivateKey, 'base58') as Buffer)
    ); // Added 'as Buffer' type assertion
    
    console.log(`💼 Wallet: ${payer.publicKey.toString()}`);
    
    // Check wallet balance
    const balance = await connection.getBalance(payer.publicKey);
    console.log(`💰 Wallet balance: ${balance / 1e9} SOL`);
    
    if (balance < config.feeBufferLamports.toNumber()) {
      console.warn(`⚠️  Low wallet balance! Consider funding with at least ${config.feeBufferLamports.toNumber() / 1e9} SOL`);
    }

    // Initialize services
    const solendClient = new MockSolendClient({ connection });
    const executor = new FlashLoanExecutor({ 
      connection, 
      solendClient, 
      payer,
      feeBufferSOL: config.feeBufferLamports.toNumber() / 1e9
    });

    console.log(`🎯 Target collection: ${config.collectionMint}`);
    console.log(`⏱️  Scan interval: ${config.scanIntervalMs / 1000}s`);
    console.log(`💎 Min profit threshold: ${config.minProfitLamports.toNumber() / 1e9} SOL`);

    // Main scanning loop
    const runScan = async () => {
      try {
        const scanStart = Date.now();
        console.log(`\n🔍 [${new Date().toISOString()}] Starting scan cycle...`);

        // Fetch market data
        const [listings, bids] = await Promise.all([
          fetchListings(config.collectionMint),
          fetchBids(config.collectionMint)
        ]);

        // Scan for arbitrage opportunities
        const signals = await scanForArbitrage(listings, bids, { 
          minProfit: config.minProfitLamports,
          feeAdjustment: config.feeBufferLamports
        });

        const scanDuration = Date.now() - scanStart;

        if (signals.length === 0) {
          console.log(`❌ No opportunities found (${scanDuration}ms)`);
          return;
        }

        console.log(`✅ Found ${signals.length} arbitrage signals!`);
        
        // Log potential signals
        for (const signal of signals) {
          await pnlLogger.logSignal(signal, `Scan cycle ${Date.now()}`);
        }

        // Execute top signals
        const signalsToExecute = signals.slice(0, config.minSignals);
        console.log(`🚀 Executing top ${signalsToExecute.length} signals...`);
        
        const signatures = await executor.executeBatch(signalsToExecute);
        
        console.log(`✅ Executed ${signatures.length}/${signalsToExecute.length} trades`);
        console.log(`📊 Total bot profit: ${pnlLogger.getTotalProfit().toNumber() / 1e9} SOL`);
        console.log(`📈 Total trades: ${pnlLogger.getTradeCount()}`);

      } catch (error) {
        await pnlLogger.logError(error as Error, { context: 'scanCycle' });
        console.error(`❌ Scan cycle failed:`, error);
      }
    };

    // Initial scan
    await runScan();

    // Set up continuous scanning
    console.log(`🔄 Starting continuous scanning every ${config.scanIntervalMs / 1000}s...`);
    const scanInterval = setInterval(runScan, config.scanIntervalMs);

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      clearInterval(scanInterval);
      
      // Log final stats
      await pnlLogger.logMetrics({
        finalStats: {
          totalProfit: pnlLogger.getTotalProfit().toNumber() / 1e9,
          totalTrades: pnlLogger.getTradeCount(),
          shutdownReason: signal,
          uptime: process.uptime()
        }
      });
      
      console.log('👋 Bot shutdown complete');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Keep the process alive
    console.log('✅ Bot is running! Press Ctrl+C to stop.');

  } catch (error) {
    await pnlLogger.logError(error as Error, { context: 'main' });
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', async (reason, promise) => {
  await pnlLogger.logError(new Error(`Unhandled Rejection: ${reason}`), { promise });
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', async (error) => {
  await pnlLogger.logError(error, { context: 'uncaughtException' });
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the bot
if (require.main === module) {
  main().catch(async (error) => {
    await pnlLogger.logError(error, { context: 'startup' });
    console.error('Failed to start bot:', error);
    process.exit(1);
  });
}
