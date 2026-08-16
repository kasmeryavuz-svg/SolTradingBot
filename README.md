# Meme Trading Bot

This project will eventually become a **Solana meme-coin trading system**.

It is being built in small, safe checkpoints so you can learn as you go. You do not need to be an experienced trader or programmer to follow along.

## Current checkpoint: 02

**Current capabilities:**

- TypeScript project foundation
- configuration
- hard trading safety guard
- read-only Solana RPC health
- read-only DEX market-data retrieval
- manual token watchlist
- normalized `MarketSnapshot`
- one-shot market check
- low-frequency live market watch

### What this checkpoint is not

- **NO wallet.**
- **NO private key.**
- **NO transaction signing.**
- **NO transaction sending.**
- **NO token discovery.**
- **NO strategy.**
- **NO paper trading.**
- **NO real trading.**

Market data is **information only**. A price, a volume spike, or a large market cap does not mean a token is a good investment.

If `TRADING_ENABLED=true`, the app will refuse to start. That is intentional.

## What is market data?

Market data is a snapshot of what a token looks like on a DEX right now: price, liquidity, recent volume, and how many buys and sells happened. This bot reads that information. It does not trade on it yet.

The watchlist uses **mint addresses**, not ticker symbols. Many tokens can share a name like “SOL” or “PEPE”. A mint address is the unique ID of the token on Solana.

**Wrapped SOL** (`So1111...112`) is the tokenized form of SOL that Solana token programs and DEX pools commonly use. It represents SOL inside those pools.

## How to install dependencies

1. Install [Node.js](https://nodejs.org/) version 20.18 or newer.
2. Open a **new** terminal in this project folder.
3. If `node` or `npm` is not recognized, Node.js may be installed but not on your PATH. On Windows it is often at `C:\Program Files\nodejs`. Restart the terminal after installing Node.js.
4. Run:

```bash
npm install
```

## How to run the project

Copy the example environment file (optional — defaults already match this file):

```bash
copy .env.example .env
```

On macOS or Linux, use `cp .env.example .env` instead.

Then start the app:

```bash
npm run dev
```

You should see something like:

```text
Meme Trading Bot
Mode: development
Trading capability: disabled

Solana:
Network: mainnet-beta
RPC: connected
Slot: 123456789
Version: 2.x.x
Health: ok

Checkpoint: 02
Mode: READ ONLY
```

`npm run dev` does **not** start an infinite market-data loop. Use the market commands below for that.

## How to check Solana connectivity

```bash
npm run solana:check
```

## How to check market data

```bash
npm run market:check
```

This reads the manual watchlist once (Wrapped SOL and USDC by default), prints a snapshot for each token, and exits.

To watch the same list at a low frequency (every 15 seconds by default):

```bash
npm run market:watch
```

Press `CTRL+C` to stop. The watcher does not save data to a database yet.

Public DEX Screener and Solana RPC endpoints are acceptable for development. They are **not** appropriate for a production trading bot because of rate limits and reliability.

## How to run tests

```bash
npm run test
```

Automated tests do not call the live internet.

Other useful commands:

```bash
npm run typecheck
npm run lint
npm run format
npm run build
```

## Folder explanation

```text
src/             Application source code
  config/        Reads settings such as NODE_ENV, TRADING_ENABLED, Solana RPC, and the watchlist
  core/          Startup, banner, and safety checks
  solana/        Read-only Solana RPC client and health check
  market-data/   Read-only DEX market snapshots and watchlist
  utils/         Small shared helpers
  index.ts       The program entry point
tests/           Automated tests (no live DEX Screener or Solana calls)
docs/            Project documents, including the roadmap
```

Later checkpoints will add token discovery, a database, and strategies. Those pieces are listed in [docs/ROADMAP.md](docs/ROADMAP.md). They are **not** implemented yet.

See [docs/CHECKPOINT_02.md](docs/CHECKPOINT_02.md) for a beginner explanation of price, liquidity, volume, market cap, and FDV.
