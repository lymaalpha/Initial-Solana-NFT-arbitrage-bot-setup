import { Connection, Keypair, Transaction, TransactionInstruction } from "@solana/web3.js";
import { SolendSDK, FlashLoanReceiver } from "@solendprotocol/solend-sdk";
import { createBuyInstruction, createSellInstruction } from "./marketplaceInstructions";
import { config } from "./config";
import BN from "bn.js";

class AutoFlashloanExecutor {
  private connection: Connection;
  private payer: Keypair;
  private solendSdk: SolendSDK;

  constructor(connection: Connection, payer: Keypair) {
    this.connection = connection;
    this.payer = payer;
    this.solendSdk = new SolendSDK(connection);
  }

  async executeArbitrage(nftMint: string, buyPrice: BN, sellPrice: BN): Promise<void> {
    const buyInstruction = createBuyInstruction({
      nftMint: new PublicKey(nftMint),
      buyer: this.payer.publicKey,
      seller: this.payer.publicKey, // Assuming the seller is the bot itself
      price: buyPrice,
      auctionHouse: new PublicKey(config.auctionHouse),
    });

    const sellInstruction = createSellInstruction({
      nftMint: new PublicKey(nftMint),
      seller: this.payer.publicKey,
      buyer: this.payer.publicKey, // Assuming the buyer is the bot itself
      price: sellPrice,
      auctionHouse: new PublicKey(config.auctionHouse),
    });

    const flashLoanReceiver: FlashLoanReceiver = {
      programId: new PublicKey(config.flashLoanReceiverProgramId),
      accounts: [
        { pubkey: this.payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: buyInstruction.keys[2].pubkey, isSigner: false, isWritable: true },
        { pubkey: sellInstruction.keys[2].pubkey, isSigner: false, isWritable: true },
      ],
      data: Buffer.concat([
        Buffer.from([0]), // Arbitrary data to distinguish this receiver
        buyInstruction.data,
        sellInstruction.data,
      ]),
    };

    const flashLoanTx = await this.solendSdk.createFlashLoanTransaction(
      [buyInstruction, sellInstruction],
      flashLoanReceiver
    );

    const tx = new Transaction().add(flashLoanTx);
    await this.connection.sendTransaction(tx, [this.payer]);
    console.log("Arbitrage executed successfully!");
  }
}
