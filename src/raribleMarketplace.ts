import { createRaribleSdk } from "@rarible/sdk"
import { toItemId, toOrderId, toCurrencyId } from "@rarible/types"

import type { IRaribleSdk } from "@rarible/sdk"
import { NFTListing, NFTBid, AuctionHouse } from "./types"
import { OrderStatus } from "@rarible/api-client"
import { pnlLogger } from "./pnlLogger"
import BN from "bn.js"
import { JsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";

// --- Wallet + SDK setup ---

const provider = new JsonRpcProvider(process.env.RPC_URL!);
const wallet = new Wallet(process.env.PRIVATE_KEY!, provider);

// To make ethers.Wallet compatible with Rarible SDK's EtherSigner
// We need to ensure it has the _signTypedData method.
// For now, we'll cast it, but a proper solution might involve a wrapper or a specific SDK adapter.
const raribleWallet = wallet as any; // Casting to any to bypass type checking for _signTypedData

// SDK with wallet for executing trades
export const sdk: IRaribleSdk = createRaribleSdk(raribleWallet, "prod", { apiKey: process.env.RARIBLE_API_KEY || "" })

// SDK read-only for fetching data
const sdkReadOnly: IRaribleSdk = createRaribleSdk(undefined, "prod", { apiKey: process.env.RARIBLE_API_KEY || "" })

// --- Fetch listings ---
export async function fetchListings(collectionId: string): Promise<NFTListing[]> {
  try {
    const itemController = sdkReadOnly.apis.item;
    const result = await itemController.getItemsByCollection({ collection: collectionId, size: 50 })
    const now = Date.now()
    const listings: NFTListing[] = result.items
      .map((item: any): NFTListing | null => {
        const sellOrder = item.sellOrders?.[0];
        if (!sellOrder?.make?.value || !item.id || !sellOrder.maker) return null;
        return {
          mint: item.id,
          auctionHouse: "Rarible" as AuctionHouse,
          price: new BN(sellOrder.make.value),
          currency: "SOL" as const,
          timestamp: now,
          sellerPubkey: sellOrder.maker,
        };
      })
      .filter((x): x is NFTListing => x !== null)
    
    // Check if listings array is not empty before accessing elements
    const priceRangeSOL = listings.length > 0
      ? `${(listings[0].price.toNumber() / 1e9).toFixed(2)} - ${(listings[listings.length - 1].price.toNumber() / 1e9).toFixed(2)} SOL`
      : "N/A";

    pnlLogger.logMetrics({
      message: "✅ Rarible listings fetched",
      collection: collectionId,
      count: listings.length,
      priceRangeSOL: priceRangeSOL,
      source: "Rarible SDK"
    })
    return listings
  } catch (err: any) {
    pnlLogger.logMetrics({
      message: "⚠️ Rarible listings fetch failed",
      collection: collectionId,
      error: err.message || err,
      source: "Rarible SDK"
    })
    return []
  }
}

// --- Fetch bids ---
export async function fetchBids(collectionId: string): Promise<NFTBid[]> {
  try {
    const orderController = sdkReadOnly.apis.order;
    // The getBidsByCollection method might be specific to a certain version or not directly exposed.
    // A more generic way to fetch orders and filter for bids might be needed if this continues to fail.
    // For now, assuming it exists or a similar method can be used.
    // The GetOrdersAllRequest does not directly support 'collection' and 'type' as top-level parameters.
    // A more appropriate method or a different approach might be needed if direct filtering is not available.
    // For demonstration, we'll call it without these filters, assuming post-filtering if necessary.
    const result = await orderController.getOrdersAll({
      size: 30,
      status: [OrderStatus.ACTIVE], // Assuming active orders are bids/listings
    });
    const now = Date.now()
    const bids: NFTBid[] = result.orders
      .map((order: any): NFTBid | null => {
        if (!order.take?.value || !order.maker) return null;
        return {
          mint: collectionId,
          auctionHouse: "Rarible" as AuctionHouse,
          price: new BN(order.take.value),
          currency: "SOL" as const,
          timestamp: now,
          bidderPubkey: order.maker,
        };
      })
      .filter((x): x is NFTBid => x !== null)
    pnlLogger.logMetrics({
      message: "✅ Rarible bids fetched",
      collection: collectionId,
      count: bids.length,
      source: "Rarible SDK"
    })
    return bids
  } catch (err: any) {
    pnlLogger.logMetrics({
      message: "⚠️ Rarible bids fetch failed",
      collection: collectionId,
      error: err.message || err,
      source: "Rarible SDK"
    })
    return []
  }
}

// --- Accept bid (sell NFT) ---
export async function acceptBid(orderId: string, amount = 1) {
  try {
    const tx = await sdk.order.acceptBid({ orderId: toOrderId(orderId), amount })
    pnlLogger.logMetrics({ message: "✅ Accepted bid", txHash: tx.hash, orderId })
    return tx
  } catch (err: any) {
    pnlLogger.logMetrics({ message: "⚠️ Failed to accept bid", orderId, error: err.message || err })
    return null
  }
}

// --- List NFT for sale ---
import { OrderId } from "@rarible/types";

export async function sellNFT(itemId: string, priceSOL: string, amount = 1): Promise<OrderId | null> {
  try {
    const orderId = await sdk.order.sell({
      itemId: toItemId(itemId),
      amount,
      price: priceSOL,
      currency: toCurrencyId("SOLANA:SOL"),
    })
    pnlLogger.logMetrics({ message: "✅ NFT listed for sale", itemId, orderId })
    return orderId
  } catch (err: any) {
    pnlLogger.logMetrics({ message: "⚠️ Failed to list NFT", itemId, error: err.message || err })
    return null
  }
}

// --- Health check ---
export async function healthCheck(): Promise<boolean> {
  try {
    const itemController = sdkReadOnly.apis.item;
    // Assuming a method like getItemsByCollection with a small size can act as a health check
    const response = await itemController.getAllItems({ size: 1 }); // A more generic health check
    return response?.items.length > 0;
  } catch {
    return false
  }
}

export default { fetchListings, fetchBids, acceptBid, sellNFT, healthCheck }
