// src/autoFlashloanExecutor.ts
/**
 * AutoFlashloanExecutor — Solend flash loan + Metaplex Auction House executeSale
 *
 * Drop into src/ and import where you currently instantiate the executor.
 *
 * WARNING: Test fully on devnet. The Auction House and Solend SDKs change over time;
 * adapt small API differences if your installed versions differ.
 */

import {
  Connection,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import bs58 from "bs58";
import { pnlLogger } from "./pnlLogger";
import { ArbitrageSignal } from "./types";

// Solend SDK dynamic import types (we `require` at runtime to avoid crashing if not installed)
type SolendSdkShape = any;

// Metaplex SDK
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";
import { AuctionHouse } from "@metaplex-foundation/js"; // helps typing (may be optional depending on SDK)

export interface AutoFlashloanExecutorOptions {
  connection: Connection;
  payerKeypairBase58: string; // base58-encoded secret key for fee payer (must be funded)
  minProfitSOL?: number;
  solendNetwork?: "devnet" | "mainnet-beta";
  solendSdkModule?: SolendSdkShape | null; // optional injection for testing
}

export class AutoFlashloanExecutor {
  connection: Connection;
  payer: Keypair;
  minProfitSOL: number;
  solendNetwork: "devnet" | "mainnet-beta";
  solendSdk: SolendSdkShape | null = null;

  constructor(opts: AutoFlashloanExecutorOptions) {
    this.connection = opts.connection;
    this.minProfitSOL = opts.minProfitSOL ?? 0.02;
    this.solendNetwork = opts.solendNetwork ?? (this.connection.rpcEndpoint.includes("devnet") ? "devnet" : "mainnet-beta");

    // decode payer
    try {
      const u8 = bs58.decode(opts.payerKeypairBase58);
      this.payer = Keypair.fromSecretKey(Uint8Array.from(u8));
    } catch (err) {
      throw new Error("Failed to decode payerKeypairBase58. Provide a valid base58 secret key.");
    }

    // dynamic SDK injection or require
    this.solendSdk = opts.solendSdkModule ?? null;
    if (!this.solendSdk) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        this.solendSdk = require("@solendprotocol/solend-sdk");
      } catch {
        this.solendSdk = null;
      }
    }
  }

  /**
   * High-level: executeSignal
   *  - validates profit
   *  - builds Metaplex Auction House executeSale instructions (buy+sell)
   *  - builds Solend flash loan wrapper that runs those instructions in the callback
   *  - sends tx(s) and returns tx signature
   */
  public async executeSignal(signal: ArbitrageSignal): Promise<string> {
    // strict typing for catch uses below
    try {
      // Basic checks
      if (!signal.targetListing || !signal.targetBid) {
        throw new Error("Signal missing targetListing/targetBid");
      }

      const buySOL = Number(signal.targetListing.price) / 1e9;
      const sellSOL = Number(signal.targetBid.price) / 1e9;
      const estProfit = sellSOL - buySOL;

      if (estProfit < this.minProfitSOL) {
        throw new Error(`Estimated profit ${estProfit.toFixed(6)} SOL below minProfit ${this.minProfitSOL}`);
      }

      // 1) Build Metaplex instructions for executeSale
      // We'll create a Transaction with the executeSale instruction(s), then extract instructions to pass into Solend callback.
      const mp = Metaplex.make(this.connection).use(keypairIdentity(this.payer));

      // Derive AuctionHouse PublicKey from the signal or from config
      // NOTE: signal.targetListing.auctionHouse should be a program address (string)
      const auctionHousePubkey = new PublicKey(signal.targetListing.auctionHouse);

      // Attempt to fetch AuctionHouse object via Metaplex — adapt if your SDK version differs
      const auctionHouseObj = await mp
        .auctionHouse()
        .findByAddress({ address: auctionHousePubkey })
        .run()
        .catch(() => null);

      if (!auctionHouseObj) {
        // fallback: try to fetch minimal AuctionHouse info via PDA calls or require the auction house config externally
        throw new Error("Failed to fetch AuctionHouse object from Metaplex. Ensure auctionHouse address is correct and Metaplex SDK version supports findByAddress.");
      }

      // Build executeSale transaction builder
      // The Metaplex JS SDK provides an `executeSale` builder that accepts buyer/seller/tradeState etc.
      // We'll attempt to use it. If your SDK version differs, adapt to `builders` or lower-level instruction creation.

      // We need the buyer trade state and seller trade state PDAs — the SDK builder often accepts listing and bid objects.
      // If your signal carries raw PDAs (preferred), use them. Otherwise we derive trade states using SDK helpers.
      const buyerPubkey = this.payer.publicKey; // we act as buyer (temporarily)
      const sellerPubkey = new PublicKey(signal.targetListing.sellerPubkey || signal.targetListing.seller || buyerPubkey.toBase58());

      // Price must be in lamports
      const priceLamports = new BN(Math.round(buySOL * 1e9));

      // Build the executeSale builder. API may vary; try common pattern:
      let executeSaleTx: Transaction | null = null;
      try {
        // common pattern in Metaplex JS: auctionHouse().executeSale({...}).toTransaction()
        // If your SDK exposes a different builder interface, adapt accordingly.
        const builder = await mp.auctionHouse().executeSale({
          auctionHouse: auctionHouseObj,
          buyer: buyerPubkey,
          seller: sellerPubkey,
          tokenMint: new PublicKey(signal.targetListing.mint),
          price: Number(priceLamports.toString()), // some SDKs want number in lamports
        });

        // Convert builder to Transaction
        const maybe = await builder.toTransaction();
        executeSaleTx = maybe instanceof Transaction ? maybe : new Transaction().add(...(maybe.instructions ?? []));
      } catch (err: unknown) {
        // If executeSale builder fails, rethrow a more helpful message
        throw new Error("Failed to build executeSale transaction via Metaplex SDK; inspect SDK version and available builders. " + (err as Error).message);
      }

      if (!executeSaleTx) {
        throw new Error("executeSaleTx construction failed (null).");
      }

      // Extract instructions from executeSaleTx (we will pass them as the callback instructions to Solend)
      const callbackInstructions: TransactionInstruction[] = executeSaleTx.instructions;

      if (!callbackInstructions || callbackInstructions.length === 0) {
        throw new Error("No instructions extracted from executeSale transaction.");
      }

      // 2) Build Solend flash loan transaction(s) that wrap the callbackInstructions
      if (!this.solendSdk) {
        throw new Error("Solend SDK not installed. Run: npm i @solendprotocol/solend-sdk");
      }

      // Access SDK helpers
      const { SolendMarket, SolendAction } = this.solendSdk as any;

      if (!SolendMarket || !SolendAction) {
        throw new Error("Unexpected Solend SDK shape — ensure version exports SolendMarket and SolendAction.");
      }

      // Initialize Solend Market
      let solendMarket: any;
      try {
        solendMarket = await SolendMarket.initialize(this.connection, this.solendNetwork);
      } catch (err: unknown) {
        throw new Error("Failed to initialize SolendMarket: " + ((err as Error).message ?? String(err)));
      }

      // Choose an appropriate reserve (prefer SOL) that has sufficient liquidity
      const loanAmountLamports = Math.round(buySOL * 1e9 * 1.02); // 2% buffer
      let chosenReserve: any = null;
      const reserves = solendMarket.reserves ?? [];
      for (const r of reserves) {
        const available = Number(r?.liquidity?.available ?? 0);
        const symbol = r?.config?.liquidityToken?.symbol ?? "";
        const mint = r?.config?.liquidityToken?.mint ?? "";
        if ((symbol === "SOL" || mint === "So11111111111111111111111111111111111111112") && available > loanAmountLamports + 1e9) {
          chosenReserve = r;
          break;
        }
      }
      if (!chosenReserve) {
        // fallback: find any reserve with available > loan
        for (const r of reserves) {
          const available = Number(r?.liquidity?.available ?? 0);
          if (available > loanAmountLamports) {
            chosenReserve = r;
            break;
          }
        }
      }
      if (!chosenReserve) {
        throw new Error(`No Solend reserve with enough liquidity for ${loanAmountLamports} lamports`);
      }

      const reserveAddr = chosenReserve.config.address;
      // Build flash loan txns via SDK helper — adapt to your SDK version
      let actionBuildResult: any;
      try {
        // Many SDK versions expose something like buildFlashLoanTxns(connection, amountLamports, reserveAddress, receiverPubkey, callbackInstructionsArray, network)
        actionBuildResult = await SolendAction.buildFlashLoanTxns(
          this.connection,
          loanAmountLamports,
          reserveAddr,
          this.payer.publicKey,
          callbackInstructions,
          this.solendNetwork
        );
      } catch (err: unknown) {
        throw new Error("SolendAction.buildFlashLoanTxns failed: " + ((err as Error).message ?? String(err)));
      }

      // actionBuildResult expected shape: { transactions: [Transaction], signers: [[Keypair], ...] }
      if (!actionBuildResult || !actionBuildResult.transactions) {
        throw new Error("Unexpected result from SolendAction.buildFlashLoanTxns — inspect return shape.");
      }

      const builtTxs: Transaction[] = actionBuildResult.transactions.map((t: any) => {
        if (t instanceof Transaction) return t;
        // if SDK returned a serializable object, try to construct Transaction
        try {
          return Transaction.from(t.serialize ? t.serialize() : t);
        } catch {
          // fallback: empty transaction
          return new Transaction();
        }
      });

      const signersArray: Keypair[][] = actionBuildResult.signers ?? [];

      // 3) Send transactions returned by Solend builder (usually one)
      let finalSig = "";
      for (let i = 0; i < builtTxs.length; i++) {
        const tx = builtTxs[i];
        // ensure fee payer and blockhash
        tx.feePayer = this.payer.publicKey;
        try {
          const latest = await this.connection.getLatestBlockhash("finalized");
          tx.recentBlockhash = latest.blockhash;
        } catch {
          // continue without setting blockhash explicitly
        }

        const signers = signersArray[i] ?? [];
        // ensure payer included in signers
        const allSigners = Array.from(new Set([...signers, this.payer])).filter(Boolean) as Keypair[];

        // send transaction
        let sig: string;
        try {
          sig = await sendAndConfirmTransaction(this.connection, tx, allSigners, {
            commitment: "confirmed",
            preflightCommitment: "confirmed",
          });
        } catch (err: unknown) {
          throw new Error("Failed to send Solend flash loan transaction: " + ((err as Error).message ?? String(err)));
        }
        finalSig = sig;
      }

      if (!finalSig) throw new Error("Flash loan flow completed but no tx signature returned");

      // 4) Log trade via pnlLogger
      try {
        const buyBN = new BN(Math.round(buySOL * 1e9));
        const sellBN = new BN(Math.round(sellSOL * 1e9));
        const profitLamports = Math.round((sellSOL - buySOL) * 1e9);

        await pnlLogger.logTrade({
          timestamp: Date.now(),
          mint: signal.targetListing.mint,
          buyPrice: buyBN,
          sellPrice: sellBN,
          netProfit: new BN(profitLamports),
          currency: signal.targetListing.currency ?? "SOL",
          txSig: finalSig,
          type: "executed",
          executorType: "flash_loan",
          notes: `Flashloan executed via Solend reserve ${reserveAddr}`
        });
      } catch (err: unknown) {
        // non-fatal logging error
        console.warn("Warning: pnlLogger.logTrade failed:", (err as Error).message ?? err);
      }

      return finalSig;
    } catch (err: unknown) {
      const e = err as Error;
      // Log and rethrow or return a null/empty string depending on your flow
      await pnlLogger.logError(e, { signal });
      throw e;
    }
  } // end executeSignal
}
