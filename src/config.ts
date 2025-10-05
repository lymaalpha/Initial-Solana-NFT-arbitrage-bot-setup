import dotenv from 'dotenv';

dotenv.config();

export const config = {
  rpcUrl: process.env.RPC_URL || 'https://api.devnet.solana.com',
  collectionMint: process.env.COLLECTION_MINT || 'BQEyR1hD7y3m6j6b6n6Qj6b6n6Qj6b6n6Qj6b6n', // BAYC example
  walletPrivateKey: process.env.PRIVATE_KEY || '',
  scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS || '5000'),
  minSignals: parseInt(process.env.MIN_SIGNALS || '1'),
  // Add more (e.g., feeBufferSOL: 0.05)
};
