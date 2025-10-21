import { createRaribleSdk } from "@rarible/sdk";
import { toItemId, toOrderId, toCurrencyId } from "@rarible/types";
import type { IRaribleSdk } from "@rarible/sdk";
import { NFTListing, NFTBid, AuctionHouse } from "./types";
import { OrderStatus } from "@rarible/api-client";
import { pnlLogger } from "./pnlLogger";
import BN from "bn.js";
import { JsonRpcProvider } from "@ethersproject/providers";
import { Wallet } from "@ethersproject/wallet";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// SDK instances
let sdk: IRaribleSdk | null = null;
let sdkReadOnly: IRaribleSdk | null = null;

// Initialize Rarible SDK (Ethereum-based)
function initializeRaribleSdk(): void {
  try {
    // Use EVM wallet for Rarible (Ethereum)
    // For Solana NFTs, we'll use API-only mode or switch to different marketplace
    const provider = new JsonRpcProvider("https://eth-mainnet.g.alchemy.com/v2/demo");
    
    // Create a dummy wallet for signing (replace with real EVM private key if needed)
    const wallet = Wallet.createRandom();
    const raribleWallet = wallet as any; // Type cast for Rarible compatibility

    // Read-only SDK for fetching data
    sdkReadOnly = createRaribleSdk(undefined, "prod", {
      apiKey: process.env.RARIBLE_API_KEY || "",
    });

    // Full SDK for trading (requires real EVM wallet)
    sdk = createRaribleSdk(raribleWallet, "prod", {
      apiKey: process.env.RARIBLE_API_KEY || "",
    });

    console.log("✅ Rarible SDK initialized (Ethereum)");
    console.log("⚠️  For Solana NFTs: Using API-only mode");
  } catch (error: any) {
    console.error("❌ Rarible SDK initialization failed:", error.message);
    sdk = null;
    sdkReadOnly = null;
  }
}

// Initialize on startup
initializeRaribleSdk();

// --- Fetch listings (API-only, works for any chain) ---
export async function fetchListings(
  collectionId: string
): Promise<NFTListing[]> {
  if (!sdkReadOnly) {
    console.error("❌ Rarible SDK not initialized");
    return [];
  }

  try {
    const itemController = sdkReadOnly.apis.item;
    const result = await itemController.getItemsByCollection({
      collection: collectionId,
      size: 50,
    });

    const now = Date.now();
    const listings: NFTListing[] = result.items
      .map((item: any): NFTListing | null => {
        const sellOrder = item.sell?.[0] || item.sellOrders?.[0];
        if (!sellOrder?.make?.value || !item.id || !sellOrder.maker) {
          return null;
        }

        return {
          mint: item.id,
          auctionHouse: "Rarible" as AuctionHouse,
          price: new BN(sellOrder.make.value),
          currency: "ETH" as const, // Rarible primarily uses ETH
          timestamp: now,
          sellerPubkey: sellOrder.maker,
        };
      })
      .filter((listing: NFTListing | null): listing is NFTListing => listing !== null);

    const priceRange = listings.length > 0
      ? `${(listings[0].price.toNumber() / 1e18).toFixed(4)} - ${
          (listings[listings.length - 1].price.toNumber() / 1e18).toFixed(4)
        } ETH`
      : "N/A";

    pnlLogger.logMetrics({
      message: "✅ Rarible listings fetched",
      collection: collectionId,
      count: listings.length,
      priceRange,
      source: "Rarible SDK",
    });

    return listings;
  } catch (err: any) {
    pnlLogger.logMetrics({
      message: "⚠️ Rarible listings fetch failed",
      collection: collectionId,
      error: err.message || err,
      source: "Rarible SDK",
    });
    return [];
  }
}

// --- Fetch bids ---
export async function fetchBids(collectionId: string): Promise<NFTBid[]> {
  if (!sdkReadOnly) {
    console.error("❌ Rarible SDK not initialized");
    return [];
  }

  try {
    const orderController = sdkReadOnly.apis.order;
    const result = await orderController.getOrdersAll({
      collection: collectionId,
      status: [OrderStatus.ACTIVE],
      type: "BID",
      size: 30,
    });

    const now = Date.now();
    const bids: NFTBid[] = result.orders
      .map((order: any): NFTBid | null => {
        if (
          order.type !== "BID" ||
          !order.take?.value ||
          !order.maker
        ) {
          return null;
        }

        return {
          mint: collectionId,
          auctionHouse: "Rarible" as AuctionHouse,
          price: new BN(order.take.value),
          currency: "ETH" as const,
          timestamp: now,
          bidderPubkey: order.maker,
        };
      })
      .filter((bid: NFTBid | null): bid is NFTBid => bid !== null);

    pnlLogger.logMetrics({
      message: "✅ Rarible bids fetched",
      collection: collectionId,
      count: bids.length,
      source: "Rarible SDK",
    });

    return bids;
  } catch (err: any) {
    pnlLogger.logMetrics({
      message: "⚠️ Rarible bids fetch failed",
      collection: collectionId,
      error: err.message || err,
      source: "Rarible SDK",
    });
    return [];
  }
}

// --- Accept bid (requires EVM wallet) ---
export async function acceptBid(orderId: string, amount = 1): Promise<string | null> {
  if (!sdk) {
    console.error("❌ Rarible SDK not ready for trading");
    return null;
  }

  try {
    const prepare = await sdk.order.acceptBid({
      orderId: toOrderId(orderId),
      amount,
    });
    const tx = await prepare.submit();
    pnlLogger.logMetrics({
      message: "✅ Bid accepted",
      txHash: tx.hash,
      orderId,
    });
    return tx.hash;
  } catch (err: any) {
    pnlLogger.logMetrics({
      message: "⚠️ Failed to accept bid",
      orderId,
      error: err.message || err,
    });
    return null;
  }
}

// --- List NFT for sale (requires EVM wallet) ---
export async function sellNFT(
  itemId: string,
  priceETH: string,
  amount = 1
): Promise<string | null> {
  if (!sdk) {
    console.error("❌ Rarible SDK not ready for trading");
    return null;
  }

  try {
    const priceWei = (parseFloat(priceETH) * 1e18).toString();

    const prepare = await sdk.order.sell({
      itemId: toItemId(itemId),
      amount,
      price: priceWei,
      currency: toCurrencyId("ETH"),
    });

    const orderId = await prepare.submit();
    pnlLogger.logMetrics({
      message: "✅ NFT listed for sale",
      itemId,
      orderId,
      priceETH,
    });
    return orderId;
  } catch (err: any) {
    pnlLogger.logMetrics({
      message: "⚠️ Failed to list NFT",
      itemId,
      error: err.message || err,
    });
    return null;
  }
}

// --- Health check ---
export async function healthCheck(): Promise<boolean> {
  if (!sdkReadOnly) {
    return false;
  }

  try {
    const response = await sdkReadOnly.apis.item.getAllItems({ size: 1 });
    return response?.items.length >= 0;
  } catch {
    return false;
  }
}

// Export SDK for external use
export { sdk, sdkReadOnly };

export default {
  fetchListings,
  fetchBids,
  acceptBid,
  sellNFT,
  healthCheck,
};
