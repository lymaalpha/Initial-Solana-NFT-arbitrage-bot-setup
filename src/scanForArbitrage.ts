import { NFTListing, NFTBid, ArbitrageSignal } from './types';
import BN from 'bn.js';
import { config } from './config';
import { pnlLogger } from './pnlLogger';

export async function scanForArbitrage(
  listings: NFTListing[],
  bids: NFTBid[]
): Promise<ArbitrageSignal[]> {
  const signals: ArbitrageSignal[] = [];
  const now = Date.now();

  // Filter bids and listings by currency SOL
  const validListings = listings.filter(l => l.currency === 'SOL');
  const validBids = bids.filter(b => b.currency === 'SOL');

  // Map bids by mint for faster lookup
  const bidsByMint = validBids.reduce((map, bid) => {
    if (!map[bid.mint]) map[bid.mint] = [];
    map[bid.mint].push(bid);
    return map;
  }, {} as Record<string, NFTBid[]>);

  for (const listing of validListings) {
    const relevantBids = bidsByMint[listing.mint] || [];
    for (const bid of relevantBids) {
      if (bid.auctionHouse === listing.auctionHouse) continue; // skip same AH

      const rawProfit = bid.price.sub(listing.price);
      if (rawProfit.lte(new BN(0))) continue;

      const netProfit = rawProfit.sub(config.feeBufferLamports);
      if (netProfit.lt(config.minProfitLamports)) continue;

      signals.push({
        targetListing: listing,
        targetBid: bid,
        rawProfit,
        estimatedNetProfit: netProfit,
        confidence: 0.8,
        timestamp: now,
      });
    }
  }

  pnlLogger.logMetrics({ signalsFound: signals.length });
  return signals.sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber());
}
