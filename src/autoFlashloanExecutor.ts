// src/autoFlashloanExecutor.ts (UPDATED)
import { Connection, Keypair } from "@solana/web3.js";
import BN from "bn.js";
import { ArbitrageSignal, BotConfig, ExecuteSaleParams, SaleResponse } from "./types";
import { pnlLogger } from "./pnlLogger";
import { sleep } from "./utils";

class FlashloanProgram {
  constructor(private connection: Connection, private wallet: Keypair) {}

  async executeSale(params: ExecuteSaleParams): Promise<SaleResponse> {
    pnlLogger.logMetrics({ message: `Simulating trade for mint: ${params.listing.mint}` });
    await sleep(1000);
    return { txSig: "SIMULATED_TX_SIG_" + Math.random().toString(36).substring(7) };
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
      const tradeKey = `${signal.targetListing.mint}_${signal.marketplaceIn}_${signal.marketplaceOut}`;
      if (this.activeTrades.has(tradeKey)) continue;

      this.activeTrades.add(tradeKey);
      this.executeSingleTrade(signal, config).finally(() => {
        this.activeTrades.delete(tradeKey);
      });
    }
  }

  private async executeSingleTrade(signal: ArbitrageSignal, config: BotConfig): Promise<void> {
    // ✅ UPDATED: Use config.mode instead of config.simulateOnly
    if (config.mode === 'SIMULATION') {
      pnlLogger.logMetrics({
        message: `[SIMULATION] Arbitrage opportunity found!`,
        strategy: signal.strategy,
        mint: signal.targetListing.mint,
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
        await pnlLogger.logPnL(signal, undefined, "failed");
      } else {
        await pnlLogger.logPnL(signal, response.txSig, "executed");
      }
    } catch (error) {
      pnlLogger.logError(error as Error, { message: "Trade execution exception" });
      await pnlLogger.logPnL(signal, undefined, "failed");
    }
  }
}
