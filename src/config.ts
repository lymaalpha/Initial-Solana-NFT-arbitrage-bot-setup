import dotenv from "dotenv";
import BN from 'bn.js';

dotenv.config();

function getEnvList(key: string): string[] {
  const val = process.env[key];
  return val ? val.split(",").map(v => v.trim().toUpperCase()).filter(Boolean) : [];
}

export interface BotConfig {
  rpcUrl: string;
  walletPrivateKey: string;
  heliusApiKey: string;
  tensorApiKey: string;
  openseaApiKey: string;
  collections: string[];
  marketplaces: string[];
  minProfitLamports: BN;
  feeBufferLamports: BN;
  scanIntervalMs: number;
  maxConcurrentTrades: number;
  minSignals: number;  // Added for main.ts
  enableJsonLogging: boolean;
  enableCsvLogging: boolean;
  logLevel: string;
  simulateOnly: boolean;
}

function parseNumber(value: string | undefined, defaultValue: number, name: string): number {
  const num = parseFloat(value || defaultValue.toString());
  if (isNaN(num) || num < 0) {
    throw new Error(`Invalid ${name}: must be positive (got ${value})`);
  }
  return num;
}

function validateConfig(): BotConfig {
  const requiredVars = ['RPC_URL', 'PRIVATE_KEY'];
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  console.log('Config loaded successfully');

  return {
    rpcUrl: process.env.RPC_URL!,
    walletPrivateKey: process.env.PRIVATE_KEY!,
    heliusApiKey: process.env.HELIUS_API_KEY || "",
    tensorApiKey: process.env.TENSOR_API_KEY || "",
    openseaApiKey: process.env.OPENSEA_API_KEY || "",
    collections: getEnvList("COLLECTION_MINTS"),
    marketplaces: getEnvList("MARKETPLACES"),
    minProfitLamports: new BN(parseNumber(process.env.MIN_PROFIT_SOL, 0.01, 'MIN_PROFIT_SOL') * 1e9),
    feeBufferLamports: new BN(parseNumber(process.env.FEE_BUFFER_SOL, 0.002, 'FEE_BUFFER_SOL') * 1e9),
    scanIntervalMs: parseNumber(process.env.SCAN_INTERVAL_MS, 10000, 'SCAN_INTERVAL_MS'),
    maxConcurrentTrades: parseInt(process.env.MAX_CONCURRENT_TRADES || '3', 10),
    minSignals: parseInt(process.env.MIN_SIGNALS || '1', 10),  // Added
    enableJsonLogging: process.env.ENABLE_JSON_LOGGING === "true",
    enableCsvLogging: process.env.ENABLE_CSV_LOGGING === "true",
    logLevel: process.env.LOG_LEVEL || "info",
    simulateOnly: process.env.SIMULATE_ONLY === 'true',
  };
}

export const config = validateConfig();
export default config;
