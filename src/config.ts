// src/config.ts - UPDATED WITH PROPER API KEYS
import dotenv from "dotenv";
import BN from "bn.js";
import { BotConfig, BotMode, LogLevel, AuctionHouse } from "./types";

dotenv.config();

/** Complete configuration interface - UPDATED */
export interface BotConfig {
  // Core settings
  mode: BotMode;
  rpcUrl: string;
  walletPrivateKey: string;
  
  // API Keys - UPDATED: Added Magic Eden and Rarible keys
  heliusApiKey: string;
  openseaApiKey: string;
  moralisApiKey: string;
  magicEdenApiKey: string;     // ✅ ADDED
  raribleApiKey: string;       // ✅ ADDED
  
  // Trading parameters
  collections: string[];
  marketplaces: AuctionHouse[];
  minProfitLamports: BN;
  feeBufferLamports: BN;
  maxSlippageBps: number;
  
  // ... rest of the interface remains the same
}

// ... existing utility functions ...

/** Validate and load configuration from environment - UPDATED */
function validateConfig(): BotConfig {
  const requiredVars = ["RPC_URL", "PRIVATE_KEY"];
  const missing = requiredVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  const config: BotConfig = {
    // Core settings
    mode: getBotMode(),
    rpcUrl: validateRpcUrl(process.env.RPC_URL!),
    walletPrivateKey: validatePrivateKey(process.env.PRIVATE_KEY!),
    
    // API Keys - UPDATED: Include Magic Eden and Rarible keys
    heliusApiKey: process.env.HELIUS_API_KEY || "",
    openseaApiKey: process.env.OPENSEA_API_KEY || "",
    moralisApiKey: process.env.MORALIS_API_KEY || "",
    magicEdenApiKey: process.env.MAGIC_EDEN_API_KEY || "",  // ✅ ADDED
    raribleApiKey: process.env.RARIBLE_API_KEY || "",       // ✅ ADDED
    
    // Trading parameters
    collections: getEnvList("COLLECTION_MINTS", DEFAULT_COLLECTIONS),
    marketplaces: getMarketplaces(),
    minProfitLamports: parseBNFromSOL(process.env.MIN_PROFIT_SOL, 0.01, 'MIN_PROFIT_SOL'),
    feeBufferLamports: parseBNFromSOL(process.env.FEE_BUFFER_SOL, 0.002, 'FEE_BUFFER_SOL'),
    maxSlippageBps: parseNumber(process.env.MAX_SLIPPAGE_BPS, 100, 'MAX_SLIPPAGE_BPS'),
    
    // ... rest of config remains the same
  };

  // Enhanced API key validation
  console.log("🔑 API Key Status:");
  console.log(`   Magic Eden: ${config.magicEdenApiKey ? '✅ Configured' : '⚠️  Using public API (rate limited)'}`);
  console.log(`   Rarible: ${config.raribleApiKey ? '✅ Configured' : '⚠️  Using public API (rate limited)'}`);
  console.log(`   Helius: ${config.heliusApiKey ? '✅ Configured' : '❌ Missing (RPC may be slow)'}`);

  // ... rest of validation
}
