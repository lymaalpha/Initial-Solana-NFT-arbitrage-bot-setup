// src/config.ts
export const config = {
  // RPC & Wallet
  rpcUrl: process.env.RPC_URL || "https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY",
  heliusApiKey: process.env.HELIUS_API_KEY || "YOUR_HELIUS_KEY",
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY || "",

  // Bot settings
  minProfitLamports: 0.01 * 1e9, // Minimum profit to execute trade
  feeBufferLamports: 0.01 * 1e9, // Extra buffer for fees
  scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS || "5000"),
  maxConcurrentTrades: 2, // How many trades to execute simultaneously

  // Collections
  COLLECTIONS: [
    "J1S9H3QjnRtBbbuD4HjPsRy5uXkTVMJbvXWB7R9X", // Mad Lads
    "3saAedkM9o5g1u5DCqsuMZuC4GRqPB4TuMkvSsSVvGQ3", // Okay Bears
    "6XxjKYFbcndh2gDcsUrmZgVEsoDxXMH3VYKpnMbbwjQ", // DeGods
    "SMBH3wF6baUj3P1VeYPBrVZKWvS9RLnHxtMuMw2VXh", // Solana Monkey Business
    "9ARngHhVaCtH5JFieRdSS5Y8cdZk2TMF4tfGSWPB4w", // Degenerate Ape Academy
    "AURYydfxJib1y1WiPiZ3jKAE2qbNy64eiVxuzbQ2FqSLw", // Aurory
    "7gxsWbTCQTtjuLgbemZkGT4TdALZo7CE8YJjjKnXE", // Thugbirdz
    "66MZJWWM7ucWay8R2BzYgZVQHo3X2ZviYvCi4BCr42u6", // Solana Money Boys
    "DTPkJWwRYi5RuKX4qyJY1H6H5kVWRzqSgq7XFzMweWwH" // Degen Trash Pandas
  ]
};
