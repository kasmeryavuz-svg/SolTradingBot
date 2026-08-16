# Meme Trading Bot

This project will eventually become a **Solana meme-coin trading system**.

It is being built in small, safe checkpoints so you can learn as you go. You do not need to be an experienced trader or programmer to follow along.

## Current checkpoint: 03

**Current capabilities:**

- TypeScript foundation
- trading safety guard
- read-only Solana RPC
- read-only normalized market data
- manual watchlist
- automatic read-only candidate discovery
- DEX Screener profile feed
- DEX Screener boost feed
- Solana-only filtering
- mint deduplication
- best-effort market enrichment
- in-memory first-seen tracking

### What this checkpoint is not

- **NO wallet.**
- **NO signing.**
- **NO transactions.**
- **NO risk scanner.**
- **NO strategy.**
- **NO paper trading.**
- **NO real trading.**

A discovered token is a **candidate**: it appeared in a public feed. That is not a buy signal, a safety rating, or proof the token was newly minted.

If `TRADING_ENABLED=true`, the app will refuse to start. That is intentional. `DISCOVERY_ENABLED` does not turn trading on.

## What is discovery?

Discovery means the bot reads official public DEX Screener feeds and lists Solana token mints that appeared there.

- A **mint** is the unique token ID on Solana.
- A **latest profile** is provider profile metadata, not an on-chain launch.
- A **boost** is promotional provider metadata. It does not mean the token is good.

See [docs/CHECKPOINT_03.md](docs/CHECKPOINT_03.md) for a beginner explanation.

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

Checkpoint: 03
Mode: READ ONLY
```

`npm run dev` does **not** start `market:watch` or `discovery:watch`. Watchers are explicit commands only.

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

Press `CTRL+C` to stop.

## How to discover token candidates

```bash
npm run discovery:check
```

This reads the official DEX Screener latest-profile and latest-boost feeds once, keeps Solana mints only, deduplicates them, optionally asks the existing market-data module for a snapshot, prints the candidates, and exits.

To poll the same feeds about every 30 seconds:

```bash
npm run discovery:watch
```

Press `CTRL+C` to stop. `NEW` means “new to this running process,” not “newly minted on Solana.” The watcher does not save data to a database yet.

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
  config/        Reads settings such as NODE_ENV, TRADING_ENABLED, Solana RPC, watchlist, and discovery
  core/          Startup, banner, and safety checks
  solana/        Read-only Solana RPC client and health check
  market-data/   Read-only DEX market snapshots and watchlist
  discovery/     Read-only public-feed candidate discovery
  utils/         Small shared helpers
  index.ts       The program entry point
tests/           Automated tests (no live DEX Screener or Solana calls)
docs/            Project documents, including the roadmap
```

Later checkpoints will add a database, a risk scanner, and strategies. Those pieces are listed in [docs/ROADMAP.md](docs/ROADMAP.md). They are **not** implemented yet.
