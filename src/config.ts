import dotenv from "dotenv";
import BN from "bn.js";
import { BotConfig, BotMode, LogLevel, AuctionHouse } from "./types";

dotenv.config();

/** Utility: split comma-separated env vars into clean string arrays */
function getEnvList(key: string, defaultValue: string[] = []): string[] {
  const val = process.env[key];
  return val ? val.split(",").map(v => v.trim()).filter(Boolean) : defaultValue;
}

/** Get marketplace list with type validation */
function getMarketplaces(): AuctionHouse[] {
  const marketplaces = getEnvList("MARKETPLACES", DEFAULT_MARKETPLACES);
  
  // Validate that all marketplaces are valid AuctionHouse values
  const validMarketplaces = marketplaces.filter(m => 
    m === "MagicEden" || m === "Rarible"
  ) as AuctionHouse[];
  
  if (validMarketplaces.length !== marketplaces.length) {
    const invalid = marketplaces.filter(m => !validMarketplaces.includes(m as AuctionHouse));
    console.warn(`⚠️  Invalid marketplaces ignored: ${invalid.join(', ')}`);
  }
  
  return validMarketplaces;
}

/** Safe number parsing with validation */
function parseNumber(value: string | undefined, defaultValue: number, name: string): number {
  const num = parseFloat(value || defaultValue.toString());
  if (isNaN(num) || num < 0) {
    throw new Error(`Invalid ${name}: must be positive (got ${value})`);
  }
  return num;
}

/** Parse BN from SOL amount */
function parseBNFromSOL(value: string | undefined, defaultValue: number, name: string): BN {
  const solAmount = parseNumber(value, defaultValue, name);
  return new BN(solAmount * 1e9);
}

/** Validate RPC URL */
function validateRpcUrl(url: string): string {
  if (!url.startsWith('http')) {
    throw new Error(`Invalid RPC URL: must start with http/https (got ${url})`);
  }
  return url;
}

/** Validate private key format */
function validatePrivateKey(key: string): string {
  if (!key || key.length < 32) {
    throw new Error('Invalid private key: must be at least 32 characters');
  }
  return key;
}

/** Get bot mode from environment */
function getBotMode(): BotMode {
  const mode = process.env.BOT_MODE?.toUpperCase();
  const validModes: BotMode[] = ['SIMULATION', 'DRY_RUN', 'LIVE_TRADING', 'MAINTENANCE'];
  
  if (mode && validModes.includes(mode as BotMode)) {
    return mode as BotMode;
  }
  
  // Default based on SIMULATE_ONLY for backward compatibility
  return process.env.SIMULATE_ONLY === 'true' ? 'SIMULATION' : 'LIVE_TRADING';
}

/** Get log level with validation */
function getLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  const validLevels: LogLevel[] = ['error', 'warn', 'info', 'debug', 'trace'];
  
  if (level && validLevels.includes(level as LogLevel)) {
    return level as LogLevel;
  }
  
  return 'info';
}

/** Default collections if none specified */
const DEFAULT_COLLECTIONS = [
  'mad_lads',
  'okay_bears', 
  'degods',
  'tensorians',
  'famous_fox_federation'
];

/** Default marketplaces if none specified */
const DEFAULT_MARKETPLACES: AuctionHouse[] = [
  'MagicEden',
  'Rarible'
];

/** Validate and load configuration from environment */
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
    
    // API Keys
    heliusApiKey: process.env.HELIUS_API_KEY || "",
    openseaApiKey: process.env.OPENSEA_API_KEY || "",
    moralisApiKey: process.env.MORALIS_API_KEY || "",
    magicEdenApiKey: process.env.MAGIC_EDEN_API_KEY || "",
    raribleApiKey: process.env.RARIBLE_API_KEY || "",
    
    // Trading parameters
    collections: getEnvList("COLLECTION_MINTS", DEFAULT_COLLECTIONS),
    marketplaces: getMarketplaces(),
    minProfitLamports: parseBNFromSOL(process.env.MIN_PROFIT_SOL, 0.01, 'MIN_PROFIT_SOL'),
    feeBufferLamports: parseBNFromSOL(process.env.FEE_BUFFER_SOL, 0.002, 'FEE_BUFFER_SOL'),
    maxSlippageBps: parseNumber(process.env.MAX_SLIPPAGE_BPS, 100, 'MAX_SLIPPAGE_BPS'),
    
    // Execution limits
    scanIntervalMs: parseNumber(process.env.SCAN_INTERVAL_MS, 30000, 'SCAN_INTERVAL_MS'),
    maxConcurrentTrades: parseInt(process.env.MAX_CONCURRENT_TRADES || '3', 10),
    minSignals: parseInt(process.env.MIN_SIGNALS || '1', 10),
    maxGasPerTradeLamports: parseBNFromSOL(process.env.MAX_GAS_PER_TRADE_SOL, 0.01, 'MAX_GAS_PER_TRADE_SOL'),
    
    // Risk management
    riskLimits: {
      maxDailyLossLamports: parseBNFromSOL(process.env.MAX_DAILY_LOSS_SOL, 0.5, 'MAX_DAILY_LOSS_SOL'),
      maxTradesPerHour: parseInt(process.env.MAX_TRADES_PER_HOUR || '20', 10),
      cooloffAfterFailureMs: parseNumber(process.env.COOLOFF_AFTER_FAILURE_MS, 60000, 'COOLOFF_AFTER_FAILURE_MS'),
      enableCircuitBreaker: process.env.ENABLE_CIRCUIT_BREAKER !== 'false',
    },
    
    // Logging
    enableJsonLogging: process.env.ENABLE_JSON_LOGGING === "true",
    enableCsvLogging: process.env.ENABLE_CSV_LOGGING === "true",
    enableSheetsLogging: process.env.ENABLE_SHEETS_LOGGING === "true",
    logLevel: getLogLevel(),
    
    // Marketplace settings
    marketplaceSettings: {
      timeoutMs: parseNumber(process.env.MARKETPLACE_TIMEOUT_MS, 10000, 'MARKETPLACE_TIMEOUT_MS'),
      retryAttempts: parseInt(process.env.MARKETPLACE_RETRY_ATTEMPTS || '3', 10),
      rateLimitDelayMs: parseNumber(process.env.RATE_LIMIT_DELAY_MS, 1000, 'RATE_LIMIT_DELAY_MS'),
    },
    
    // Notifications
    notifications: {
      enabled: process.env.NOTIFICATIONS_ENABLED === "true",
      webhookUrl: process.env.WEBHOOK_URL,
      minProfitAlertSOL: parseNumber(process.env.MIN_PROFIT_ALERT_SOL, 0.1, 'MIN_PROFIT_ALERT_SOL'),
      errorAlerts: process.env.ERROR_ALERTS !== 'false',
    },
  };

  // Enhanced validation checks
  if (config.maxConcurrentTrades < 1) {
    throw new Error('MAX_CONCURRENT_TRADES must be at least 1');
  }

  if (config.scanIntervalMs < 5000) {
    throw new Error('SCAN_INTERVAL_MS must be at least 5000ms (5 seconds)');
  }

  if (config.marketplaces.length === 0) {
    throw new Error('At least one valid marketplace must be specified (MagicEden or Rarible)');
  }

  // Enhanced API key validation
  console.log("🔑 API Key Status:");
  console.log(`   Magic Eden: ${config.magicEdenApiKey ? '✅ Configured' : '⚠️  Using public API (rate limited)'}`);
  console.log(`   Rarible: ${config.raribleApiKey ? '✅ Configured' : '⚠️  Using public API (rate limited)'}`);
  console.log(`   Helius: ${config.heliusApiKey ? '✅ Configured' : '❌ Missing (RPC may be slow)'}`);

  // Validate marketplace settings based on enabled marketplaces
  if (config.marketplaces.includes('MagicEden')) {
    console.log('🔹 MagicEden: Enabled');
  }
  
  if (config.marketplaces.includes('Rarible')) {
    console.log('🔹 Rarible: Enabled');
  }

  console.log("✅ Configuration loaded successfully");
  console.log(`🤖 Mode: ${config.mode}`);
  console.log(`📊 Collections: ${config.collections.length}`);
  console.log(`🛒 Marketplaces: ${config.marketplaces.join(', ')}`);
  console.log(`💰 Min Profit: ${config.minProfitLamports.toNumber() / 1e9} SOL`);

  return config;
}

// Export configuration singleton
export const config = validateConfig();

// Enhanced utility functions
export const isTradingEnabled = (): boolean => {
  return config.mode === 'LIVE_TRADING';
};

export const isSimulationMode = (): boolean => {
  return config.mode === 'SIMULATION';
};

// Marketplace-specific utilities
export const isMagicEdenEnabled = (): boolean => {
  return config.marketplaces.includes('MagicEden');
};

export const isRaribleEnabled = (): boolean => {
  return config.marketplaces.includes('Rarible');
};

// Export configuration helpers
export default config;
