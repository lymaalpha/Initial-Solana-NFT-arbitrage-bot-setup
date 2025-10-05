import { Connection, PublicKey, Transaction, TransactionInstruction, Keypair } from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";
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

    const auctionHouseObj = await metaplex.auctionHouse().findByAddress({ address: ahPubkey });

    // Compute seller/buyer trade states
    const sellerTradeState = await metaplex.auctionHouse().findTradeState({
      auctionHouse: auctionHouseObj,
      wallet: payerKeypair.publicKey,
      tokenMint: new PublicKey(listing.mint!),
      tokenAccount: new PublicKey(listing.tokenAccount!),
      price: listing.price!,
      tokens: 1,
    });

    const buyerTradeState = await metaplex.auctionHouse().findTradeState({
      auctionHouse: auctionHouseObj,
      wallet: new PublicKey(bid.bidderPubkey || payerKeypair.publicKey.toString()),
      tokenMint: new PublicKey(listing.mint!),
      tokenAccount: new PublicKey(bid.tokenAccount!),
      price: listing.price!,
      tokens: 1,
    });

    // Build TransactionBuilder
    const txBuilder = await metaplex.auctionHouse().executeSale({
      auctionHouse: auctionHouseObj,
      sellerTradeState,
      buyerTradeState,
      tokenMint: new PublicKey(listing.mint!),
      price: listing.price!,
    });

    // Convert TransactionBuilder to Transaction
    const tx = new Transaction();
    for (const ix of txBuilder.getInstructions()) {
      tx.add(ix as TransactionInstruction);
    }

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
