// src/raribleMarketplace.ts
import { createRaribleSdk } from "@rarible/sdk"
import { toItemId, toOrderId, toCurrencyId } from "@rarible/types"
import { NFTListing, NFTBid } from "./types"
import { pnlLogger } from "./pnlLogger"
import BN from "bn.js"
import { ethers } from "ethers"

// --- Wallet + SDK setup ---
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL)
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)

// SDK with wallet for executing trades
export const sdk = createRaribleSdk(wallet, "prod", { apiKey: process.env.RARIBLE_API_KEY || "" })
// SDK read-only for fetching data
const sdkReadOnly = createRaribleSdk(undefined, "prod", { apiKey: process.env.RARIBLE_API_KEY || "" })

// --- Fetch listings ---
export async function fetchListings(collectionId: string): Promise<NFTListing[]> {
  try {
    const result = await sdkReadOnly.apis.item.getItemsByCollection({ collection: collectionId, size: 50 })
    const now = Date.now()

    const listings: NFTListing[] = result.items
      .map(item => {
        const sellOrder = item.sellOrders?.[0]
        if (!sellOrder?.make?.value) return null
        return {
          mint: item.id,
          auctionHouse: "Rarible",
          price: new BN(sellOrder.make.value),
          currency: "SOL",
          timestamp: now,
          sellerPubkey: sellOrder.maker || "",
        }
      })
      .filter((x): x is NFTListing => x !== null)

    pnlLogger.logMetrics({
      message: `✅ Rarible listings fetched`,
      collection: collectionId,
      count: listings.length,
      priceRangeSOL: listings.length > 0
        ? `${(listings[0].price.toNumber() / 1e9).toFixed(2)} - ${(listings[listings.length - 1].price.toNumber() / 1e9).toFixed(2)} SOL`
        : "N/A",
      source: "Rarible SDK"
    })

    return listings
  } catch (err: any) {
    pnlLogger.logMetrics({
      message: `⚠️ Rarible listings fetch failed`,
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
    const result = await sdkReadOnly.apis.order.getBidsByCollection({ collection: collectionId, size: 30 })
    const now = Date.now()

    const bids: NFTBid[] = result.orders
      .map(order => {
        if (!order.take?.value || !order.maker) return null
        return {
          mint: collectionId,
          auctionHouse: "Rarible",
          price: new BN(order.take.value),
          currency: "SOL",
          timestamp: now,
          bidderPubkey: order.maker,
        }
      })
      .filter((x): x is NFTBid => x !== null)

    pnlLogger.logMetrics({
      message: `✅ Rarible bids fetched`,
      collection: collectionId,
      count: bids.length,
      source: "Rarible SDK"
    })

    return bids
  } catch (err: any) {
    pnlLogger.logMetrics({
      message: `⚠️ Rarible bids fetch failed`,
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
    const tx = await sdk.order.acceptBid({ orderId, amount })
    pnlLogger.logMetrics({ message: `✅ Accepted bid`, txHash: tx.hash, orderId })
    return tx
  } catch (err: any) {
    pnlLogger.logMetrics({ message: `⚠️ Failed to accept bid`, orderId, error: err.message || err })
    return null
  }
}

// --- List NFT for sale ---
export async function sellNFT(itemId: string, priceSOL: string, amount = 1) {
  try {
    const orderId = await sdk.order.sell({
      itemId: toItemId(itemId),
      amount,
      price: priceSOL,
      currency: toCurrencyId("ETHEREUM:native"), // Map SOL if using Solana
    })
    pnlLogger.logMetrics({ message: `✅ NFT listed for sale`, itemId, orderId })
    return orderId
  } catch (err: any) {
    pnlLogger.logMetrics({ message: `⚠️ Failed to list NFT`, itemId, error: err.message || err })
    return null
  }
}

// --- Health check ---
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await sdkReadOnly.apis.item.getItemsCount()
    return response?.count > 0
  } catch {
    return false
  }
}

export default { fetchListings, fetchBids, acceptBid, sellNFT, healthCheck }
