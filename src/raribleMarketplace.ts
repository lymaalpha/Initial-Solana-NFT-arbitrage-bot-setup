import { createRaribleSdk } from "@rarible/sdk"
import { toItemId, toOrderId, toCurrencyId } from "@rarible/types"
import type { IRaribleSdk } from "@rarible/sdk"
import { NFTListing, NFTBid, AuctionHouse } from "./types"
import { OrderStatus } from "@rarible/api-client"
import { pnlLogger } from "./pnlLogger"
import BN from "bn.js"
import * as bs58 from 'bs58'
import { Connection, Keypair } from '@solana/web3.js'
import { SolanaSigner } from '@rarible/sdk-solana'

// --- Wallet + SDK setup ---
try {
  // Load Solana wallet from base58 private key
  const secretKey = bs58.decode(process.env.SOLANA_PRIVATE_KEY!)
  const wallet = Keypair.fromSecretKey(secretKey)
  
  // Solana connection (use your RPC URL)
  const connection = new Connection(process.env.RPC_URL || 'https://api.mainnet-beta.solana.com')
  
  // Create Solana signer for Rarible SDK
  const solanaSigner = new SolanaSigner(wallet, connection)
  
  // SDK with wallet for executing trades
  export const sdk: IRaribleSdk = createRaribleSdk(solanaSigner, "prod", { 
    apiKey: process.env.RARIBLE_API_KEY || "" 
  })

  // SDK read-only for fetching data
  export const sdkReadOnly: IRaribleSdk = createRaribleSdk(undefined, "prod", { 
    apiKey: process.env.RARIBLE_API_KEY || "" 
  })

  console.log(`✅ Solana wallet loaded: ${wallet.publicKey.toString()}`)

} catch (error: any) {
  console.error('❌ Failed to initialize Rarible SDK:', error.message)
  throw new Error(`Rarible SDK initialization failed: ${error.message}`)
}

// --- Fetch listings ---
export async function fetchListings(collectionId: string): Promise<NFTListing[]> {
  try {
    const itemController = sdkReadOnly.apis.item
    const result = await itemController.getItemsByCollection({ 
      collection: collectionId, 
      size: 50 
    })
    
    const now = Date.now()
    const listings: NFTListing[] = result.items
      .map((item: any): NFTListing | null => {
        const sellOrder = item.sellOrders?.[0]
        if (!sellOrder?.make?.value || !item.id || !sellOrder.maker) return null
        
        // Extract Solana address from maker
        const sellerPubkey = sellOrder.maker
        return {
          mint: item.id,
          auctionHouse: "Rarible" as AuctionHouse,
          price: new BN(sellOrder.make.value),
          currency: "SOL" as const,
          timestamp: now,
          sellerPubkey: sellerPubkey,
        }
      })
      .filter((x): x is NFTListing => x !== null)
    
    const priceRangeSOL = listings.length > 0
      ? `${(listings[0].price.toNumber() / 1e9).toFixed(2)} - ${(listings[listings.length - 1].price.toNumber() / 1e9).toFixed(2)} SOL`
      : "N/A"

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
    const orderController = sdkReadOnly.apis.order
    const result = await orderController.getOrdersByCollection({
      collection: collectionId,
      status: [OrderStatus.ACTIVE],
      type: 'BID', // Filter for bids specifically
      size: 30
    })
    
    const now = Date.now()
    const bids: NFTBid[] = result.orders
      .map((order: any): NFTBid | null => {
        if (!order.take?.value || !order.maker) return null
        return {
          mint: collectionId,
          auctionHouse: "Rarible" as AuctionHouse,
          price: new BN(order.take.value),
          currency: "SOL" as const,
          timestamp: now,
          bidderPubkey: order.maker,
        }
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
    const prepare = await sdk.order.acceptBid({ 
      orderId: toOrderId(orderId), 
      amount 
    })
    const tx = await prepare.submit()
    pnlLogger.logMetrics({ 
      message: "✅ Accepted bid", 
      txHash: tx.hash, 
      orderId 
    })
    return tx
  } catch (err: any) {
    pnlLogger.logMetrics({ 
      message: "⚠️ Failed to accept bid", 
      orderId, 
      error: err.message || err 
    })
    return null
  }
}

// --- List NFT for sale ---
import { OrderId } from "@rarible/types"

export async function sellNFT(itemId: string, priceSOL: string, amount = 1): Promise<OrderId | null> {
  try {
    const priceInLamports = (parseFloat(priceSOL) * 1e9).toString()
    
    const prepare = await sdk.order.sell({
      itemId: toItemId(itemId),
      amount,
      price: priceInLamports,
      currency: toCurrencyId("SOL"),
    })
    
    const orderId = await prepare.submit()
    pnlLogger.logMetrics({ 
      message: "✅ NFT listed for sale", 
      itemId, 
      orderId,
      priceSOL 
    })
    return orderId
  } catch (err: any) {
    pnlLogger.logMetrics({ 
      message: "⚠️ Failed to list NFT", 
      itemId, 
      error: err.message || err 
    })
    return null
  }
}

// --- Health check ---
export async function healthCheck(): Promise<boolean> {
  try {
    const itemController = sdkReadOnly.apis.item
    const response = await itemController.getAllItems({ size: 1 })
    return response?.items.length >= 0
  } catch {
    return false
  }
}

// Export default
export default { 
  fetchListings, 
  fetchBids, 
  acceptBid, 
  sellNFT, 
  healthCheck,
  sdk,
  sdkReadOnly 
}
