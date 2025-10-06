import { 
  Connection, 
  Keypair, 
  Transaction, 
  TransactionInstruction,
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction 
} from "@solana/spl-token";
import { SolendMarket, SolendAction } from "@solendprotocol/solend-sdk";
import { ArbitrageSignal, TradeLog } from "./types";
import { executeSale } from "./marketplaceInstructions";
import { pnlLogger } from "./pnlLogger";
import BN from 'bn.js';
import bs58 from 'bs58';

// Solend Program ID (mainnet)
const SOLEND_PROGRAM_ID = new PublicKey("So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo");

export async function executeFlashloanTrade(signal: ArbitrageSignal): Promise<TradeLog | null> {
  try {
    const connection = new Connection(process.env.RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");
    const payer = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY || ""));

    console.log(`⚡ Executing REAL flashloan for ${signal.targetListing.mint}`);

    // Initialize Solend market
    const market = await SolendMarket.initialize(connection, "production");
    await market.loadReserves();

    // Find SOL reserve
    const solReserve = market.reserves.find((res) => res.config.symbol === "SOL");
    if (!solReserve) throw new Error('SOL reserve not found');

    const borrowAmountLamports = signal.targetListing.price.add(new BN(20000000)); // Add 0.02 SOL buffer
    const borrowAmountSOL = borrowAmountLamports.toNumber() / 1e9;

    console.log(`💰 Borrowing ${borrowAmountSOL} SOL via flashloan...`);

    // Create flashloan transaction
    const flashloanTx = await createFlashloanTransaction(
      connection,
      payer,
      market,
      solReserve,
      borrowAmountLamports,
      signal
    );

    // Send flashloan transaction
    const txSig = await sendAndConfirmTransaction(connection, flashloanTx, [payer], {
      commitment: 'confirmed',
      maxRetries: 3,
    });

    console.log(`🔗 Flashloan executed successfully: ${txSig}`);

    return {
      timestamp: Date.now(),
      mint: signal.targetListing.mint,
      buyPrice: signal.targetListing.price,
      sellPrice: signal.targetBid.price,
      netProfit: signal.estimatedNetProfit,
      currency: signal.targetListing.currency,
      txSig,
      type: 'executed',
      executorType: 'flash_loan',
    };
  } catch (err: unknown) {
    console.error('Flashloan trade failed:', err);
    return null;
  }
}

async function createFlashloanTransaction(
  connection: Connection,
  payer: Keypair,
  market: any,
  reserve: any,
  borrowAmount: BN,
  signal: ArbitrageSignal
): Promise<Transaction> {
  const tx = new Transaction();

  // 1. Flash borrow instruction
  const flashBorrowIx = await createFlashBorrowInstruction(
    payer.publicKey,
    reserve,
    borrowAmount,
    market
  );
  tx.add(flashBorrowIx);

  // 2. Arbitrage execution instructions (buy NFT, sell NFT)
  const arbitrageIxs = await createArbitrageInstructions(
    connection,
    payer,
    signal
  );
  tx.add(...arbitrageIxs);

  // 3. Flash repay instruction
  const flashRepayIx = await createFlashRepayInstruction(
    payer.publicKey,
    reserve,
    borrowAmount,
    market
  );
  tx.add(flashRepayIx);

  // Set recent blockhash
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;

  return tx;
}

async function createFlashBorrowInstruction(
  userPublicKey: PublicKey,
  reserve: any,
  amount: BN,
  market: any
): Promise<TransactionInstruction> {
  // Get user's SOL token account
  const userTokenAccount = await getAssociatedTokenAddress(
    reserve.liquidity.mintPubkey,
    userPublicKey
  );

  // Flash borrow instruction data
  const instructionData = Buffer.alloc(17);
  instructionData.writeUInt8(12, 0); // Flash borrow instruction discriminator
  amount.toArrayLike(Buffer, "le", 8).copy(instructionData, 1);

  return new TransactionInstruction({
    keys: [
      { pubkey: reserve.liquidity.supplyPubkey, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: reserve.pubkey, isSigner: false, isWritable: true },
      { pubkey: market.address, isSigner: false, isWritable: false },
      { pubkey: reserve.liquidity.mintPubkey, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    ],
    programId: SOLEND_PROGRAM_ID,
    data: instructionData,
  });
}

async function createFlashRepayInstruction(
  userPublicKey: PublicKey,
  reserve: any,
  amount: BN,
  market: any
): Promise<TransactionInstruction> {
  // Calculate repay amount with fee (0.3% fee)
  const fee = amount.mul(new BN(3)).div(new BN(1000)); // 0.3% fee
  const repayAmount = amount.add(fee);

  const userTokenAccount = await getAssociatedTokenAddress(
    reserve.liquidity.mintPubkey,
    userPublicKey
  );

  // Flash repay instruction data
  const instructionData = Buffer.alloc(17);
  instructionData.writeUInt8(13, 0); // Flash repay instruction discriminator
  repayAmount.toArrayLike(Buffer, "le", 8).copy(instructionData, 1);

  return new TransactionInstruction({
    keys: [
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: reserve.liquidity.supplyPubkey, isSigner: false, isWritable: true },
      { pubkey: reserve.pubkey, isSigner: false, isWritable: true },
      { pubkey: market.address, isSigner: false, isWritable: false },
      { pubkey: userPublicKey, isSigner: true, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: SOLEND_PROGRAM_ID,
    data: instructionData,
  });
}

async function createArbitrageInstructions(
  connection: Connection,
  payer: Keypair,
  signal: ArbitrageSignal
): Promise<TransactionInstruction[]> {
  const instructions: TransactionInstruction[] = [];

  // For now, add a simple transfer instruction as placeholder
  // In production, this would be replaced with actual marketplace buy/sell instructions
  instructions.push(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: payer.publicKey,
      lamports: signal.targetListing.price.toNumber(),
    })
  );

  return instructions;
}

export async function executeBatch(signals: ArbitrageSignal[]): Promise<(TradeLog | null)[]> {
  const trades: (TradeLog | null)[] = [];
  for (const signal of signals) {
    const trade = await executeFlashloanTrade(signal);
    trades.push(trade);
    // Add delay between flashloan trades
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  return trades;
}
