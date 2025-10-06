import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
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

    // Fixed: buyer: PublicKey, no tokenOwnerRecord
    const saleResponse = await metaplex.auctionHouse().executeSale({
      auctionHouse: auctionHouseObj,
      buyer: buyerPubkey,
      tokenMint: new PublicKey(listing.mint),
      price: listing.price.toNumber(),
      tokenSize: 1,
    });

    // Fixed: Send instructions to get signature
    const tx = new Transaction().add(...(saleResponse.instructions || []));
    const txSig = await sendAndConfirmTransaction(connection, tx, [payerKeypair], {
      commitment: 'confirmed',
    });

    pnlLogger.logMetrics({ message: `✅ Sale executed: ${txSig}` });
    return { response: saleResponse, signature: txSig };
  } catch (err: unknown) {
    pnlLogger.logError(err as Error, { listing: listing.mint, bid: bid.mint });
    throw err;
  }
}
