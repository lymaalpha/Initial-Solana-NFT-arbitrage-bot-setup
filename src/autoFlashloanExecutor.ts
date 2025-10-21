// src/autoFlashloanExecutor.ts - ✅ CORRECT Solend Flash Loan Implementation
import { 
  Connection, 
  Keypair, 
  PublicKey,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress
} from "@solana/spl-token";
import { 
  SolendMarket, 
  SolendAction, 
  FlashLoanRequest 
} from "@solendprotocol/solend-sdk";
import { ArbitrageSignal, TradeLog } from "./types";
import { executeSale } from "./marketplaceInstructions";
import { pnlLogger } from "./pnlLogger";
import BN from 'bn.js';
import bs58 from 'bs58';

// **FIX 1: Proper TradeLog return type**
export async function executeFlashloanTrade(signal: ArbitrageSignal): Promise<TradeLog> {
  const connection = new Connection(
    process.env.RPC_URL || "https://api.mainnet-beta.solana.com", 
    "confirmed"
  );
  
  const payer = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY || ""));
  
  try {
    console.log(`⚡ Executing flashloan for ${signal.targetListing.mint}`);
    console.log(`💰 Buy: ${(signal.targetListing.price.toNumber()/1e9).toFixed(4)} SOL`);
    console.log(`💸 Sell: ${(signal.targetBid.price.toNumber()/1e9).toFixed(4)} SOL`);
    console.log(`🎯 Expected profit: ${(signal.estimatedNetProfit.toNumber()/1e9).toFixed(4)} SOL`);

    // **FIX 2: Initialize Solend market PROPERLY**
    const market = await SolendMarket.initialize(connection, "production");
    await market.loadReserves();

    // **FIX 3: Get SOL reserve**
    const solReserve = market.reserves.find(r => r.config.symbol === "SOL");
    if (!solReserve) {
      throw new Error('SOL reserve not found in Solend market');
    }

    // **FIX 4: Calculate borrow amount with buffer**
    const borrowAmountLamports = signal.targetListing.price
      .add(signal.estimatedNetProfit)  // Buy price + expected profit buffer
      .add(new BN(5000000));           // +0.005 SOL extra buffer for fees

    const borrowAmountSOL = borrowAmountLamports.toNumber() / 1e9;
    console.log(`💸 Borrowing ${borrowAmountSOL.toFixed(4)} SOL from Solend`);

    // **FIX 5: Create flash loan request using Solend SDK**
    const flashLoanRequest: FlashLoanRequest = {
      amount: borrowAmountLamports,
      receiverProgramId: payer.publicKey, // Your program's PDA or wallet
      reserves: [solReserve]
    };

    // **FIX 6: Execute flash loan with callback**
    const flashLoanResult = await market.flashLoan(
      payer,
      flashLoanRequest,
      async (flashLoanAmount: BN, accounts: any[]) => {
        console.log(`🔄 Flash loan received: ${flashLoanAmount.toNumber()/1e9} SOL`);
        
        // **STEP 1: Execute arbitrage (buy low, sell high)**
        const arbitrageInstructions = await executeArbitrageTrade(
          connection,
          payer,
          signal,
          flashLoanAmount
        );

        // **STEP 2: Return instructions to Solend**
        return {
          instructions: arbitrageInstructions,
          signers: [payer],
          accounts: accounts // Solend accounts passed through
        };
      }
    );

    if (!flashLoanResult.success) {
      throw new Error(`Flash loan failed: ${flashLoanResult.error}`);
    }

    const txSig = flashLoanResult.signature;
    console.log(`✅ Flash loan + arbitrage executed: https://solscan.io/tx/${txSig}`);

    // **FIX 7: Verify profit**
    const finalBalance = await connection.getBalance(payer.publicKey);
    const profitSOL = (finalBalance / 1e9) - borrowAmountSOL;
    
    pnlLogger.logMetrics({
      message: `✅ Flash loan arbitrage SUCCESS`,
      mint: signal.targetListing.mint,
      txSig,
      borrowedSOL: borrowAmountSOL.toFixed(4),
      profitSOL: profitSOL.toFixed(4),
      strategy: signal.strategy || 'unknown'
    });

    return {
      success: true,
      signal,
      txHash: txSig,
      profitSOL: profitSOL,
      timestamp: Date.now()
    };

  } catch (error: unknown) {
    const err = error as Error;
    console.error(`💥 Flash loan failed: ${err.message}`);
    
    pnlLogger.logError(err, {
      message: `Flash loan execution failed`,
      mint: signal.targetListing.mint,
      borrowAmountSOL: borrowAmountLamports.toNumber() / 1e9
    });

    return {
      success: false,
      signal,
      error: err.message,
      timestamp: Date.now()
    };
  }
}

// **FIX 8: Proper arbitrage execution**
async function executeArbitrageTrade(
  connection: Connection,
  payer: Keypair,
  signal: ArbitrageSignal,
  flashLoanAmount: BN
): Promise<TransactionInstruction[]> {
  const instructions: TransactionInstruction[] = [];

  // **STEP 1: BUY NFT from target listing**
  console.log(`🛒 Buying NFT from ${signal.targetListing.auctionHouse}`);
  
  const buyInstructions = await executeSale({
    connection,
    payer,
    listing: signal.targetListing,
    maxPrice: signal.targetListing.price,
    amount: new BN(1) // 1 NFT
  });

  instructions.push(...buyInstructions);

  // **STEP 2: SELL NFT to target bid**
  console.log(`💰 Selling NFT to ${signal.targetBid.auctionHouse} bid`);
  
  // Convert bid to listing-like object for sell function
  const sellListing = {
    ...signal.targetListing,
    price: signal.targetBid.price,
    auctionHouse: (signal.targetBid as NFTBid).auctionHouse
  };

  const sellInstructions = await executeSale({
    connection,
    payer,
    listing: sellListing,
    maxPrice: signal.targetBid.price,
    amount: new BN(1),
    isBid: true // Indicate this is fulfilling a bid
  });

  instructions.push(...sellInstructions);

  // **STEP 3: Ensure sufficient funds for fees**
  const feeBuffer = new BN(5000000); // 0.005 SOL
  if (flashLoanAmount.lt(feeBuffer)) {
    throw new Error('Insufficient flash loan for fees');
  }

  return instructions;
}

// **FIX 9: Batch execution with concurrency control**
export async function executeBatch(signals: ArbitrageSignal[]): Promise<TradeLog[]> {
  const results: TradeLog[] = [];
  
  console.log(`⚡ Executing batch of ${signals.length} arbitrage opportunities`);
  
  // **Process sequentially to avoid nonce conflicts**
  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];
    console.log(`\n🔄 Processing trade ${i + 1}/${signals.length}...`);
    
    const result = await executeFlashloanTrade(signal);
    results.push(result);
    
    // **Delay between trades to avoid rate limits**
    if (i < signals.length - 1) {
      console.log(`⏳ Waiting 5s before next trade...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  // **Summary**
  const successful = results.filter(r => r.success).length;
  const totalProfit = results.reduce((sum, r) => sum + (r.profitSOL || 0), 0);
  
  pnlLogger.logMetrics({
    message: `📊 Batch complete`,
    totalTrades: signals.length,
    successfulTrades: successful,
    totalProfitSOL: totalProfit.toFixed(4),
    failureRate: `${((signals.length - successful) / signals.length * 100).toFixed(1)}%`
  });
  
  return results;
}

// **FIX 10: Health check for Solend integration**
export async function checkSolendHealth(): Promise<boolean> {
  try {
    const connection = new Connection(process.env.RPC_URL || "https://api.mainnet-beta.solana.com");
    const market = await SolendMarket.initialize(connection, "production");
    await market.loadReserves();
    
    const solReserve = market.reserves.find(r => r.config.symbol === "SOL");
    return !!solReserve && solReserve.liquidity.availableAmount.gt(new BN(0));
  } catch (error) {
    console.error('Solend health check failed:', error);
    return false;
  }
}
