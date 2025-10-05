// src/marketplaceInstructions.ts
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  Keypair,
} from "@solana/web3.js";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";
import BN from "bn.js";
import { AuctionHouse, toBigNumber } from "@metaplex-foundation/js";

/**
 * Types used by the functions below. Adapt to your `types.ts` if different.
 */
export type ListingLike = {
  mint: string; // NFT mint address (string)
  price: BN; // price in lamports (BN)
  auctionHouse: string; // auction house program address
  sellerPubkey?: string; // optional seller pubkey (string)
  // optionally include precomputed PDAs/tradeStates if you have them:
  tradeStatePubkey?: string;
  buyerTradeStatePubkey?: string;
};

export type BidLike = {
  mint: string;
  price: BN;
  auctionHouse: string;
  bidderPubkey?: string;
  tradeStatePubkey?: string;
};

/**
 * buildExecuteSaleTransaction
 *
 * Uses Metaplex JS SDK to construct a Transaction that executes a sale.
 * This is the preferred single-instruction "executeSale" flow where possible.
 *
 * Returns a Transaction ready to be merged into your flash-loan callback.
 *
 * NOTE: This function requires the Metaplex JS SDK (@metaplex-foundation/js) installed
 * and will attempt to use the Auction House module. If your SDK version differs,
 * adapt the builder call accordingly.
 */
export async function buildExecuteSaleTransaction(params: {
  connection: Connection;
  payerKeypair: Keypair; // the account that will act as buyer/seller temporarily
  listing: ListingLike;
  bid: BidLike;
}): Promise<Transaction> {
  const { connection, payerKeypair, listing, bid } = params;

  // Create Metaplex instance with ephemeral identity (payer will sign tx later)
  const metaplex = Metaplex.make(connection).use(keypairIdentity(payerKeypair));

  // Auction House address
  const ahPubkey = new PublicKey(listing.auctionHouse);

  // Try to load AuctionHouse object via Metaplex
  let auctionHouseObj: AuctionHouse | null = null;
  try {
    auctionHouseObj = await metaplex.auctionHouse().findByAddress({ address: ahPubkey }).run();
  } catch (err) {
    // fallthrough to helpful error
    throw new Error(
      `Failed to fetch AuctionHouse via Metaplex for ${ahPubkey.toBase58()}. ` +
      `Ensure the auctionHouse address is correct and that @metaplex-foundation/js version supports findByAddress. Error: ${(err as Error).message}`
    );
  }

  // Price: Metaplex expects BigNumber-like or number in base units; toBigNumber helper converts
  const buyPrice = toBigNumber(listing.price.toNumber()); // `toBigNumber` accepts number|BN - adjust if needed

  // Build the executeSale builder
  // API shape: metaplex.auctionHouse().executeSale({ auctionHouse, seller, buyer, tokenAccount, price, ...}).toTransaction()
  // The exact builder options vary across SDK versions; we'll attempt the common pattern.
  let executeSaleTx: Transaction;
  try {
    // Use seller and buyer as appropriate:
    // If you are buying on market A and selling into a bid on market B, you might create two different builders.
    // Here we build a sale that takes the listing and the bid as counterparties and executes the transfer.
    // NOTE: many auction-house marketplaces provide one executeSale instruction combining listing + bid.
    const builder = await metaplex
      .auctionHouse()
      .executeSale({
        auctionHouse: auctionHouseObj,
        // buyer is the existing bidder (we act as buyer/seller depending on flow)
        buyer: payerKeypair.publicKey,
        seller: payerKeypair.publicKey,
        // tokenMint is the NFT's mint
        tokenMint: new PublicKey(listing.mint),
        // price in lamports
        price: listing.price.toNumber(),
        // optionally, you can provide the trade state PDAs if you have them:
        // buyerTradeState, sellerTradeState, etc.
      });

    // Convert builder to Transaction
    const maybeTx = await builder.toTransaction();
    if (maybeTx instanceof Transaction) {
      executeSaleTx = maybeTx;
    } else {
      // some SDKs return an object with .instructions
      executeSaleTx = new Transaction();
      if (maybeTx.instructions && Array.isArray(maybeTx.instructions)) {
        for (const ix of maybeTx.instructions) executeSaleTx.add(ix);
      } else {
        throw new Error("Metaplex builder produced unexpected result; please inspect builder.toTransaction() output.");
      }
    }
  } catch (err) {
    // Provide a clear error to help you debug
    throw new Error(
      "Failed to build executeSale transaction using Metaplex JS SDK. " +
      `Common causes: incompatible SDK version or missing tradeState PDAs. Error: ${(err as Error).message}`
    );
  }

  return executeSaleTx;
}

/**
 * buildBuyThenAcceptOfferInstructions
 *
 * Some marketplaces or flows use two distinct instructions:
 *  - buy (place / execute buy)
 *  - acceptOffer (seller accepts an existing collection offer)
 *
 * This helper returns an array of TransactionInstructions (in order)
 * you can add into a Transaction inside the flash loan callback.
 *
 * NOTE: Implementation is kept generic; adapt to the marketplace SDK if you need
 * specific PDAs / trade-state derivations (Tensor/MagicEden might need slightly different PDAs).
 */
export async function buildBuyThenAcceptOfferInstructions(params: {
  connection: Connection;
  payerKeypair: Keypair;
  listing: ListingLike;
  bid: BidLike;
}): Promise<TransactionInstruction[]> {
  const { connection, payerKeypair, listing, bid } = params;

  // Attempt high-level executeSale first (preferred single-instruction)
  try {
    const tx = await buildExecuteSaleTransaction({ connection, payerKeypair, listing, bid });
    // Return the assembled instructions for insertion into flash loan callback
    return tx.instructions;
  } catch (err) {
    // If executeSale couldn't be built, provide a fallback plan
    // Fallback: build separate buy and accept instructions using lower-level mpl-auction-house
    // (This requires manual PDA derivation and is more fragile — see comments below.)
    console.warn("Falling back to buy+accept-offer instruction flow. Error:", (err as Error).message);
  }

  // ----- FALLBACK PATH (manual) -----
  // The fallback requires using @metaplex-foundation/mpl-auction-house (low-level) to build
  // 'buy' and 'execute_sale' instructions. This code intentionally omits full PDA math
  // to avoid silent mistakes — instead the comments instruct how to derive them.

  // TODO: If you want full fallback code using mpl-auction-house (manual PDA), I can generate it,
  // but it requires the exact Auction House program id and version and careful testing on devnet.
  throw new Error("executeSale builder failed and fallback manual build not implemented. Request fallback code if needed.");
}
