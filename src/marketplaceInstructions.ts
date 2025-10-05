// marketplaceInstructions.ts
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import BN from 'bn.js';
import { NFTListing, NFTBid } from './types';
import { config } from './config'; // for optional simulateOnly flag

export type ListingLike = Partial<NFTListing>;
export type BidLike = Partial<NFTBid>;

/**
 * Builds a Transaction to execute a sale via Auction House
 */
export async function buildExecuteSaleTransaction(params: {
  connection: Connection;
  payerKeypair: Keypair;
  listing: ListingLike;
  bid: BidLike;
}): Promise<Transaction> {
  const { connection, payerKeypair, listing, bid } = params;

  if (!listing.auctionHouse) throw new Error('Listing auctionHouse missing');
  if (!listing.mint) throw new Error('Listing mint missing');
  if (!listing.price) throw new Error('Listing price missing');

  // Ensure price is BN
  const priceBN = BN.isBN(listing.price) ? listing.price : new BN(listing.price);

  const metaplex = Metaplex.make(connection).use(keypairIdentity(payerKeypair));

  // Find Auction House object
  const auctionHouseObj = await metaplex.auctionHouse().findByAddress({
    address: new PublicKey(listing.auctionHouse),
  });

  // Compute seller trade state
  const sellerTradeState = await metaplex.auctionHouse().findTradeState({
    auctionHouse: auctionHouseObj,
    wallet: payerKeypair.publicKey,
    tokenMint: new PublicKey(listing.mint),
    tokenSize: listing.size ?? 1,
    price: priceBN,
  });

  // Compute buyer trade state
  const buyerWallet = bid.bidderPubkey ? new PublicKey(bid.bidderPubkey) : payerKeypair.publicKey;
  const buyerTradeState = await metaplex.auctionHouse().findTradeState({
    auctionHouse: auctionHouseObj,
    wallet: buyerWallet,
    tokenMint: new PublicKey(listing.mint),
    tokenSize: listing.size ?? 1,
    price: priceBN,
  });

  // Build the executeSale TransactionBuilder
  const txBuilder = await metaplex.auctionHouse().executeSale({
    auctionHouse: auctionHouseObj,
    sellerTradeState,
    buyerTradeState,
    tokenMint: new PublicKey(listing.mint),
    price: priceBN,
  });

  // Convert TransactionBuilder to Transaction
  const tx = new Transaction();
  for (const ix of txBuilder.getInstructions()) {
    tx.add(ix as TransactionInstruction);
  }

  // Optional: simulate transaction before sending (skip if live)
  if (!config.simulateOnly) {
    const simResult = await connection.simulateTransaction(tx);
    if (simResult.value.err) {
      throw new Error(
        `Simulation failed for mint ${listing.mint} @ ${listing.auctionHouse}: ${JSON.stringify(
          simResult.value.err
        )}`
      );
    }
  }

  return tx;
}
