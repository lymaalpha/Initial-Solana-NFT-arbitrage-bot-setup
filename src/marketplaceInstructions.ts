import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,  // Added import
  Keypair,
} from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";
import BN from "bn.js";
import { NFTListing, NFTBid } from "./types";

export type ListingLike = Partial<NFTListing>;
export type BidLike = Partial<NFTBid>;

export async function buildExecuteSaleTransaction(params: {
  connection: Connection;
  payerKeypair: Keypair;
  listing: ListingLike;
  bid: BidLike;
}): Promise<Transaction> {
  const { connection, payerKeypair, listing, bid } = params;

  try {
    const metaplex = Metaplex.make(connection).use(keypairIdentity(payerKeypair));
    const ahPubkey = new PublicKey(listing.auctionHouse!);

    // Fixed: Await without .run() (Promise-based)
    const auctionHouseObj = await metaplex.auctionHouse().findByAddress({ address: ahPubkey });

    // Fixed: Correct input params for executeSale
    const { instructions } = await metaplex.auctionHouse().executeSale({
      auctionHouse: auctionHouseObj,
      tokenOwnerRecord: new PublicKey(bid.bidderPubkey || payerKeypair.publicKey.toString()),  // Buyer trade state equiv
      tokenMint: new PublicKey(listing.mint!),
      price: listing.price!,
      tokenOwner: payerKeypair.publicKey,  // Seller if direct
    });

    const tx = new Transaction().add(...instructions as TransactionInstruction[]);  // ixs to tx

    // Simulate
    const simResult = await connection.simulateTransaction(tx);
    if (simResult.value.err) {
      throw new Error(`Simulation failed: ${simResult.value.err}`);
    }

    return tx;
  } catch (err) {
    console.error("Sale tx build failed:", err);
    throw err;
  }
}

export async function buildBuyThenAcceptOfferInstructions(params: {
  connection: Connection;
  payerKeypair: Keypair;
  listing: ListingLike;
  bid: BidLike;
}): Promise<TransactionInstruction[]> {
  try {
    const tx = await buildExecuteSaleTransaction(params);
    return tx.instructions;
  } catch (err) {
    console.warn("Fallback to manual AH execution required:", err);
    throw err;
  }
}
