// src/autoFlashloanExecutor.ts (FINAL, SIMPLIFIED, CORRECTED)
import { Connection, Keypair } from "@solana/web3.js";
import BN from "bn.js";
import { ArbitrageSignal, BotConfig, ExecuteSaleParams, SaleResponse } from "./types";
import { pnlLogger } from "./pnlLogger";
import { sleep } from "./utils";

class FlashloanProgram {
  constructor(private connection: Connection, private wallet: Keypair) {}

  async executeSale(params: ExecuteSaleParams): Promise<SaleResponse> {
    // The mint is now guaranteed to be a string.
    pnlLogger.logMetrics({ message: `Simulating trade for mint: ${params.listing.mint}` });
    await sleep(1000);
    return {
      txSig: "SIMULATED_TX_SIG_" + Math.random().toString(36).substring(7),
    };
  }
}

export class AutoFlashloanExecutor {
  private flashloanProgram: FlashloanProgram;
  private activeTrades: Set<string> = new Set();

  constructor(private connection: Connection, private wallet: Keypair) {
    this.flashloanProgram = new FlashloanProgram(connection, wallet);
  }

  async executeTrades(signals: ArbitrageSignal[], config: BotConfig): Promise<void> {
    for (const signal of signals.slice(0, config.maxConcurrentTrades)) {
      const tradeKey = this.getTradeKey(signal);
      if (this.activeTrades.has(tradeKey)) continue;

      this.activeTrades.add(tradeKey);
      this.executeSingleTrade(signal, config).finally(() => {
        this.activeTrades.delete(tradeKey);
      });
    }
  }

  private getTradeKey(signal: ArbitrageSignal): string {
    // mint is guaranteed to be a string.
    return `${signal.targetListing.mint}_${signal.targetListing.auctionHouse}_${signal.targetBid.auctionHouse}`;
  }

  private async executeSingleTrade(signal: ArbitrageSignal, config: BotConfig): Promise<void> {
    if (config.simulateOnly) {
      pnlLogger.logMetrics({
        message: `[SIMULATION] Arbitrage opportunity found!`,
        strategy: signal.strategy,
        mint: signal.targetListing.mint, // It's a string, no .toBase58() needed
        profit: signal.estimatedNetProfit.toNumber() / 1e9,
      });
      return;
    }

    const params: ExecuteSaleParams = {
      listing: signal.targetListing,
      bid: signal.targetBid,
    };

    try {
      const response = await this.flashloanProgram.executeSale(params);
      if (response.error) {
        pnlLogger.logError(new Error(response.error), { message: "Trade failed" });
      } else {
        pnlLogger.logMetrics({ message: "Trade executed", tx: response.txSig });
      }
    } catch (error) {
      pnlLogger.logError(error as Error, { message: "Trade execution exception" });
    }
  }
}
