// In the arbitrage detection sections, replace the signal creation:

// Strategy 1: MagicEden → Rarible
if (raribleBid && raribleBid.price.gt(meListing.price)) {
  const profit = raribleBid.price.sub(meListing.price);
  const feeEstimate = meListing.price.muln(0.025);
  const netProfit = profit.sub(feeEstimate);
  
  if (netProfit.gt(config.minProfitLamports)) {
    signals.push({
      targetListing: meListing,
      targetBid: raribleBid,
      estimatedNetProfit: netProfit,
      estimatedGrossProfit: profit,    // ✅ Now valid
      strategy: 'ME→Rarible',          // ✅ Now valid
      marketplaceIn: 'MagicEden',      // ✅ Now valid
      marketplaceOut: 'Rarible'        // ✅ Now valid
    });
  }
}

// Strategy 2: Rarible → MagicEden
if (meBid && meBid.price.gt(raribleListing.price)) {
  const profit = meBid.price.sub(raribleListing.price);
  const feeEstimate = raribleListing.price.muln(0.03);
  const netProfit = profit.sub(feeEstimate);
  
  if (netProfit.gt(config.minProfitLamports)) {
    signals.push({
      targetListing: raribleListing,
      targetBid: meBid,
      estimatedNetProfit: netProfit,
      estimatedGrossProfit: profit,    // ✅ Now valid
      strategy: 'Rarible→ME',          // ✅ Now valid
      marketplaceIn: 'Rarible',        // ✅ Now valid
      marketplaceOut: 'MagicEden'      // ✅ Now valid
    });
  }
}
