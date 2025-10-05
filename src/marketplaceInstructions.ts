import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';
import { NFTListing, NFTBid } from './types';

export async function executeSale({
  connection,
  payerKeypair,
  listing,
  bid,
}: {
  connection: Connection;
  payerKeypair: Keypair;
  listing: NFTListing;
  bid: NFTBid;
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
    });

  return saleResponse;
}
