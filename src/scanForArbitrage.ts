// scanForArbitrage.ts
import { NFTListing, NFTBid, ArbitrageSignal } from "./types";
import BN from "bn.js";
import { pnlLogger } from "./pnlLogger";
import { config } from "./config";

interface ScanOptions {
  minProfit?: BN;
  feeAdjustment?: BN;
  maxAge?: number;
}

const DEFAULT_MAX_AGE = 5 * 60 * 1000; // 5 minutes

export async function scanForArbitrage(
  listings: NFTListing[],
  bids: NFTBid[],
  options: ScanOptions = {}
): Promise<ArbitrageSignal[]> {
  const {
    minProfit = config.minProfitLamports,
    feeAdjustment = config.feeBufferLamports,
    maxAge = DEFAULT_MAX_AGE,
  } = options;

  const signals: ArbitrageSignal[] = [];
  const now = Date.now();

  try {
    const freshListings = listings.filter(
      (l) => !l.timestamp || now - l.timestamp < maxAge
    );
    const freshBids = bids.filter(
      (b) => (!b.timestamp || now - b.timestamp < maxAge) && (!b.expiresAt || b.expiresAt > now)
    );

    const validListings = freshListings.filter((l) => l.currency === "SOL");
    const validBids = freshBids.filter((b) => b.currency === "SOL");

    const bidsByMint = validBids.reduce((map, bid) => {
      if (!map[bid.mint]) map[bid.mint] = [];
      map[bid.mint].push(bid);
      return map;
    }, {} as Record<string, NFTBid[]>);

    pnlLogger.logMetrics({
      totalListings: listings.length,
      validListings: validListings.length,
      totalBids: bids.length,
      validBids: validBids.length,
      scanTimestamp: now,
    });

    for (const listing of validListings) {
      const relevantBids = bidsByMint[listing.mint] || [];
      const crossMarketBids = relevantBids.filter((bid) => bid.auctionHouse !== listing.auctionHouse);

      for (const bid of crossMarketBids) {
        const rawProfit = bid.price.sub(listing.price);
        if (rawProfit.lte(new BN(0))) continue;

        const netProfit = rawProfit.sub(feeAdjustment);
        if (netProfit.lt(minProfit)) continue;

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

    signals.sort((a, b) => {
      const profitDiff = b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber();
      if (profitDiff !== 0) return profitDiff;
      return (b.confidence || 0) - (a.confidence || 0);
    });

    if (signals.length > 0) {
      const avgProfit = signals
        .reduce((sum, s) => sum.add(s.estimatedNetProfit), new BN(0))
        .div(new BN(signals.length));
      pnlLogger.logMetrics({
        signalsFound: signals.length,
        topSignalProfit: signals[0].estimatedNetProfit.toNumber() / 1e9,
        averageProfit: avgProfit.toNumber() / 1e9,
        scanDuration: Date.now() - now,
      });
    }

    return signals;
  } catch (error) {
    await pnlLogger.logError(error as Error, { listingsCount: listings.length, bidsCount: bids.length });
    return [];
  }
}

function calculateConfidence(listing: NFTListing, bid: NFTBid, rawProfit: BN): number {
  let confidence = 0.5;

  const profitSOL = rawProfit.toNumber() / 1e9;
  if (profitSOL > 0.1) confidence += 0.2;
  if (profitSOL > 0.5) confidence += 0.2;

  const now = Date.now();
  if (listing.timestamp && now - listing.timestamp < 60_000) confidence += 0.1;
  if (bid.timestamp && now - bid.timestamp < 60_000) confidence += 0.1;

  const reputable = ["MagicEden", "Tensor", "OpenSea"];
  if (reputable.includes(listing.auctionHouse)) confidence += 0.05;
  if (reputable.includes(bid.auctionHouse)) confidence += 0.05;

  const listingSOL = listing.price.toNumber() / 1e9;
  if (listingSOL > 100) confidence -= 0.1;

  return Math.min(Math.max(confidence, 0), 1);
}

export { ScanOptions };
