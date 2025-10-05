// marketplaceInstructions.ts
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
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

  const buyer = bid.bidderPubkey ? new PublicKey(bid.bidderPubkey) : payerKeypair.publicKey;

  const saleResponse = await metaplex
    .auctionHouse()
    .executeSale({
      auctionHouse: auctionHouseObj,
      seller: payerKeypair.publicKey,
      buyer,
      tokenMint: new PublicKey(listing.mint),
      price: listing.price,
      tokenSize: 1,
    })
    .run();

  return saleResponse; // Contains tx signature and confirmation
}
