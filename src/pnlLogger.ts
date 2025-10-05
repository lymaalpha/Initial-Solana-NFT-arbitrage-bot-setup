import { createObjectCsvWriter } from 'csv-writer';
import winston from 'winston';
import fs from 'fs';
import path from 'path';
import BN from 'bn.js';
import { ArbitrageSignal } from './types';

// Stub TradeLog if not in types.ts
export interface TradeLog {
  timestamp: number;
  mint: string;
  buyPrice: BN;
  sellPrice: BN;
  netProfit: BN;
  currency: string;
  txSig?: string;
  type: 'signal' | 'executed' | 'failed';
  executorType?: string;
  notes?: string;
}

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
  private tradeCount = 0;

  constructor(options: PnLLoggerOptions = {}) {
    const { 
      logLevel = 'info', 
      outputFile = 'logs/arb_pnl.csv', 
      enableJson = true,
      enableCsv = true 
    } = options;
    
    this.logFile = outputFile;

    // Ensure log dir exists
    const logDir = path.dirname(outputFile);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

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
        ...(enableJson ? [new winston.transports.File({ filename: 'logs/bot.log' })] : [])
      ],
    });

    // CSV writer setup
    if (enableCsv) this.initCsvWriter();
  }

  private initCsvWriter() {
    try {
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
    } catch (err: any) {
      this.logger.error('CSV init failed', { error: err?.message || err });
    }
  }

  async logSignal(signal: ArbitrageSignal, notes?: string) {
    const logData = {
      timestamp: Date.now(),
      mint: signal.targetListing.mint,
      buyPrice: signal.targetListing.price.toNumber() / 1e9,
      sellPrice: signal.targetBid.price.toNumber() / 1e9,
      netProfit: signal.estimatedNetProfit?.toNumber() / 1e9 || 0,
      currency: signal.targetListing.currency,
      type: 'signal' as const,
      executorType: 'pending',
      notes: notes || `Confidence: ${signal.confidence || 'N/A'}`
    };

    this.logger.info('Arbitrage Signal Detected', logData);

    if (this.csvWriter) {
      await this.csvWriter.writeRecords([logData])
        .catch((err: Error) => this.logger.error('CSV write failed', { error: err.message }));
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
      await this.csvWriter.writeRecords([logData])
        .catch((err: Error) => this.logger.error('CSV write failed', { error: err.message }));
    }

    // Log milestone achievements
    if (trade.type === 'executed' && this.tradeCount % 10 === 0) this.logMilestone();
  }

  private logMilestone() {
    const avgProfit = this.tradeCount > 0 ? this.totalProfit.div(new BN(this.tradeCount)) : new BN(0);
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

  close() {
    this.logger.info('Logger shutting down');
  }

  logPnL(signal: ArbitrageSignal, txSig?: string, type: 'signal' | 'executed' | 'failed' = 'signal') {
    if (type === 'signal') {
      this.logSignal(signal).catch((err: Error) =>
        this.logger.error('Signal logging failed', { error: err.message })
      );
    } else {
      const trade: TradeLog = {
        timestamp: Date.now(),
        mint: signal.targetListing.mint,
        buyPrice: signal.targetListing.price,
        sellPrice: signal.targetBid.price,
        netProfit: signal.estimatedNetProfit || new BN(0),
        currency: signal.targetListing.currency,
        txSig,
        type,
        executorType: 'flash_loan',
        notes: `Raw profit: ${signal.rawProfit?.toNumber() / 1e9 || 0} SOL`
      };
      this.logTrade(trade).catch((err: Error) =>
        this.logger.error('Trade logging failed', { error: err.message })
      );
    }
  }
}

// Singleton export
export const pnlLogger = new PnLLogger({
  enableCsv: process.env.ENABLE_CSV_LOGGING === 'true',
  enableJson: process.env.ENABLE_JSON_LOGGING !== 'false'
});

// Graceful shutdown
process.on('SIGINT', () => {
  pnlLogger.close();
  process.exit(0);
});
