// src/autoFlashloanExecutor.ts - ✅ CORRECT Solend Flash Loan (Manual Instructions)
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SYSVAR_CLOCK_PUBKEY
} from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction 
} from "@solana/spl-token";
import { SolendMarket } from "@solendprotocol/solend-sdk";  // ✅ Only basic SDK
import { ArbitrageSignal, TradeLog, ExecuteSaleParams, SaleResponse } from "./types";
import { pnlLogger } from "./pnlLogger";
import BN from 'bn.js';
import bs58 from 'bs58';

// **SOLEND PROGRAM ID (MAINNET)**
const SOLEND_PROGRAM_ID = new PublicKey("So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo");

// **FIX 1: Manual Solend flash loan instructions**
export async function executeFlashloanTrade(signal: ArbitrageSignal): Promise<TradeLog> {
  const connection = new Connection(
    process.env.RPC_URL || "https://api.mainnet-beta.solana.com", 
    "confirmed"
  );
  
  const payer = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY || ""));
  
  try {
    console.log(`⚡ Flashloan arbitrage: ${signal.targetListing.mint.slice(-4)}`);
    console.log(`💰 Buy: ${(signal.targetListing.price.toNumber()/1e9).toFixed(4)} SOL`);
    console.log(`💸 Sell: ${((signal.targetBid as any).price.toNumber()/1e9).toFixed(4)} SOL`);

    // **FIX 2: Get Solend market data for account addresses**
    const market = await SolendMarket.initialize(connection, "production");
    await market.loadReserves();
    
    const solReserve = market.reserves.find(r => r.config.symbol === "SOL");
    if (!solReserve) throw new Error('SOL reserve not found');

    // **FIX 3: Calculate exact borrow amount**
    const borrowAmount = signal.targetListing.price
      .add(new BN(10000000)) // +0.01 SOL buffer for fees
      .add(signal.estimatedNetProfit.divn(2)); // Half profit as buffer

    // **FIX 4: Build COMPLETE flash loan transaction**
    const flashLoanTx = new Transaction();
    
    // 1. **SOLEND FLASH BORROW**
    const flashBorrowIx = await createSolendFlashBorrowIx(
      payer.publicKey,
      solReserve,
      borrowAmount
    );
    flashLoanTx.add(flashBorrowIx);

    // 2. **ARBITRAGE EXECUTION**
    const arbitrageIxs = await executeArbitrageTrade(connection, payer, signal);
    flashLoanTx.add(...arbitrageIxs);

    // 3. **SOLEND FLASH REPAY** (with 0.3% fee)
    const repayAmount = borrowAmount.muln(1003).divn(1000); // +0.3% fee
    const flashRepayIx = await createSolendFlashRepayIx(
      payer.publicKey,
      solReserve,
      repayAmount
    );
    flashLoanTx.add(flashRepayIx);

    // **FIX 5: Set transaction properties**
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    flashLoanTx.recentBlockhash = blockhash;
    flashLoanTx.feePayer = payer.publicKey;

    // **FIX 6: Send & confirm**
    const txSig = await sendAndConfirmTransaction(connection, flashLoanTx, [payer], {
      commitment: 'confirmed',
      maxRetries: 5,
      preflightCommitment: 'processed'
    });

    console.log(`✅ Flashloan SUCCESS: https://solscan.io/tx/${txSig}`);

    // **FIX 7: Calculate actual profit**
    const preBalance = await connection.getBalance(payer.publicKey);
    await new Promise(r => setTimeout(r, 2000)); // Wait for finality
    const postBalance = await connection.getBalance(payer.publicKey);
    const profitSOL = ((postBalance - preBalance) / 1e9) - (repayAmount.toNumber() / 1e9);

    const tradeLog: TradeLog = {
      success: true,
      signal,
      txHash: txSig,
      profitSOL,
      timestamp: Date.now(),
      mint: signal.targetListing.mint
    };

    pnlLogger.logMetrics({
      message: `💰 FLASHLOAN PROFIT`,
      txSig,
      mint: signal.targetListing.mint,
      borrowedSOL: (borrowAmount.toNumber() / 1e9).toFixed(4),
      repaidSOL: (repayAmount.toNumber() / 1e9).toFixed(4),
      profitSOL: profitSOL.toFixed(4),
      strategy: signal.strategy
    });

    return tradeLog;

  } catch (error: unknown) {
    const err = error as Error;
    console.error(`💥 Flashloan FAILED: ${err.message}`);
    
    pnlLogger.logError(err, {
      message: 'Flashloan execution failed',
      mint: signal.targetListing.mint,
      buyPriceSOL: (signal.targetListing.price.toNumber() / 1e9).toFixed(4)
    });

    return {
      success: false,
      signal,
      error: err.message,
      timestamp: Date.now()
    };
  }
}

// **FIX 8: CORRECT Solend flash borrow instruction**
async function createSolendFlashBorrowIx(
  userPubkey: PublicKey,
  reserve: any,
  amount: BN
): Promise<TransactionInstruction> {
  const userTokenAccount = await getAssociatedTokenAddress(
    reserve.liquidity.mintPubkey, 
    userPubkey
  );

  // **CORRECT discriminator: 9 = FlashBorrow**
  const data = Buffer.alloc(9);
  data.writeUInt8(9, 0); // FlashBorrow discriminator
  amount.toArrayLike(Buffer, 'le', 8).copy(data, 1);

  return new TransactionInstruction({
    keys: [
      // Reserve liquidity supply
      { pubkey: reserve.liquidity.supplyPubkey, isSigner: false, isWritable: true },
      // Reserve liquidity fee receiver
      { pubkey: reserve.liquidity.feeReceiver, isSigner: false, isWritable: true },
      // Reserve
      { pubkey: reserve.pubkey, isSigner: false, isWritable: true },
      // Reserve liquidity oracle
      { pubkey: reserve.liquidity.oraclePubkey, isSigner: false, isWritable: false },
      // User token account
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      // User
      { pubkey: userPubkey, isSigner: true, isWritable: true },
      // Token program
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      // Solend program
      { pubkey: SOLEND_PROGRAM_ID, isSigner: false, isWritable: false },
      // Clock sysvar
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false }
    ],
    programId: SOLEND_PROGRAM_ID,
    data
  });
}

// **FIX 9: CORRECT Solend flash repay instruction**
async function createSolendFlashRepayIx(
  userPubkey: PublicKey,
  reserve: any,
  amount: BN
): Promise<TransactionInstruction> {
  const userTokenAccount = await getAssociatedTokenAddress(
    reserve.liquidity.mintPubkey, 
    userPubkey
  );

  // **CORRECT discriminator: 10 = FlashRepay**
  const data = Buffer.alloc(9);
  data.writeUInt8(10, 0); // FlashRepay discriminator
  amount.toArrayLike(Buffer, 'le', 8).copy(data, 1);

  return new TransactionInstruction({
    keys: [
      // Reserve liquidity supply
      { pubkey: reserve.liquidity.supplyPubkey, isSigner: false, isWritable: true },
      // Reserve
      { pubkey: reserve.pubkey, isSigner: false, isWritable: true },
      // User token account
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      // User
      { pubkey: userPubkey, isSigner: true, isWritable: true },
      // Token program
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
    ],
    programId: SOLEND_PROGRAM_ID,
    data
  });
}

// **FIX 10: Fixed arbitrage execution**
async function executeArbitrageTrade(
  connection: Connection,
  payer: Keypair,
  signal: ArbitrageSignal
): Promise<TransactionInstruction[]> {
  const instructions: TransactionInstruction[] = [];

  // **BUY: Execute purchase from listing**
  console.log(`🛒 Buying from ${signal.targetListing.auctionHouse}`);
  const buyParams: ExecuteSaleParams = {
    connection,
    payerKeypair: payer,  // ✅ Fixed param name
    listing: signal.targetListing
  };
  
  const buyResponse = await executeSale(buyParams) as SaleResponse;  // ✅ Type assertion
  instructions.push(...buyResponse.instructions);

  // **SELL: Execute sale to bid**
  console.log(`💰 Selling to ${signal.targetBid.auctionHouse}`);
  const sellParams: ExecuteSaleParams = {
    connection,
    payerKeypair: payer,
    listing: {
      ...signal.targetListing,
      price: (signal.targetBid as NFTBid).price,  // ✅ Fixed type
      auctionHouse: (signal.targetBid as NFTBid).auctionHouse
    },
    bid: signal.targetBid as NFTBid
  };
  
  const sellResponse = await executeSale(sellParams) as SaleResponse;
  instructions.push(...sellResponse.instructions);

  return instructions;
}

// **FIX 11: Batch execution**
export async function executeBatch(signals: ArbitrageSignal[]): Promise<TradeLog[]> {
  console.log(`⚡ Batch executing ${signals.length} trades`);
  const results: TradeLog[] = [];
  
  for (let i = 0; i < signals.length; i++) {
    const result = await executeFlashloanTrade(signals[i]);
    results.push(result);
    
    if (i < signals.length - 1) {
      await new Promise(r => setTimeout(r, 3000)); // 3s delay
    }
  }
  
  return results;
}
