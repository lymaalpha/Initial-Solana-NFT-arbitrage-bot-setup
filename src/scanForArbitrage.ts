// src/scanForArbitrage.ts (YOUR LOGIC + CENTRAL CONFIG)
import { NFTListing, NFTBid, ArbitrageSignal } from './types';
import BN from 'bn.js';
import { pnlLogger } from './pnlLogger';
import { config } from './config'; // Use the main config file

export async function scanForArbitrage(
  listings: NFTListing[],
  bids: NFTBid[]
): Promise<ArbitrageSignal[]> {
  const signals: ArbitrageSignal[] = [];
  const now = Date.now();

  const bidsByMint = bids.reduce((map, bid) => {
    if (!map[bid.mint]) map[bid.mint] = [];
    map[bid.mint].push(bid);
    return map;
  }, {} as Record<string, NFTBid[]>);

  for (const listing of listings) {
    const relevantBids = bidsByMint[listing.mint] || [];
    for (const bid of relevantBids) {
      if (bid.auctionHouse === listing.auctionHouse) continue;
      const rawProfit = bid.price.sub(listing.price);
      if (rawProfit.lte(new BN(0))) continue;

      const netProfit = rawProfit.sub(config.feeBufferLamports);
      if (netProfit.lt(config.minProfitLamports)) continue;

      const confidence = Math.min(1.0, (rawProfit.toNumber() / listing.price.toNumber()) * 10);

      signals.push({
        targetListing: listing,
        targetBid: bid,
        rawProfit,
        estimatedNetProfit: netProfit,
        estimatedGrossProfit: rawProfit,
        confidence,
        timestamp: now,
        strategy: `${listing.auctionHouse}→${bid.auctionHouse}`,
        marketplaceIn: listing.auctionHouse,
        marketplaceOut: bid.auctionHouse,
      });
    }
  }
  return signals.sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber());
}
