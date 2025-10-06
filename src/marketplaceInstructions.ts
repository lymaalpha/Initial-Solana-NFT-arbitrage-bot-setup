import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { NFTListing, NFTBid } from "./types";

export type ListingLike = Partial<NFTListing>;
export type BidLike = Partial<NFTBid>;

export interface SaleResponse {
  response: any;
  signature: string;
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
  bid: BidLike;
}): Promise<SaleResponse> {
  if (!listing.mint || !listing.price) {
    const err = new Error('Listing missing mint or price');
    console.error('Sale error:', err.message, { listing });
    throw err;
  }

  try {
    console.log(`🔄 Executing sale for ${listing.mint}`);
    console.log(`💰 Price: ${listing.price.toNumber() / 1e9} SOL`);

    // Simple transaction for testing - replace with actual marketplace logic later
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payerKeypair.publicKey,
        toPubkey: payerKeypair.publicKey, // Self-transfer for testing
        lamports: Math.min(listing.price.toNumber(), 1000000), // Max 0.001 SOL for safety
      })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = payerKeypair.publicKey;

    const txSig = await sendAndConfirmTransaction(connection, tx, [payerKeypair], {
      commitment: 'confirmed',
      maxRetries: 3,
    });

    console.log(`✅ Sale executed successfully: ${txSig}`);
    return { response: { signature: txSig }, signature: txSig };
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Unknown error';
    console.error('Sale execution failed:', errorMsg, { mint: listing.mint });
    throw err;
  }
}

// Helper function for building buy instructions (placeholder)
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

  return tx;
}

// Helper function for building sell instructions (placeholder)
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
  
  if (bid.price) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: payerKeypair.publicKey,
        toPubkey: payerKeypair.publicKey,
        lamports: Math.min(bid.price.toNumber(), 1000000),
      })
    );
  }

  return tx;
}
