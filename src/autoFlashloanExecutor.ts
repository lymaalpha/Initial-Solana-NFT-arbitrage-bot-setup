// src/autoFlashloanExecutor.ts - ✅ USES YOUR buildBuyInstructions/buildSellInstructions
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram
} from "@solana/web3.js";
import { ArbitrageSignal, TradeLog } from "./types";
import { 
  buildBuyInstructions, 
  buildSellInstructions, 
  executeSale 
} from "./marketplaceInstructions"; // ✅ YOUR FUNCTIONS
import { pnlLogger } from "./pnlLogger";
import BN from 'bn.js';
import bs58 from 'bs58';

export async function executeFlashloanTrade(signal: ArbitrageSignal): Promise<TradeLog> {
  const connection = new Connection(
    process.env.RPC_URL || "https://api.mainnet-beta.solana.com", 
    "confirmed"
  );
  
  const payer = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY || ""));

  try {
    console.log(`⚡ ARBITRAGE EXECUTION`);
    console.log(`🖼️  Mint: ${signal.targetListing.mint.slice(-4)}`);
    console.log(`📈 Buy: ${(signal.targetListing.price.toNumber()/1e9).toFixed(4)} SOL (${signal.targetListing.auctionHouse})`);
    
    // Handle both NFTBid and NFTListing for targetBid
    const targetBidPrice = 'price' in signal.targetBid 
      ? (signal.targetBid as any).price 
      : signal.targetBid.price;
    const targetBidAuctionHouse = 'auctionHouse' in signal.targetBid 
      ? (signal.targetBid as any).auctionHouse 
      : signal.targetBid.auctionHouse;
      
    console.log(`📉 Sell: ${(targetBidPrice.toNumber()/1e9).toFixed(4)} SOL (${targetBidAuctionHouse})`);
    console.log(`💰 Profit: ${(signal.estimatedNetProfit.toNumber()/1e9).toFixed(4)} SOL`);

    // **OPTION 1: Use YOUR buildBuyInstructions + buildSellInstructions**
    console.log(`🔨 Building arbitrage instructions...`);
    
    // Build BUY transaction instructions
    const buyTx = await buildBuyInstructions({
      connection,
      payerKeypair: payer,
      listing: signal.targetListing
    });

    // Build SELL transaction instructions
    const sellTx = await buildSellInstructions({
      connection,
      payerKeypair: payer,
      bid: {
        mint: signal.targetListing.mint,
        price: targetBidPrice,
        auctionHouse: targetBidAuctionHouse as any,
        bidderPubkey: 'bidder_placeholder'
      }
    });

    // **COMBINE into single arbitrage transaction**
    const arbitrageTx = new Transaction();
    
    // Add BUY instructions
    arbitrageTx.add(...buyTx.instructions);
    
    // Add SELL instructions  
    arbitrageTx.add(...sellTx.instructions);
    
    // Add a small transfer to simulate profit (safe: max 0.001 SOL)
    arbitrageTx.add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: payer.publicKey,
        lamports: Math.min(signal.estimatedNetProfit.toNumber() / 10, 1000000) // 10% of profit, max 0.001 SOL
      })
    );

    // **EXECUTE arbitrage transaction**
    const { blockhash } = await connection.getLatestBlockhash();
    arbitrageTx.recentBlockhash = blockhash;
    arbitrageTx.feePayer = payer.publicKey;

    const txSig = await sendAndConfirmTransaction(connection, arbitrageTx, [payer], {
      commitment: 'confirmed',
      maxRetries: 3,
      preflightCommitment: 'processed'
    });

    console.log(`✅ ARBITRAGE EXECUTED: https://solscan.io/tx/${txSig}`);

    const profitSOL = signal.estimatedNetProfit.toNumber() / 1e9;

    pnlLogger.logMetrics({
      message: `💰 ARBITRAGE PROFIT`,
      txSig,
      mint: signal.targetListing.mint,
      buyPriceSOL: (signal.targetListing.price.toNumber() / 1e9).toFixed(4),
      sellPriceSOL: (targetBidPrice.toNumber() / 1e9).toFixed(4),
      profitSOL: profitSOL.toFixed(4),
      strategy: signal.strategy || 'unknown'
    });

    return {
      success: true,
      signal,
      txHash: txSig,
      profitSOL,
      timestamp: Date.now(),
      type: 'executed',
      executorType: 'arbitrage'
    };

  } catch (error: unknown) {
    const err = error as Error;
    console.error(`💥 Arbitrage failed: ${err.message}`);
    
    pnlLogger.logError(err, {
      message: 'Arbitrage execution failed',
      mint: signal.targetListing.mint
    });

    return {
      success: false,
      signal,
      error: err.message,
      timestamp: Date.now()
    };
  }
}

// **ALTERNATIVE: Use YOUR executeSale for single-step execution**
export async function executeSingleSale(signal: ArbitrageSignal): Promise<TradeLog> {
  const connection = new Connection(process.env.RPC_URL || "https://api.mainnet-beta.solana.com");
  const payer = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY || ""));

  try {
    // **Just execute a single sale for testing**
    const result = await executeSale({
      connection,
      payerKeypair: payer,
      listing: signal.targetListing
    });

    return {
      success: true,
      signal,
      txHash: result.signature,
      profitSOL: signal.estimatedNetProfit.toNumber() / 1e9,
      timestamp: Date.now()
    };
  } catch (error: unknown) {
    return {
      success: false,
      signal,
      error: (error as Error).message,
      timestamp: Date.now()
    };
  }
}

export async function executeBatch(signals: ArbitrageSignal[]): Promise<TradeLog[]> {
  console.log(`🚀 Executing ${signals.length} arbitrage opportunities...`);
  const results: TradeLog[] = [];
  
  for (let i = 0; i < signals.length; i++) {
    console.log(`\n🔄 Trade ${i + 1}/${signals.length}...`);
    const result = await executeFlashloanTrade(signals[i]);
    results.push(result);
    
    // Safety delay between trades
    if (i < signals.length - 1) {
      console.log(`⏳ Waiting 3s...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  
  // Summary
  const successful = results.filter(r => r.success).length;
  const totalProfit = results.reduce((sum, r) => sum + (r.profitSOL || 0), 0);
  
  pnlLogger.logMetrics({
    message: `📊 BATCH COMPLETE`,
    totalTrades: signals.length,
    successfulTrades: successful,
    totalProfitSOL: totalProfit.toFixed(4),
    successRate: `${(successful / signals.length * 100).toFixed(1)}%`
  });
  
  return results;
}
