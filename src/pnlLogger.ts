import { createObjectCsvWriter } from 'csv-writer';
import axios from 'axios';
import { ArbitrageSignal, TradeLog } from './types';
import { config } from './config';

const csvWriter = createObjectCsvWriter({
  path: '/home/user/arb_pnl.csv',  // Persistent on GCP VM
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

  async logPnL(signal: ArbitrageSignal, txSig?: string, type: 'executed' | 'failed' = 'executed') {
    const logData = {
      timestamp: new Date().toISOString(),
      mint: signal.targetListing.mint || 'none',
      profit: signal.estimatedNetProfit ? signal.estimatedNetProfit.toNumber() / 1e9 : 0,
      txSig: txSig || 'none',
      type,
    };
    console.log(`[PnL] ${type.toUpperCase()}:`, logData);

    if (config.enableCsvLogging) {
      try {
        await csvWriter.writeRecords([logData]);
      } catch (err) {
        console.error('[ERROR] CSV write failed:', (err as Error).message);
      }
      if (process.env.GOOGLE_SHEETS_URL) {
        try {
          await axios.post(process.env.GOOGLE_SHEETS_URL, logData);
        } catch (err) {
          console.error('[ERROR] Sheets write failed:', (err as Error).message);
        }
      }
    }
  }

  close() {
    console.log('[PnL] Logger closed');
  }
}

export const pnlLogger = new PnLLogger();
export default pnlLogger;
