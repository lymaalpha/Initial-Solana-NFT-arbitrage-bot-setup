import { NFTListing, NFTBid, ArbitrageSignal } from './types';
import BN from 'bn.js';
import { pnlLogger } from './pnlLogger';
import { config } from './config';

interface ScanOptions {
  minProfit?: BN;
  feeAdjustment?: BN;
  maxAge?: number;
}

const DEFAULT_MAX_AGE = 5 * 60 * 1000;

export async function scanForArbitrage(
  listings: NFTListing[],
  bids: NFTBid[],
  options: ScanOptions = {}
): Promise<ArbitrageSignal[]> {
  const { minProfit = config.minProfitLamports, feeAdjustment = config.feeBufferLamports, maxAge = DEFAULT_MAX_AGE } = options;
  const signals: ArbitrageSignal[] = [];
  const now = Date.now();

  const freshListings = listings.filter(l => !l.timestamp || now - l.timestamp < maxAge);
  const freshBids = bids.filter(b => !b.timestamp || now - b.timestamp < maxAge);

  const bidsByMint = freshBids.reduce((map, bid) => {
    if (!map[bid.mint]) map[bid.mint] = [];
    map[bid.mint].push(bid);
    return map;
  }, {} as Record<string, NFTBid[]>);

  for (const listing of freshListings) {
    const relevantBids = bidsByMint[listing.mint] || [];
    const crossMarketBids = relevantBids.filter(b => b.auctionHouse !== listing.auctionHouse);

    for (const bid of crossMarketBids) {
      const rawProfit = bid.price.sub(listing.price);
      if (rawProfit.gt(new BN(0))) {
        const netProfit = rawProfit.sub(feeAdjustment);
        if (netProfit.gte(minProfit)) {
          const confidence = calculateConfidence(listing, bid, rawProfit);
          signals.push({
            targetListing: listing,
            targetBid: bid,
            estimatedNetProfit: netProfit,
            rawProfit,
            confidence,
            timestamp: now,
          });
        }
      }
    }
  }

  signals.sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber());
  return signals;
}

function calculateConfidence(listing: NFTListing, bid: NFTBid, rawProfit: BN): number {
  let confidence = 0.5;
  const profitSOL = rawProfit.toNumber() / 1e9;
  if (profitSOL > 0.1) confidence += 0.2;
  if (profitSOL > 0.5) confidence += 0.2;
  const now = Date.now();
  if (listing.timestamp && now - listing.timestamp < 60000) confidence += 0.1;
  if (bid.timestamp && now - bid.timestamp < 60000) confidence += 0.1;
  return Math.min(Math.max(confidence, 0), 1);
}
