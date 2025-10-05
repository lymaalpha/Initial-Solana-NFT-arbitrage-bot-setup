import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import { NFTListing, NFTBid } from './types';

export type ListingLike = Partial<NFTListing>;
export type BidLike = Partial<NFTBid>;

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
}) {
  if (!listing.auctionHouse || !listing.mint || !listing.price)
    throw new Error('Listing missing auctionHouse, mint, or price');

  const metaplex = Metaplex.make(connection).use(keypairIdentity(payerKeypair));

  const auctionHouseObj = await metaplex.auctionHouse().findByAddress({
    address: new PublicKey(listing.auctionHouse),
  });

  const buyerPubkey = bid.bidderPubkey ? new PublicKey(bid.bidderPubkey) : payerKeypair.publicKey;

  const saleResponse = await metaplex.auctionHouse().executeSale({
    auctionHouse: auctionHouseObj,
    buyer: buyerPubkey,
    tokenMint: new PublicKey(listing.mint),
    price: listing.price,
    tokenSize: 1,
  });

  const txSig = saleResponse.response?.signature || '';
  return { response: saleResponse.response, signature: txSig };
}
