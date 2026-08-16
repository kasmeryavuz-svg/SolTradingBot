# Checkpoint 01 — Read-only Solana connection

This checkpoint teaches the bot to **look** at Solana. It still cannot **do** anything on Solana.

## What was built

The app can now talk to a Solana RPC server. RPC is a simple question-and-answer connection. We ask for public information and print the answer.

The health check asks:

- What is the current slot? (a slot is Solana’s way of counting time on the network)
- What software version is the node running?
- Is the node healthy?

## What was not built

- No wallet
- No private key
- No seed phrase
- No transaction sending
- No swaps
- No trading

`TRADING_ENABLED` must stay `false`. If you set it to `true`, the app still refuses to start.

## RPC URL

The default URL is the official public mainnet endpoint:

`https://api.mainnet-beta.solana.com`

That is fine for learning. It is not a production trading setup, because public RPC servers often rate-limit requests and can be slow or unavailable.

You can change `SOLANA_RPC_URL` in your environment. Do not put API keys into git. The app will not print full RPC URLs if they contain credentials.

## Commands

```bash
npm run solana:check
npm run dev
```
