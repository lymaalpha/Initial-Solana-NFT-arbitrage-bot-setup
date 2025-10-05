import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import { NFTListing, NFTBid } from './types';

export type ListingLike = Partial<NFTListing>;
export type BidLike = Partial<NFTBid>;

export async function buildExecuteSaleTransaction(params: {
  connection: Connection;
  payerKeypair: Keypair;
  listing: ListingLike;
  bid: BidLike;
}): Promise<Transaction> {
  const { connection, payerKeypair, listing, bid } = params;
  const metaplex = Metaplex.make(connection).use(keypairIdentity(payerKeypair));
  const auctionHouseObj = await metaplex.auctionHouse().findByAddress({ address: new PublicKey(listing.auctionHouse!) });

  // Compute trade states via SDK helper methods
  const sellerTradeState = await metaplex.auctionHouse().findTradeState({
    auctionHouse: auctionHouseObj,
    wallet: payerKeypair.publicKey,
    tokenMint: new PublicKey(listing.mint!),
    tokenSize: 1,
    price: listing.price!
  });

  const buyerTradeState = await metaplex.auctionHouse().findTradeState({
    auctionHouse: auctionHouseObj,
    wallet: new PublicKey(bid.bidderPubkey || payerKeypair.publicKey.toString()),
    tokenMint: new PublicKey(listing.mint!),
    tokenSize: 1,
    price: listing.price!
  });

  const txBuilder = await metaplex.auctionHouse().executeSale({
    auctionHouse: auctionHouseObj,
    sellerTradeState,
    buyerTradeState,
    tokenMint: new PublicKey(listing.mint!),
    price: listing.price!,
  });

  const tx = new Transaction();
  for (const ix of txBuilder.getInstructions()) {
    tx.add(ix as TransactionInstruction);
  }

  const simResult = await connection.simulateTransaction(tx);
  if (simResult.value.err) throw new Error(`Simulation failed: ${simResult.value.err}`);

  return tx;
}
