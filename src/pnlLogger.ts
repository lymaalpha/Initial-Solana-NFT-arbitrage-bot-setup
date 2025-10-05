// pnlLogger.ts
export class PnLLogger {
  logPnL(signal: any, txSig?: string, status?: string) {
    console.log(`[PnL] ${status || 'unknown'} | Mint: ${signal?.targetListing?.mint} | Tx: ${txSig || '-'}`);
  }

  logMetrics(metrics: any) {
    console.log('[Metrics]', metrics);
  }

  logError(err: any, context?: any) {
    console.error('[Error]', err, context || {});
  }

  close() {
    console.log('[Logger] Closing logs');
  }
}

// Singleton instance
export const pnlLogger = new PnLLogger();
export default pnlLogger;
