import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { SolendAction, SolendMarket } from "@solendprotocol/solend-sdk";
import { ArbitrageSignal } from "./types";
import { pnlLogger } from "./pnlLogger";
import { config } from "./config";

// Placeholder marketplace logic (replace these with actual API transaction calls)
async function buyNFT(signal: ArbitrageSignal, payer: Keypair, connection: Connection): Promise<string> {
  console.log(`🛒 Buying NFT ${signal.targetListing.mint} for ${signal.targetListing.price.toNumber() / 1e9} SOL`);
  // TODO: replace with real marketplace buy transaction
  await new Promise((res) => setTimeout(res, 500));
  return `buy_tx_${Date.now()}`;
}

async function sellNFT(signal: ArbitrageSignal, payer: Keypair, connection: Connection): Promise<string> {
  console.log(`💸 Selling NFT ${signal.targetListing.mint} for ${signal.targetBid.price.toNumber() / 1e9} SOL`);
  // TODO: replace with real marketplace sell transaction
  await new Promise((res) => setTimeout(res, 500));
  return `sell_tx_${Date.now()}`;
}

export class AutoFlashloanExecutor {
  private connection: Connection;
  private payer: Keypair;
  private solendMarket: SolendMarket;
  private flashLoanReserve: PublicKey;

  constructor(options: {
    connection: Connection;
    payer: Keypair;
    flashLoanReserve: string; // typically SOL or USDC reserve
  }) {
    this.connection = options.connection;
    this.payer = options.payer;
    this.flashLoanReserve = new PublicKey(options.flashLoanReserve);
    this.solendMarket = new SolendMarket({
      connection: this.connection,
      cluster: config.rpcUrl.includes("devnet") ? "devnet" : "mainnet",
    });
  }

  /**
   * Executes an arbitrage signal using a real Solend flash loan.
   */
  async executeSignal(signal: ArbitrageSignal): Promise<string | null> {
    try {
      console.log(`⚡ Executing flash loan arbitrage for ${signal.targetListing.mint}`);

      const borrowAmountLamports = signal.targetListing.price.add(config.feeBufferLamports);
      const borrowAmountSOL = borrowAmountLamports.toNumber() / 1e9;

      console.log(`💰 Borrowing ${borrowAmountSOL} SOL from Solend...`);

      // Initialize Solend Market
      await this.solendMarket.loadReserves();

      // Construct flash loan transaction
      const flashLoanAction = await SolendAction.buildFlashLoanTxns(
        this.connection,
        borrowAmountLamports.toNumber(),
        this.flashLoanReserve,
        this.payer.publicKey,
        async (connection, payer) => {
          // ⏩ The core arbitrage steps during the flash loan
          const buySig = await buyNFT(signal, payer, connection);
          const sellSig = await sellNFT(signal, payer, connection);

          console.log(`✅ Buy TX: ${buySig}`);
          console.log(`✅ Sell TX: ${sellSig}`);
        }
      );

      // Combine and execute the flash loan transaction
      const tx = new Transaction().add(...flashLoanAction.txns);
      const sig = await sendAndConfirmTransaction(this.connection, tx, [this.payer]);
      console.log(`🔗 Flash loan executed with signature: ${sig}`);

      const profitLamports = signal.estimatedNetProfit.toNumber();
      await pnlLogger.logTrade({
        timestamp: Date.now(),
        mint: signal.targetListing.mint,
        buyPrice: signal.targetListing.price,
        sellPrice: signal.targetBid.price,
        netProfit: signal.estimatedNetProfit,
        currency: signal.targetListing.currency,
        txSig: sig,
        type: "executed",
        executorType: "flash_loan",
        notes: `Executed via Solend - Borrowed ${borrowAmountSOL} SOL`,
      });

      return sig;
    } catch (err) {
      console.error("❌ Flash loan execution failed:", err);
      await pnlLogger.logError(err as Error, { context: "autoFlashloanExecutor.executeSignal", signal });
      return null;
    }
  }

  async executeBatch(signals: ArbitrageSignal[]): Promise<string[]> {
    const txs: string[] = [];
    for (const signal of signals) {
      const tx = await this.executeSignal(signal);
      if (tx) txs.push(tx);
      await new Promise((res) => setTimeout(res, 2000)); // small delay between cycles
    }
    return txs;
  }
}
