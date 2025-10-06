// src/config.ts
import dotenv from "dotenv";
dotenv.config();

function getEnvList(key: string): string[] {
  const val = process.env[key];
  return val ? val.split(",").map(v => v.trim().toUpperCase()).filter(Boolean) : [];
}

export const config = {
  rpcUrl: process.env.RPC_URL || "",
  walletPrivateKey: process.env.PRIVATE_KEY || "",
  heliusApiKey: process.env.HELIUS_API_KEY || "",
  tensorApiKey: process.env.TENSOR_API_KEY || "",
  openseaApiKey: process.env.OPENSEA_API_KEY || "",
  
  COLLECTIONS: getEnvList("COLLECTION_MINTS"),
  MARKETPLACES: getEnvList("MARKETPLACES"), // e.g. ["HELIUS", "TENSOR"]

  minProfitLamports: Math.floor(parseFloat(process.env.MIN_PROFIT_SOL || "0.01") * 1e9),
  feeBufferLamports: Math.floor(parseFloat(process.env.FEE_BUFFER_SOL || "0.002") * 1e9),
  scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS || "10000", 10),
  maxConcurrentTrades: parseInt(process.env.MAX_CONCURRENT_TRADES || "3", 10),

  enableJsonLogging: process.env.ENABLE_JSON_LOGGING === "true",
  enableCsvLogging: process.env.ENABLE_CSV_LOGGING === "true",
  logLevel: process.env.LOG_LEVEL || "info",
};
