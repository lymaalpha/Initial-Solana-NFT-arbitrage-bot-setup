import { NFTListing, NFTBid, ArbitrageSignal } from "./types";
import BN from 'bn.js';
import { pnlLogger } from "./pnlLogger";  // Fixed: Flat src/ path
import { config } from "./config";  // Tie to global config for defaults

interface ScanOptions {
  minProfit?: BN;
  feeAdjustment?: BN;
  maxAge?: number; // Maximum age of listings/bids in milliseconds
}

const DEFAULT_MAX_AGE = 5 * 60 * 1000; // 5 minutes

export async function scanForArbitrage(
  listings: NFTListing[], 
  bids: NFTBid[], 
  options: ScanOptions = {}
): Promise<ArbitrageSignal[]> {
  const { 
    minProfit = config.minProfitLamports,  // From config
    feeAdjustment = config.feeBufferLamports,
    maxAge = DEFAULT_MAX_AGE
  } = options;

  const signals: ArbitrageSignal[] = [];
  const now = Date.now();

  try {
    // Filter out stale data
    const freshListings = listings.filter(listing => 
      !listing.timestamp || (now - listing.timestamp) < maxAge
    );
    
    const freshBids = bids.filter(bid => 
      !bid.timestamp || (now - bid.timestamp) < maxAge &&
      (!bid.expiresAt || bid.expiresAt > now)
    );

    // Validate currencies match (only process SOL for now)
    const validBids = freshBids.filter(bid => bid.currency === 'SOL');
    const validListings = freshListings.filter(listing => listing.currency === 'SOL');

    // Group bids by mint for efficient lookup
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
      scanTimestamp: now
    });

    // Scan for arbitrage opportunities
    for (const listing of validListings) {
      const relevantBids = bidsByMint[listing.mint] || [];
      
      // Only consider cross-market arbitrage (different auction houses)
      const crossMarketBids = relevantBids.filter(bid => 
        bid.auctionHouse !== listing.auctionHouse
      );

      for (const bid of crossMarketBids) {
        const rawProfit = bid.price.sub(listing.price);
        
        if (rawProfit.gt(new BN(0))) {
          const netProfit = rawProfit.sub(feeAdjustment);
          
          if (netProfit.gte(minProfit)) {
            // Calculate confidence score based on various factors
            const confidence = calculateConfidence(listing, bid, rawProfit);
            
            const signal: ArbitrageSignal = {
              targetListing: listing,
              targetBid: bid,
              estimatedNetProfit: netProfit,
              rawProfit,
              confidence,
              timestamp: now
            };

            signals.push(signal);
          }
        }
      }
    }

    // Sort by net profit descending, then by confidence
    signals.sort((a, b) => {
      const profitDiff = b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber();
      if (profitDiff !== 0) return profitDiff;
      return (b.confidence || 0) - (a.confidence || 0);  // Optional chaining
    });

    if (signals.length > 0) {
      const avgProfit = signals.reduce((sum, s) => sum.add(s.estimatedNetProfit), new BN(0)).div(new BN(signals.length));
      pnlLogger.logMetrics({
        signalsFound: signals.length,
        topSignalProfit: signals[0].estimatedNetProfit.toNumber() / 1e9,
        averageProfit: avgProfit.toNumber() / 1e9,
        scanDuration: Date.now() - now
      });
    }

    return signals;

  } catch (error) {
    await pnlLogger.logError(error as Error, { 
      listingsCount: listings.length, 
      bidsCount: bids.length 
    });
    return [];
  }
}

function calculateConfidence(listing: NFTListing, bid: NFTBid, rawProfit: BN): number {
  let confidence = 0.5; // Base confidence

  // Higher confidence for larger profits
  const profitSOL = rawProfit.toNumber() / 1e9;
  if (profitSOL > 0.1) confidence += 0.2;
  if (profitSOL > 0.5) confidence += 0.2;

  // Higher confidence for recent data
  const now = Date.now();
  if (listing.timestamp && (now - listing.timestamp) < 60000) confidence += 0.1; // Within 1 minute
  if (bid.timestamp && (now - bid.timestamp) < 60000) confidence += 0.1;

  // Higher confidence for reputable auction houses
  const reputableHouses = ['MagicEden', 'Tensor', 'OpenSea'];
  if (reputableHouses.includes(listing.auctionHouse)) confidence += 0.05;
  if (reputableHouses.includes(bid.auctionHouse)) confidence += 0.05;

  // Lower confidence for very high prices (potential manipulation)
  const listingSOL = listing.price.toNumber() / 1e9;
  if (listingSOL > 100) confidence -= 0.1;

  return Math.min(Math.max(confidence, 0), 1); // Clamp between 0 and 1
}

export { ScanOptions };
