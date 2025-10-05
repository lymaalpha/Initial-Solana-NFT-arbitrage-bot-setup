import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { SolendAction, SolendMarketV2 } from "@solendprotocol/solend-sdk";  // V2 for constructor
import { ArbitrageSignal, TradeLog } from "./types";
import { buildExecuteSaleTransaction } from "./marketplaceInstructions";
import { pnlLogger } from "./pnlLogger";
import { config } from "./config";
import BN from 'bn.js';
import bs58 from 'bs58';

const connection = new Connection(config.rpcUrl, "confirmed");
const payer = Keypair.fromSecretKey(bs58.decode(config.walletPrivateKey));

const FLASHLOAN_RESERVE = new PublicKey("So11111111111111111111111111111111111111112");

async function executeMarketplaceArbitrage(signal: ArbitrageSignal): Promise<{ buySig?: string; sellSig?: string }> {
  const arbTx = await buildExecuteSaleTransaction({
    connection,
    payerKeypair: payer,
    listing: {
      mint: signal.targetListing.mint,
      price: signal.targetListing.price,
      auctionHouse: signal.targetListing.auctionHouse,
      sellerPubkey: signal.targetListing.sellerPubkey,
    },
    bid: {
      mint: signal.targetBid.mint,
      price: signal.targetBid.price,
      auctionHouse: signal.targetBid.auctionHouse,
      bidderPubkey: signal.targetBid.bidderPubkey,
    },
  });

  const simResult = await connection.simulateTransaction(arbTx);
  if (simResult.value.err) {
    throw new Error(`Simulation failed: ${simResult.value.err}`);
  }

  let txSig: string | undefined;
  if (!config.simulateOnly) {
    txSig = await sendAndConfirmTransaction(connection, arbTx, [payer], {
      commitment: 'confirmed',
      maxRetries: 3,
    }).then(s => s);
  } else {
    txSig = `sim_tx_${Date.now()}`;
  }

  pnlLogger.logInfo(`✅ Marketplace arb executed: ${txSig}`);
  return { buySig: txSig, sellSig: txSig };
}

export async function executeFlashloanArbitrage(signal: ArbitrageSignal): Promise<TradeLog | null> {
  try {
    pnlLogger.logInfo(`⚡ Executing flashloan arbitrage for ${signal.targetListing.mint}`);
    const market = new SolendMarketV2({ connection, cluster: "devnet" });  // V2, fixed cluster
    await market.loadReserves();

    const borrowAmountLamports = signal.targetListing.price.add(config.feeBufferLamports);
    const borrowAmountSOL = borrowAmountLamports.toNumber() / 1e9;

    pnlLogger.logInfo(`💰 Borrowing ${borrowAmountSOL.toFixed(3)} SOL from Solend...`);

    // Fixed: Use flashLoan method
    const { transaction } = await SolendAction.flashLoan({
      connection,
      amount: borrowAmountSOL,
      reserve: FLASHLOAN_RESERVE,
      receiver: payer.publicKey,
      callback: async (conn: Connection, keypair: Keypair) => {
        const { buySig, sellSig } = await executeMarketplaceArbitrage(signal);
        pnlLogger.logInfo(`✅ Buy TX: ${buySig} | Sell TX: ${sellSig}`);
      },
    });

    let txSig: string | undefined;
    if (!config.simulateOnly) {
      txSig = await sendAndConfirmTransaction(connection, transaction, [payer], {
        commitment: 'confirmed',
        maxRetries: 3,
      }).then(s => s);
    } else {
      txSig = `sim_tx_${Date.now()}`;
    }

    pnlLogger.logInfo(`🔗 Flashloan executed successfully: ${txSig}`);

    const netProfit = signal.estimatedNetProfit;
    const tradeLog: TradeLog = {
      timestamp: Date.now(),
      mint: signal.targetListing.mint,
      buyPrice: signal.targetListing.price,
      sellPrice: signal.targetBid.price,
      netProfit,
      currency: signal.targetListing.currency,
      txSig,
      type: 'executed',
      notes: `Confidence: ${signal.confidence || 0.5}`,
      executorType: 'flash_loan',
    };

    await pnlLogger.logTrade(tradeLog);
    return tradeLog;
  } catch (err: any) {
    const errorMsg = err.message || 'Unknown error';
    pnlLogger.logError(new Error(errorMsg), { mint: signal.targetListing.mint });

    const tradeLog: TradeLog = {
      timestamp: Date.now(),
      mint: signal.targetListing.mint,
      buyPrice: signal.targetListing.price,
      sellPrice: signal.targetBid.price,
      netProfit: new BN(0),
      currency: signal.targetListing.currency,
      txSig: undefined,
      type: 'failed',
      notes: `Error: ${errorMsg}`,
      executorType: 'flash_loan',
    };

    await pnlLogger.logTrade(tradeLog);
    return null;
  }
}

export async function executeBatch(signals: ArbitrageSignal[]): Promise<TradeLog[]> {
  const trades: TradeLog[] = [];
  for (const signal of signals) {
    const trade = await executeFlashloanArbitrage(signal);
    if (trade) trades.push(trade);
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
  }
  return trades;
}
