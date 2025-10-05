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
    tokenMint: new PublicKey
