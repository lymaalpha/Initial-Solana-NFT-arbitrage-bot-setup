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
  heliusApiKey: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  discordWebhookUrl?: string;
}

function parseNumber(value: string | undefined, defaultValue: number, name: string): number {
  const num = parseFloat(value || defaultValue.toString());
  if (isNaN(num) || num < 0) {
    throw new Error(`Invalid ${name}: must be positive (got ${value})`);
  }
  return num;
}

export const config: BotConfig = {
  rpcUrl: process.env.RPC_URL!,
  walletPrivateKey: process.env.PRIVATE_KEY!,
  collectionMint: process.env.COLLECTION_MINT!,
  scanIntervalMs: parseNumber(process.env.SCAN_INTERVAL_MS, 5000, 'SCAN_INTERVAL_MS'),
  minSignals: parseInt(process.env.MIN_SIGNALS || '1', 10),
  minProfitLamports: new BN(parseNumber(process.env.MIN_PROFIT_SOL, 0.05, 'MIN_PROFIT_SOL') * 1e9),
  feeBufferLamports: new BN(parseNumber(process.env.FEE_BUFFER_SOL, 0.02, 'FEE_BUFFER_SOL') * 1e9),
  logLevel: process.env.LOG_LEVEL || 'info',
  heliusApiKey: process.env.HELIUS_API_KEY!,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
};
