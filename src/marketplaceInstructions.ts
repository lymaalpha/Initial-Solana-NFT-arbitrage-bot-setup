import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction } from '@solana/web3.js';
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

    // Fixed: tokenOwnerRecord for buyer, no 'buyer'
    const saleResponse = await metaplex.auctionHouse().executeSale({
      auctionHouse: auctionHouseObj,
      tokenOwnerRecord: buyerPubkey,  // Fixed input
      tokenMint: new PublicKey(listing.mint),
      price: listing.price.toNumber(),
      tokenSize: 1,
    });

    const txSig = saleResponse.signature || saleResponse.response?.signature || '';  // Fixed: direct signature
    if (!txSig) {
      throw new Error('No signature in sale response');
    }

    pnlLogger.logMetrics({ message: `✅ Sale executed: ${txSig}`, signature: txSig });
    return { response: saleResponse, signature: txSig };
  } catch (err: unknown) {  // Fixed: unknown
    pnlLogger.logError(err as Error, { listing: listing.mint, bid: bid.mint });
    throw err;
  }
}
