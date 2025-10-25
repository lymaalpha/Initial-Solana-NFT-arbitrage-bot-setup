import { createObjectCsvWriter } from 'csv-writer';
import { ArbitrageSignal, TradeLog } from './types';
import { config } from './config';

const csvWriter = createObjectCsvWriter({
  path: './arb_pnl.csv',
  header: [
    { id: 'timestamp', title: 'Timestamp' },
    { id: 'mint', title: 'Mint' },
    { id: 'profit', title: 'Net Profit (SOL)' },
    { id: 'txSig', title: 'Tx Signature' },
    { id: 'type', title: 'Type' },
  ],
  append: true,
});

class PnLLogger {
  logMetrics(data: any) {
    console.log('[METRICS]', JSON.stringify(data, null, 2));
  }

  logError(err: Error, context?: any) {
    console.error('[ERROR]', err.message, context || '');
  }

  async logPnL(signal: ArbitrageSignal, txSig?: string, type: "simulated" | "executed" | "failed" = "executed") {
    const logData: TradeLog = {
      timestamp: new Date().toISOString(),
      mint: signal.targetListing.mint,
      profit: signal.estimatedNetProfit.toNumber() / 1e9,
      txSig: txSig || 'none',
      type: type,
    };
    
    console.log(`[PnL] ${type.toUpperCase()}:`, logData);

    if (config.enableCsvLogging) {
      try {
        await csvWriter.writeRecords([logData]);
      } catch (err) {
        console.error('[ERROR] CSV write failed:', (err as Error).message);
      }
    }
  }

  close() {
    console.log('[PnL] Logger closed');
  }
}

export const pnlLogger = new PnLLogger();
export default pnlLogger;
