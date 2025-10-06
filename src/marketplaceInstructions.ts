import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
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
  if (!listing.auctionHouse || !listing.mint || !listing.price || !listing.tradeStateAddress || !listing.sellerAddress) {
    const err = new Error('Listing missing auctionHouse, mint, price, tradeStateAddress, or sellerAddress');
    pnlLogger.logError(err, { listing });
    throw err;
  }
  if (!bid.tradeStateAddress || !bid.buyerAddress || !bid.price) {
    const err = new Error('Bid missing tradeStateAddress, buyerAddress, or price');
    pnlLogger.logError(err, { bid });
    throw err;
  }

  try {
    const metaplex = Metaplex.make(connection).use(keypairIdentity(payerKeypair));

    const auctionHouseObj = await metaplex.auctionHouse().findByAddress({
      address: new PublicKey(listing.auctionHouse),
    });

    // Corrected: executeSale parameters based on Metaplex SDK documentation
    // The `executeSale` function expects `listing` and `bid` objects that are subsets
    // of the full Listing and Bid models, containing specific properties.
    const { response } = await metaplex.auctionHouse().executeSale({
      auctionHouse: auctionHouseObj,
      // The `listing` object needs specific properties
      listing: {
        auctionHouse: auctionHouseObj,
        asset: { address: new PublicKey(listing.mint) }, // Assuming asset address is the mint
        tradeStateAddress: new PublicKey(listing.tradeStateAddress),
        sellerAddress: new PublicKey(listing.sellerAddress),
        receiptAddress: listing.receiptAddress ? new PublicKey(listing.receiptAddress) : undefined,
        price: listing.price, // Assuming price is already a SolAmount or SplTokenAmount
        tokens: listing.tokens || 1, // Default to 1 token if not specified
      } as any, // Type assertion for now, ideally define a proper Pick type
      // The `bid` object needs specific properties
      bid: {
        auctionHouse: auctionHouseObj,
        asset: { address: new PublicKey(listing.mint) }, // Assuming asset address is the mint
        tradeStateAddress: new PublicKey(bid.tradeStateAddress),
        buyerAddress: new PublicKey(bid.buyerAddress),
        receiptAddress: bid.receiptAddress ? new PublicKey(bid.receiptAddress) : undefined,
        price: bid.price, // Assuming price is already a SolAmount or SplTokenAmount
        tokens: bid.tokens || 1, // Default to 1 token if not specified
      } as any, // Type assertion for now, ideally define a proper Pick type
      // authority: payerKeypair, // Only needed if the authority is signing the transaction
    });

    // The `response` from executeSale is a TransactionBuilder, not an object with `instructions` property.
    // We need to build and send the transaction from this builder.
    const transactionBuilder = response;
    const latestBlockhash = await connection.getLatestBlockhash();
    const transaction = await transactionBuilder.build({
      latestBlockhash: latestBlockhash,
      payer: payerKeypair.publicKey,
    });

    // Sign and send the transaction
    transaction.sign(payerKeypair);
    const txSig = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction(txSig, 'confirmed');

    pnlLogger.logMetrics({ message: `✅ Sale executed: ${txSig}` });
    return { response: response, signature: txSig };
  } catch (err: unknown) {
    pnlLogger.logError(err as Error, { listing: listing.mint, bid: bid.mint });
    throw err;
  }
}
