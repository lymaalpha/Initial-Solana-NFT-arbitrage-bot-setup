import { ArbitrageSignal, TradeLog } from './types';

class PnLLogger {
  logMetrics(data: any) {
    console.log('[METRICS]', JSON.stringify(data, null, 2));
  }

  logError(err: Error, context?: any) {
    console.error('[ERROR]', err.message, context || '');
  }

  logPnL(signal: ArbitrageSignal, txSig?: string, type: 'executed' | 'failed' = 'executed') {
    console.log(`[PnL] ${type.toUpperCase()}:`, {
      mint: signal.targetListing.mint,
      profit: signal.estimatedNetProfit.toNumber() / 1e9,
      txSig,
    });
  }

  close() {
    console.log('[PnL] Logger closed');
  }
}

export const pnlLogger = new PnLLogger();
export default pnlLogger;
