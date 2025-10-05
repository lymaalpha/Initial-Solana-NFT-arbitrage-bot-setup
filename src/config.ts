import dotenv from "dotenv";
import BN from "bn.js";
dotenv.config();

export const config = {
  // 🔑 API Keys
  heliusApiKey: process.env.HELIUS_API_KEY || "",
  tensorApiKey: process.env.TENSOR_API_KEY || "",
  rpcUrl: process.env.RPC_URL || "https://api.mainnet-beta.solana.com",

  // 🪙 Wallet for transaction signing
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY || "",

  // 🧠 Collection mint addresses to scan
  COLLECTIONS: [
    "J1S9H3QjnRtBbbuD4HjPsRy5uXkTVMJbvXWB7R9X", // Mad Lads
    "6XxjKYFbcndh2gDcsUrmZgVEsoDxXMH3VYKpnMbbwjQ", // DeGods
    "3saAedkM9o5g1u5DCqsuMZuC4GRqPB4TuMkvSsSVvGQ3", // Okay Bears
    "SMBH3wF6baUj3P1VeYPBrVZKWvS9RLnHxtMuMw2VXh", // SMB
    "9ARngHhVaCtH5JFieRdSS5Y8cdZk2TMF4tfGSWPB4w", // Degen Ape Academy
    "AURYydfxJib1y1WiPiZ3jKAE2qbNy64eiVxuzbQ2FqSLw", // Aurory
    "7gxsWbTCQTtjuLgbemZkGT4TdALZo7CE8YJjjKnXE", // Thugbirdz
    "66MZJWWM7ucWay8R2BzYgZVQHo3X2ZviYvCi4BCr42u6", // Solana Money Boys
    "DTPkJWwRYi5RuKX4qyJY1H6H5kVWRzqSgq7XFzMweWwH" // Degen Trash Pandas
  ],

  // ⚙️ Bot Runtime Settings
  scanIntervalMs: 10_000, // Every 10 seconds
  maxConcurrentTrades: 3,

  // 💰 Arbitrage thresholds
  minProfitLamports: new BN(0.2 * 1e9), // 0.2 SOL minimum profit
  feeBufferLamports: new BN(0.02 * 1e9), // 0.02 SOL for fees/slippage

  // 📈 Logging
  pnlLogFile: "pnl.csv",
};
