import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
} from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";
import BN from "bn.js";
import { NFTListing, NFTBid } from "./types";  // Tie to your types

export type ListingLike = Partial<NFTListing>;  // Extend for partials
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
    const ahPubkey = new PublicKey(listing.auctionHouse!);  // Assume set

    const auctionHouseObj = await metaplex
      .auctionHouse()
      .findByAddress({ address: ahPubkey })
      .run();

    const builder = await metaplex.auctionHouse().executeSale({
      auctionHouse: auctionHouseObj,
      buyer: payerKeypair.publicKey,
      seller: new PublicKey(listing.sellerPubkey || payerKeypair.publicKey.toString()),
      tokenMint: new PublicKey(listing.mint!),
      price: listing.price!,  // BN passed directly (SDK handles)
    });

    let tx: Transaction;
    if (Array.isArray(builder)) {
      tx = new Transaction().add(...builder);
    } else {
      tx = await builder.toTransaction();
    }

    // Simulate for safety
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
    // Stub manual ixs if needed (e.g., from mpl-auction-house)
    throw err;
  }
}
