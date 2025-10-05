import dotenv from "dotenv";
dotenv.config();

export const config = {
  // API Keys
  heliusApiKey: process.env.HELIUS_API_KEY || "",
  tensorApiKey: process.env.TENSOR_API_KEY || "",

  // Target Collections
  collections: {
    MAD_LADS: "J1S9H3QjnRtBbbuD4HjPsRy5uXkTVMJbvXWB7R9X",
    DEGODS: "6XxjKYFbcndh2gDcsUrmZgVEsoDxXMH3VYKpnMbbwjQ",
    OKAY_BEARS: "3saAedkM9o5g1u5DCqsuMZuC4GRqPB4TuMkvSsSVvGQ3",
    SMB: "SMBH3wF6baUj3P1VeYPBrVZKWvS9RLnHxtMuMw2VXh",
    DAA: "9ARngHhVaCtH5JFieRdSS5Y8cdZk2TMF4tfGSWPB4w",
    AURORY: "AURYydfxJib1y1WiPiZ3jKAE2qbNy64eiVxuzbQ2FqSLw",
    THUGBIRDZ: "7gxsWbTCQTtjuLgbemZkGT4TdALZo7CE8YJjjKnXE",
    MONEY_BOYS: "66MZJWWM7ucWay8R2BzYgZVQHo3X2ZviYvCi4BCr42u6",
    DEGEN_TRASH_PANDAS: "DTPkJWwRYi5RuKX4qyJY1H6H5kVWRzqSgq7XFzMweWwH",
  },

  // Bot Settings
  arbitrageThresholdSol: 0.2, // Minimum profit in SOL to execute trade
  scanIntervalMs: 10_000, // 10 seconds between scans
  logFile: "arbitrage.log",
};
