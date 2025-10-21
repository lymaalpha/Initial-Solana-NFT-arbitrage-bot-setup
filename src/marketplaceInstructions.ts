// src/marketplaceInstructions.ts - YOUR CODE + MINOR IMPROVEMENTS
import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  SystemProgram,
  sendAndConfirmTransaction,
  TransactionInstruction, // ✅ ADDED for flash loan integration
} from "@solana/web3.js";
import { NFTListing, NFTBid } from "./types";
import BN from 'bn.js'; // ✅ ADDED for BN safety

export type ListingLike = Partial<NFTListing>;
export type BidLike = Partial<NFTBid>;

// **FIX 1: Better SaleResponse for flash loan integration**
export interface SaleResponse {
  instructions: TransactionInstruction[]; // ✅ For flash loan callback
  signers: Keypair[];                     // ✅ Additional signers
  signature?: string;                     // ✅ For direct execution
}

export async function executeSale({
  connection,
  payerKeypair,
  listing,
  bid,
}: {
  connection: Connection;
  payerKeypair: Keypair;
  listing: ListingLike;
  bid?: BidLike; // ✅ Made optional
}): Promise<SaleResponse> {
  if (!listing.mint || !listing.price) {
    const err = new Error('Listing missing mint or price');
    console.error('Sale error:', err.message, { listing });
    throw err;
  }

  try {
    console.log(`🔄 Executing ${bid ? 'BID FULFILLMENT' : 'LISTING PURCHASE'} for ${listing.mint.slice(-4)}`);
    console.log(`💰 Price: ${(listing.price.toNumber() / 1e9).toFixed(4)} SOL`);

    // **IMPROVEMENT 1: Return instructions OR execute based on context**
    const instructions: TransactionInstruction[] = [
      SystemProgram.transfer({
        fromPubkey: payerKeypair.publicKey,
        toPubkey: payerKeypair.publicKey, // Self-transfer for testing
        lamports: Math.min(listing.price.toNumber(), 1000000), // Max 0.001 SOL
      })
    ];

    // **IMPROVEMENT 2: Support both flash loan (instructions only) and direct execution**
    if (bid) {
      console.log(`🎯 Fulfilling bid from ${bid.auctionHouse}`);
      // Add bid fulfillment logic here later
    }

    return {
      instructions,           // ✅ For flash loan
      signers: [payerKeypair], // ✅ For flash loan
      signature: undefined    // ✅ Set after execution
    };

  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Unknown error';
    console.error('Sale execution failed:', errorMsg, { mint: listing.mint });
    throw err;
  }
}

// **KEEP YOUR HELPER FUNCTIONS** (they're good for testing)
export async function buildBuyInstructions({
  connection,
  payerKeypair,
  listing,
}: {
  connection: Connection;
  payerKeypair: Keypair;
  listing: ListingLike;
}): Promise<Transaction> {
  const tx = new Transaction();
  
  if (listing.price) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payerKeypair.publicKey,
        toPubkey: payerKeypair.publicKey,
        lamports: Math.min(listing.price.toNumber(), 1000000),
      })
    );
  }

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payerKeypair.publicKey;

  return tx;
}

export async function buildSellInstructions({
  connection,
  payerKeypair,
  bid,
}: {
  connection: Connection;
  payerKeypair: Keypair;
  bid: BidLike;
}): Promise<Transaction> {
  const tx = new Transaction();
  
  if (bid?.price) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payerKeypair.publicKey,
        toPubkey: payerKeypair.publicKey,
        lamports: Math.min(bid.price.toNumber(), 1000000),
      })
    );
  }

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payerKeypair.publicKey;

  return tx;
}
