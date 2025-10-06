mport { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import { NFTListing, NFTBid } from './types';
import { pnlLogger } from './pnlLogger';

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
  if (!listing.auctionHouse || !listing.mint || !listing.price) {
    const err = new Error('Listing missing auctionHouse, mint, or price');
    pnlLogger.logError(err, { listing });
    throw err;
  }

  try {
    const metaplex = Metaplex.make(connection).use(keypairIdentity(payerKeypair));

    const auctionHouseObj = await metaplex.auctionHouse().findByAddress({
      address: new PublicKey(listing.auctionHouse),
    });

    const buyerPubkey = bid.bidderPubkey ? new PublicKey(bid.bidderPubkey) : payerKeypair.publicKey;

    // Fixed: buyer: PublicKey, instructions output
    const { instructions } = await metaplex.auctionHouse().executeSale({
      auctionHouse: auctionHouseObj,
      buyer: buyerPubkey,  // Fixed input
      tokenMint: new PublicKey(listing.mint),
      price: listing.price.toNumber(),
      tokenSize: 1,
    });

    const tx = new Transaction().add(...instructions as TransactionInstruction[]);

    // Send and get signature
    const txSig = await sendAndConfirmTransaction(connection, tx, [payerKeypair], {
      commitment: 'confirmed',
    });

    pnlLogger.logMetrics({ message: `✅ Sale executed: ${txSig}` });
    return { response: { instructions }, signature: txSig };
  } catch (err: unknown) {
    pnlLogger.logError(err as Error, { listing: listing.mint, bid: bid.mint });
    throw err;
  }
}
