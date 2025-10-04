import { createObjectCsvWriter } from 'csv-writer';
import winston from 'winston';
import fs from 'fs';
import BN from 'bn.js';
import { ArbitrageSignal, TradeLog } from '../bot/types';

interface PnLLoggerOptions {
  logLevel?: 'info' | 'warn' | 'error';
  outputFile?: string;
  enableJson?: boolean;
  enableCsv?: boolean;
}

export class PnLLogger {
  private logger: winston.Logger;
  private csvWriter?: any;
  private logFile: string;
  private totalProfit: BN = new BN(0);
  private tradeCount: number = 0;

  constructor(options: PnLLoggerOptions = {}) {
    const { 
      logLevel = 'info', 
      outputFile = 'arb_pnl.csv', 
      enableJson = true,
      enableCsv = true 
    } = options;
    
    this.logFile = outputFile;

    // Winston logger setup
    this.logger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        ...(enableJson ? [new winston.transports.File({ filename: 'bot.log' })] : [])
      ],
    });

    // CSV writer setup
    if (enableCsv) {
      this.initCsvWriter();
    }
  }

  private initCsvWriter() {
    this.csvWriter = createObjectCsvWriter({
      path: this.logFile,
      header: [
        { id: 'timestamp', title: 'Timestamp' },
        { id: 'mint', title: 'NFT Mint' },
        { id: 'buyPrice', title: 'Buy Price (SOL)' },
        { id: 'sellPrice', title: 'Sell Price (SOL)' },
        { id: 'netProfit', title: 'Net Profit (SOL)' },
        { id: 'currency', title: 'Currency' },
        { id: 'txSig', title: 'Transaction Signature' },
        { id: 'type', title: 'Type' },
        { id: 'executorType', title: 'Executor Type' },
        { id: 'notes', title: 'Notes' }
      ],
      append: fs.existsSync(this.logFile)
    });
  }

  async logSignal(signal: ArbitrageSignal, notes?: string) {
    const logData = {
      timestamp: Date.now(),
      mint: signal.targetListing.mint,
      buyPrice: signal.targetListing.price.toNumber() / 1e9,
      sellPrice: signal.targetBid.price.toNumber() / 1e9,
      netProfit: signal.estimatedNetProfit.toNumber() / 1e9,
      currency: signal.targetListing.currency,
      type: 'signal',
      executorType: 'pending',
      notes: notes || `Confidence: ${signal.confidence}`
    };

    this.logger.info('Arbitrage Signal Detected', logData);
    
    if (this.csvWriter) {
      await this.csvWriter.writeRecords([logData]);
    }
  }

  async logTrade(trade: TradeLog) {
    const logData = {
      timestamp: trade.timestamp,
      mint: trade.mint,
      buyPrice: trade.buyPrice.toNumber() / 1e9,
      sellPrice: trade.sellPrice.toNumber() / 1e9,
      netProfit: trade.netProfit.toNumber() / 1e9,
      currency: trade.currency,
      txSig: trade.txSig,
      type: trade.type,
      executorType: trade.executorType,
      notes: trade.notes
    };

    // Update running totals
    if (trade.type === 'executed') {
      this.totalProfit = this.totalProfit.add(trade.netProfit);
      this.tradeCount++;
    }

    const logLevel = trade.type === 'failed' ? 'error' : 'info';
    this.logger[logLevel]('Trade Executed', logData);

    if (this.csvWriter) {
      await this.csvWriter.writeRecords([logData]);
    }

    // Log milestone achievements
    if (trade.type === 'executed' && this.tradeCount % 10 === 0) {
      this.logMilestone();
    }
  }

  private logMilestone() {
    const avgProfit = this.totalProfit.div(new BN(this.tradeCount));
    this.logger.info('Milestone Reached', {
      totalTrades: this.tradeCount,
      totalProfit: this.totalProfit.toNumber() / 1e9,
      averageProfit: avgProfit.toNumber() / 1e9,
      currency: 'SOL'
    });
  }

  async logError(error: Error, context?: any) {
    this.logger.error('Bot Error', {
      message: error.message,
      stack: error.stack,
      context
    });
  }

  async logMetrics(metrics: any) {
    this.logger.info('Bot Metrics', metrics);
  }

  getTotalProfit(): BN {
    return this.totalProfit;
  }

  getTradeCount(): number {
    return this.tradeCount;
  }

  // Legacy method for backward compatibility
  logPnL(signal: ArbitrageSignal, txSig?: string, type: 'signal' | 'executed' | 'failed' = 'signal') {
    if (type === 'signal') {
      this.logSignal(signal);
    } else {
      const trade: TradeLog = {
        timestamp: Date.now(),
        mint: signal.targetListing.mint,
        buyPrice: signal.targetListing.price,
        sellPrice: signal.targetBid.price,
        netProfit: signal.estimatedNetProfit,
        currency: signal.targetListing.currency,
        txSig,
        type,
        executorType: 'flash_loan',
        notes: `Raw profit: ${signal.rawProfit.toNumber() / 1e9} SOL`
      };
      this.logTrade(trade);
    }
  }
}

// Export singleton instance
export const pnlLogger = new PnLLogger({
  enableCsv: process.env.ENABLE_CSV_LOGGING === 'true',
  enableJson: process.env.ENABLE_JSON_LOGGING !== 'false'
});
