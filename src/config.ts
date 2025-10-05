import dotenv from 'dotenv';
import BN from 'bn.js';

dotenv.config();

export interface BotConfig {
  rpcUrl: string;
  walletPrivateKey: string;
  collectionMint: string;
  scanIntervalMs: number;
  minSignals: number;
  minProfitLamports: BN;
  feeBufferLamports: BN;
  logLevel: string;
  enableCsvLogging: boolean;
  enableJsonLogging: boolean;
  heliusApiKey?: string;
  magicEdenApiKey?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  discordWebhookUrl?: string;
}

function parseNumber(value: string | undefined, defaultValue: number, name: string): number {
  const num = parseFloat(value || defaultValue.toString());
  if (isNaN(num) || num < 0) throw new Error(`Invalid ${name}: ${value}`);
  return num;
}

function validateConfig(): BotConfig {
  const requiredVars = ['RPC_URL', 'PRIVATE_KEY', 'COLLECTION_MINT'];
  const missing = requiredVars.filter(v => !process.env[v]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);

  const minProfitSOL = parseNumber(process.env.MIN_PROFIT_SOL, 0.05, 'MIN_PROFIT_SOL');
  const feeBufferSOL = parseNumber(process.env.FEE_BUFFER_SOL, 0.02, 'FEE_BUFFER_SOL');
  const scanIntervalMs = parseNumber(process.env.SCAN_INTERVAL_MS, 5000, 'SCAN_INTERVAL_MS');
  const minSignals = parseInt(process.env.MIN_SIGNALS || '1', 10);
  if (isNaN(minSignals) || minSignals < 1) throw new Error('MIN_SIGNALS invalid');

  return {
    rpcUrl: process.env.RPC_URL!,
    walletPrivateKey: process.env.PRIVATE_KEY!,
    collectionMint: process.env.COLLECTION_MINT!,
    scanIntervalMs,
    minSignals,
    minProfitLamports: new BN(minProfitSOL * 1e9),
    feeBufferLamports: new BN(feeBufferSOL * 1e9),
    logLevel: process.env.LOG_LEVEL || 'info',
    enableCsvLogging: process.env.ENABLE_CSV_LOGGING === 'true',
    enableJsonLogging: process.env.ENABLE_JSON_LOGGING !== 'false',
    heliusApiKey: process.env.HELIUS_API_KEY,
    magicEdenApiKey: process.env.MAGIC_EDEN_API_KEY,
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
  };
}

export const config = validateConfig();
export default config;
