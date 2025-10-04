# Solana NFT Arbitrage Bot

An automated arbitrage bot for Solana NFTs that uses flash loans to execute profitable trades across different marketplaces without requiring upfront capital.

## 🚀 Features

- **Flash Loan Arbitrage**: Execute trades using Solend flash loans (no capital required)
- **Multi-Marketplace**: Scans Magic Eden, Tensor, OpenSea, and other major NFT platforms
- **Real-time Monitoring**: Continuous scanning with configurable intervals
- **Comprehensive Logging**: CSV and JSON logging with profit tracking
- **Railway Deployment**: Optimized for free deployment on Railway platform
- **Risk Management**: Built-in simulation and fee calculations

## 📋 Prerequisites

1. **Solana Wallet**: Generate a new wallet for the bot
2. **RPC Access**: Solana RPC endpoint (free public or paid Helius/QuickNode)
3. **Target Collection**: NFT collection mint address to monitor

## 🛠️ Setup Instructions

### 1. Generate Wallet

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.16.0/install)"

# Generate new keypair
solana-keygen new --outfile bot-wallet.json

# Get the base58 private key (for Railway env vars)
solana-keygen pubkey bot-wallet.json  # This gives you the public key
# For private key, you'll need to convert the JSON file to base58
```

### 2. Fund Your Wallet

```bash
# For testing (devnet)
solana airdrop 2 <YOUR_WALLET_ADDRESS> --url devnet

# For production (mainnet) - send SOL to your wallet address
# Recommended: 0.1-0.5 SOL for transaction fees
```

### 3. Environment Configuration

Copy `.env.example` to `.env` and fill in your values:

```env
# Solana Configuration
RPC_URL=https://api.devnet.solana.com  # Use devnet for testing
PRIVATE_KEY=<YOUR_BASE58_PRIVATE_KEY>   # From step 1
COLLECTION_MINT=<TARGET_COLLECTION>     # NFT collection to monitor

# Bot Settings
SCAN_INTERVAL_MS=5000                   # Scan every 5 seconds
MIN_SIGNALS=1                           # Execute top 1 signal per cycle
MIN_PROFIT_SOL=0.05                     # Minimum 0.05 SOL profit
FEE_BUFFER_SOL=0.02                     # Fee buffer for transactions

# Logging
LOG_LEVEL=info
ENABLE_CSV_LOGGING=true
ENABLE_JSON_LOGGING=true
```

## 🚀 Railway Deployment

### Step 1: Prepare Repository

1. Push your code to GitHub (public or private repository)
2. Ensure all files are committed except `.env` (use `.env.example` as template)

### Step 2: Deploy on Railway

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub"
4. Select your bot repository
5. Railway will auto-detect Node.js and install dependencies

### Step 3: Configure Environment Variables

In Railway dashboard, go to "Variables" tab and add:

- `RPC_URL`: Your Solana RPC endpoint
- `PRIVATE_KEY`: Your wallet's base58 private key
- `COLLECTION_MINT`: Target NFT collection mint
- `SCAN_INTERVAL_MS`: `5000`
- `MIN_SIGNALS`: `1`
- `MIN_PROFIT_SOL`: `0.05`
- `FEE_BUFFER_SOL`: `0.02`

### Step 4: Deploy and Monitor

1. Click "Deploy" - build takes ~2-3 minutes
2. Monitor logs in Railway dashboard
3. Check for successful scans and trade executions

## 📊 Monitoring

### Logs
- **Console Logs**: Real-time in Railway dashboard
- **CSV Export**: `arb_pnl.csv` with trade history
- **JSON Logs**: `bot.log` with structured data

### Key Metrics
- Total trades executed
- Total profit in SOL
- Success rate
- Average profit per trade

## 🔧 Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `RPC_URL` | Solana RPC endpoint | Required |
| `PRIVATE_KEY` | Wallet private key (base58) | Required |
| `COLLECTION_MINT` | Target NFT collection | Required |
| `SCAN_INTERVAL_MS` | Scan frequency in milliseconds | 5000 |
| `MIN_SIGNALS` | Max signals to execute per cycle | 1 |
| `MIN_PROFIT_SOL` | Minimum profit threshold | 0.05 |
| `FEE_BUFFER_SOL` | Transaction fee buffer | 0.02 |

## 🛡️ Security Best Practices

1. **Never commit private keys** to version control
2. **Use environment variables** for all sensitive data
3. **Start with devnet** for testing
4. **Monitor wallet balance** regularly
5. **Use dedicated wallet** for the bot only

## 🐛 Troubleshooting

### Common Issues

1. **"Missing required environment variables"**
   - Ensure all required env vars are set in Railway

2. **"Insufficient balance"**
   - Fund your wallet with SOL for transaction fees

3. **"No opportunities found"**
   - Normal behavior - arbitrage opportunities are rare
   - Try different collections or adjust profit thresholds

4. **Build failures**
   - Check Railway build logs for specific errors
   - Ensure `package.json` has correct dependencies

### Getting Help

1. Check Railway deployment logs
2. Monitor bot console output
3. Review CSV logs for trade history
4. Verify wallet balance and RPC connectivity

## 📈 Performance Tips

1. **Use paid RPC** (Helius/QuickNode) for faster response times
2. **Monitor multiple collections** by running multiple instances
3. **Adjust scan intervals** based on market activity
4. **Set appropriate profit thresholds** to avoid spam trades

## ⚠️ Disclaimers

- **Educational Purpose**: This bot is for learning and experimentation
- **Financial Risk**: Trading involves risk of loss
- **No Guarantees**: Arbitrage opportunities are not guaranteed
- **Test First**: Always test on devnet before mainnet deployment

## 📄 License

MIT License - see LICENSE file for details.
