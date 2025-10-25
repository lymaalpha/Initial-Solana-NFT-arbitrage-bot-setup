import { createObjectCsvWriter } from 'csv-writer';
import axios from 'axios';
import { ArbitrageSignal, TradeLog, MetricsLog } from './types';
import { config } from './config';
import fs from 'fs';
import path from 'path';

// ✅ Better file path handling for different environments
const getCsvPath = () => {
  if (process.env.NODE_ENV === 'production') {
    return '/home/user/arb_pnl.csv'; // GCP VM path
  }
  return path.join(process.cwd(), 'arb_pnl.csv'); // Local development
};

// ✅ Ensure directory exists
const ensureDirectoryExists = (filePath: string) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// ✅ Initialize CSV writer with error handling
const initializeCsvWriter = () => {
  try {
    const csvPath = getCsvPath();
    ensureDirectoryExists(csvPath);
    
    return createObjectCsvWriter({
      path: csvPath,
      header: [
        { id: 'timestamp', title: 'Timestamp' },
        { id: 'mint', title: 'Mint' },
        { id: 'strategy', title: 'Strategy' },
        { id: 'buyMarketplace', title: 'Buy Marketplace' },
        { id: 'sellMarketplace', title: 'Sell Marketplace' },
        { id: 'buyPrice', title: 'Buy Price (SOL)' },
        { id: 'sellPrice', title: 'Sell Price (SOL)' },
        { id: 'grossProfit', title: 'Gross Profit (SOL)' },
        { id: 'netProfit', title: 'Net Profit (SOL)' },
        { id: 'fees', title: 'Fees (SOL)' },
        { id: 'txSig', title: 'Transaction Signature' },
        { id: 'status', title: 'Status' },
        { id: 'executionTime', title: 'Execution Time (ms)' },
      ],
      append: true,
    });
  } catch (error) {
    console.error('❌ Failed to initialize CSV writer:', error);
    return null;
  }
};

class PnLLogger {
  private csvWriter: any = null;
  private logQueue: any[] = [];
  private isProcessing = false;

  constructor() {
    if (config.enableCsvLogging) {
      this.csvWriter = initializeCsvWriter();
    }
  }

  logMetrics(metrics: MetricsLog) {
    const { message, ...data } = metrics;
    const timestamp = new Date().toISOString();
    
    console.log(`[METRICS][${timestamp}] ${message}`, JSON.stringify(data, null, 2));
    
    // Optional: Send metrics to monitoring service
    if (config.enableMetricsReporting) {
      this.sendToMonitoringService({ message, ...data, timestamp });
    }
  }

  logError(err: Error, context?: any) {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR][${timestamp}] ${err.message}`, {
      stack: err.stack,
      ...context
    });
  }

  async logTrade(tradeLog: TradeLog) {
    const logData = {
      timestamp: new Date(tradeLog.timestamp).toISOString(),
      mint: tradeLog.signal?.targetListing?.mint?.slice(0, 8) + '...' || 'unknown',
      strategy: tradeLog.signal?.strategy || 'unknown',
      buyMarketplace: tradeLog.signal?.marketplaceIn || 'unknown',
      sellMarketplace: tradeLog.signal?.marketplaceOut || 'unknown',
      buyPrice: tradeLog.buyPrice ? tradeLog.buyPrice.toNumber() / 1e9 : 0,
      sellPrice: tradeLog.sellPrice ? tradeLog.sellPrice.toNumber() / 1e9 : 0,
      grossProfit: tradeLog.signal?.estimatedGrossProfit ? tradeLog.signal.estimatedGrossProfit.toNumber() / 1e9 : 0,
      netProfit: tradeLog.profitSOL || 0,
      fees: tradeLog.signal?.estimatedGrossProfit && tradeLog.profitSOL ? 
        (tradeLog.signal.estimatedGrossProfit.toNumber() / 1e9) - tradeLog.profitSOL : 0,
      txSig: tradeLog.txHash || 'none',
      status: tradeLog.success ? 'success' : 'failed',
      executionTime: tradeLog.executionTime || 0,
    };

    console.log(`[TRADE] ${logData.status.toUpperCase()}:`, logData);

    // Add to queue for async processing
    this.logQueue.push(logData);
    await this.processQueue();
  }

  async logPnL(signal: ArbitrageSignal, txSig?: string, type: 'executed' | 'failed' = 'executed') {
    const logData = {
      timestamp: new Date().toISOString(),
      mint: signal.targetListing.mint?.slice(0, 8) + '...' || 'none',
      strategy: signal.strategy || 'unknown',
      buyMarketplace: signal.marketplaceIn || 'unknown',
      sellMarketplace: signal.marketplaceOut || 'unknown',
      buyPrice: signal.targetListing.price.toNumber() / 1e9,
      sellPrice: 'price' in signal.targetBid ? signal.targetBid.price.toNumber() / 1e9 : 0,
      grossProfit: signal.estimatedGrossProfit ? signal.estimatedGrossProfit.toNumber() / 1e9 : 0,
      netProfit: signal.estimatedNetProfit ? signal.estimatedNetProfit.toNumber() / 1e9 : 0,
      fees: signal.estimatedGrossProfit && signal.estimatedNetProfit ? 
        (signal.estimatedGrossProfit.toNumber() - signal.estimatedNetProfit.toNumber()) / 1e9 : 0,
      txSig: txSig || 'none',
      status: type,
      executionTime: 0,
    };

    console.log(`[PnL] ${type.toUpperCase()}:`, logData);

    // Add to queue for async processing
    this.logQueue.push(logData);
    await this.processQueue();
  }

  private async processQueue() {
    if (this.isProcessing || this.logQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const batch = this.logQueue.splice(0, this.logQueue.length);
      
      // Write to CSV if enabled
      if (this.csvWriter && config.enableCsvLogging) {
        try {
          await this.csvWriter.writeRecords(batch);
          console.log(`✅ Written ${batch.length} records to CSV`);
        } catch (err) {
          console.error('❌ CSV write failed:', (err as Error).message);
        }
      }

      // Send to Google Sheets if configured
      if (process.env.GOOGLE_SHEETS_URL && config.enableSheetsLogging) {
        await this.sendToGoogleSheets(batch);
      }

    } catch (error) {
      console.error('❌ Queue processing failed:', error);
    } finally {
      this.isProcessing = false;
      
      // Process any new items that arrived while we were processing
      if (this.logQueue.length > 0) {
        setImmediate(() => this.processQueue());
      }
    }
  }

  private async sendToGoogleSheets(batch: any[]) {
    try {
      for (const record of batch) {
        await axios.post(process.env.GOOGLE_SHEETS_URL!, record, {
          timeout: 5000,
        });
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      console.log(`✅ Sent ${batch.length} records to Google Sheets`);
    } catch (err) {
      console.error('❌ Google Sheets write failed:', (err as Error).message);
    }
  }

  private async sendToMonitoringService(metrics: any) {
    // Optional: Integrate with DataDog, Prometheus, etc.
    try {
      // Example: Send to monitoring endpoint
      if (process.env.METRICS_ENDPOINT) {
        await axios.post(process.env.METRICS_ENDPOINT, metrics, {
          timeout: 3000,
        });
      }
    } catch (error) {
      // Silent fail - monitoring shouldn't break the main application
    }
  }

  async flush() {
    console.log('🔄 Flushing log queue...');
    while (this.logQueue.length > 0) {
      await this.processQueue();
    }
  }

  close() {
    console.log('[PnL] Logger closed');
    this.flush().catch(console.error);
  }
}

// ✅ Singleton instance
export const pnlLogger = new PnLLogger();

// ✅ Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('🛑 Shutdown signal received, flushing logs...');
  await pnlLogger.flush();
  pnlLogger.close();
  process.exit(0);
});

process.on('beforeExit', async () => {
  await pnlLogger.flush();
});

export default pnlLogger;
