import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  TransactionInstruction,
} from "@solana/web3.js";
import { Metaplex, keypairIdentity, AuctionHouse, TransactionBuilder } from "@metaplex-foundation/js";
import { NFTListing, NFTBid } from "./types";

export type ListingLike = Partial<NFTListing>;
export type BidLike = Partial<NFTBid>;

/**
 * Build a Transaction for executing a sale on the Auction House.
 */
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

    // Load Auction House object
    const auctionHouseObj: AuctionHouse = await metaplex
      .auctionHouse()
      .findByAddress({ address: ahPubkey });

    // Build execute sale TransactionBuilder
    const txBuilder: TransactionBuilder = await metaplex
      .auctionHouse()
      .executeSale({
        auctionHouse: auctionHouseObj,
        buyer: new PublicKey(bid.bidderPubkey || payerKeypair.publicKey.toString()),
        seller: new PublicKey(listing.sellerPubkey || payerKeypair.publicKey.toString()),
        tokenMint: new PublicKey(listing.mint!),
        price: listing.price!,
      });

    // Convert TransactionBuilder to a Transaction
    const tx = new Transaction();
    for (const ix of txBuilder.getInstructions()) {
      tx.add(ix as TransactionInstruction);
    }

    // Simulate before sending
    const simResult = await connection.simulateTransaction(tx);
    if (simResult.value.err) {
      throw new Error(`Simulation failed: ${simResult.value.err}`);
    }

    return tx;
  } catch (err) {
    console.error("Sale transaction build failed:", err);
    throw err;
  }
}

/**
 * Helper to get raw instructions for advanced handling
 */
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
    console.warn("Fallback to manual Auction House execution required:", err);
    throw err;
  }
}
