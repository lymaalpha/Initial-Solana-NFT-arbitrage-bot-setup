// src/scanForArbitrage.ts (FINAL, CORRECTED)
import { NFTListing, NFTBid, ArbitrageSignal } from './types';
import BN from 'bn.js';
import { pnlLogger } from './pnlLogger';
import { config } from './config'; // Use the central config

export async function scanForArbitrage(
  listings: NFTListing[],
  bids: NFTBid[]
): Promise<ArbitrageSignal[]> {
  const signals: ArbitrageSignal[] = [];
  const now = Date.now();

  const bidsByMint = bids.reduce((map, bid) => {
    // The mint is now guaranteed to be a string, so this works.
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

      const priceDiffPercent = rawProfit.muln(10000).div(listing.price).toNumber() / 10000;
      const confidence = Math.min(1.0, 0.5 + priceDiffPercent * 10);

      signals.push({
        targetListing: listing,
        targetBid: bid,
        rawProfit, // This is now a valid property
        estimatedNetProfit: netProfit,
        estimatedGrossProfit: rawProfit, // Keep this consistent
        confidence,
        timestamp: now,
        strategy: `${listing.auctionHouse}→${bid.auctionHouse}`,
        marketplaceIn: listing.auctionHouse,
        marketplaceOut: bid.auctionHouse,
      });

      // The mint is now guaranteed to be a string, so .slice() works.
      console.log(`🎯 Arbitrage found: ${listing.mint.slice(-4)}`);
    }
  }

  return signals.sort((a, b) => b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber());
}
