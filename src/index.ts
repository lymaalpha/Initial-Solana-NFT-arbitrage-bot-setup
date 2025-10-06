import { scanForArbitrage } from './scanForArbitrage';
import { config } from './config';
import { ArbitrageSignal } from './types';
import { fetchListings, fetchBids } from './heliusMarketplace';

export async function startOpportunityScanner(opportunities: string[], marketplaces: string[]): Promise<ArbitrageSignal[]> {
  let signals: ArbitrageSignal[] = [];
  for (const collectionMint of opportunities) {
    for (const marketplace of marketplaces) {
      const listings = await fetchListings(collectionMint);
      const bids = await fetchBids(collectionMint);
      const cycleSignals = await scanForArbitrage(listings, bids);  // Fixed: 2 args
      signals = signals.concat(cycleSignals);
    }
  }
  return signals;
}
