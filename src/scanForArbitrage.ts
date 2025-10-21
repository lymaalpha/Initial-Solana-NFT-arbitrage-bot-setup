// src/scanForArbitrage.ts - ✅ FIXED: Complete arbitrage detection
import { NFTListing, NFTBid, ArbitrageSignal } from './types';
import BN from 'bn.js';
import { pnlLogger } from './pnlLogger';

// ✅ Inline config (remove config.ts dependency)
const CONFIG = {
  minProfitLamports: new BN(50000000), // 0.05 SOL minimum
  feeBufferLamports: new BN(25000000), // 0.025 SOL fees
} as const;

export async function scanForArbitrage(
  listings: NFTListing[],
  bids: NFTBid[]
): Promise<ArbitrageSignal[]> {
  const signals: ArbitrageSignal[] = [];
  const now = Date.now();

  // Filter for SOL only
  const validListings = listings.filter(l => l.currency === 'SOL');
  const validBids = bids.filter(b => b.currency === 'SOL');

  if (validListings.length === 0 || validBids.length === 0) {
    pnlLogger.logMetrics({ 
      message: '⚠️ No valid SOL listings/bids', 
      listings: validListings.length, 
      bids: validBids.length 
    });
    return [];
  }

  // **IMPROVEMENT 1: Map bids by mint for O(1) lookup**
  const bidsByMint = validBids.reduce((map, bid) => {
    if (!map[bid.mint]) map[bid.mint] = [];
    map[bid.mint].push(bid);
    return map;
  }, {} as Record<string, NFTBid[]>);

  // **IMPROVEMENT 2: Cross-marketplace arbitrage**
  for (const listing of validListings) {
    const relevantBids = bidsByMint[listing.mint] || [];
    
    for (const bid of relevantBids) {
      // **FIX 1: Skip same auction house**
      if (bid.auctionHouse === listing.auctionHouse) continue;

      const rawProfit = bid.price.sub(listing.price);
      
      // **FIX 2: Skip unprofitable trades**
      if (rawProfit.lte(new BN(0))) continue;

      // **FIX 3: Apply fees and minimum profit**
      const netProfit = rawProfit.sub(CONFIG.feeBufferLamports);
      if (netProfit.lt(CONFIG.minProfitLamports)) continue;

      // **IMPROVEMENT 3: Confidence scoring**
      const priceDiffPercent = rawProfit.muln(100).div(listing.price).toNumber() / 100;
      const confidence = Math.min(1.0, 0.5 + priceDiffPercent * 10); // 50% base + profit bonus

      signals.push({
        targetListing: listing,
        targetBid: bid,
        rawProfit,                           // ✅ Now valid
        estimatedNetProfit: netProfit,
        confidence,                          // ✅ Now valid
        timestamp: now,                      // ✅ Now valid
        strategy: `${listing.auctionHouse}→${bid.auctionHouse}`,
        marketplaceIn: listing.auctionHouse,
        marketplaceOut: bid.auctionHouse,
        estimatedGrossProfit: rawProfit
      });

      // **DEBUG LOGGING**
      const profitSOL = netProfit.toNumber() / 1e9;
      console.log(`🎯 Arbitrage found: ${listing.mint.slice(-4)} ` +
        `${(listing.price.toNumber()/1e9).toFixed(4)}→${(bid.price.toNumber()/1e9).toFixed(4)} ` +
        `SOL = ${profitSOL.toFixed(4)} SOL profit (${confidence.toFixed(1)} confidence)`);
    }
  }

  // **IMPROVEMENT 4: Sort by net profit DESC**
  const sortedSignals = signals.sort((a, b) => 
    b.estimatedNetProfit.sub(a.estimatedNetProfit).toNumber()
  );

  // **IMPROVEMENT 5: Detailed logging**
  if (sortedSignals.length > 0) {
    const topSignal = sortedSignals[0];
    pnlLogger.logMetrics({ 
      message: `🎯 ${sortedSignals.length} arbitrage signals found`,
      topProfitSOL: (topSignal.estimatedNetProfit.toNumber() / 1e9).toFixed(4),
      topConfidence: topSignal.confidence?.toFixed(2) || 'N/A',
      totalListings: validListings.length,
      totalBids: validBids.length
    });

    // Log top 3 signals
    sortedSignals.slice(0, 3).forEach((signal, i) => {
      pnlLogger.logMetrics({
        message: `Top ${i+1}: ${signal.strategy}`,
        mint: signal.targetListing.mint,
        buyPriceSOL: (signal.targetListing.price.toNumber() / 1e9).toFixed(4),
        sellPriceSOL: (signal.targetBid.price.toNumber() / 1e9).toFixed(4),
        profitSOL: (signal.estimatedNetProfit.toNumber() / 1e9).toFixed(4),
        confidence: signal.confidence?.toFixed(2)
      });
    });
  } else {
    pnlLogger.logMetrics({ 
      message: '⚡ No profitable arbitrage opportunities',
      minProfitSOL: (CONFIG.minProfitLamports.toNumber() / 1e9).toFixed(4)
    });
  }

  return sortedSignals;
}
