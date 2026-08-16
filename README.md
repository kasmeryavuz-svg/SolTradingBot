# Meme Trading Bot

This project will eventually become a **Solana meme-coin trading system**.

It is being built in small, safe checkpoints so you can learn as you go. You do not need to be an experienced trader or programmer to follow along.

## Current checkpoint: 04

**Current capabilities:**

- TypeScript foundation
- hard trading safety guard
- read-only Solana RPC
- normalized DEX market data
- automatic Solana token discovery
- local SQLite persistence
- schema migrations
- historical discovery runs
- historical source-health records
- historical candidate observations
- historical market snapshots
- explicit persistent collector
- database status/history inspection

### What this checkpoint is not

- **Blockchain capability: READ ONLY**
- **Local database writes: YES**
- **Wallet: NO**
- **Transaction signing: NO**
- **Blockchain transaction sending: NO**
- **Risk scanner: NO**
- **Strategy: NO**
- **Paper trading: NO**
- **Real trading: NO**

Writing a SQLite row is a **local file write**. It is not a Solana transaction.

**First observed** means the first time *this database* recorded a mint. It does **not** mean token launch time, mint-creation time, or listing time.

If `TRADING_ENABLED=true`, the app will refuse to start. `DATABASE_ENABLED` and `DISCOVERY_ENABLED` do not turn trading on.

## What is persistence?

The bot can already discover tokens and read market snapshots. Without a database, that information disappears when the process exits.

Checkpoint 04 stores those facts in a local SQLite file so we can later ask: when did we first see this mint, which sources reported it, and how did its stored snapshots change over time?

See [docs/CHECKPOINT_04.md](docs/CHECKPOINT_04.md) for a beginner explanation.

## How to install dependencies

1. Install [Node.js](https://nodejs.org/) version **24.15.0 or newer**. This checkpoint uses the built-in `node:sqlite` module.
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

Checkpoint: 04
Blockchain capability: READ ONLY
Local persistence: available
Trading capability: disabled
```

`npm run dev` does **not** start market, discovery, or collector watchers, and it does **not** write database rows.

## How to check Solana, market data, and discovery

These commands stay look-only. They do not write the database:

```bash
npm run solana:check
npm run market:check
npm run market:watch
npm run discovery:check
npm run discovery:watch
```

## How to use the local database

Initialize the SQLite file and apply migrations:

```bash
npm run db:init
```

Inspect counts and integrity:

```bash
npm run db:status
```

Discover, enrich, and persist one historical cycle:

```bash
npm run collect:once
```

Repeat that cycle on the discovery poll interval:

```bash
npm run collect:watch
```

Press `CTRL+C` to stop. The collector closes the database before exit.

Show bounded recent market history for one mint:

```bash
npm run db:history -- So11111111111111111111111111111111111111112
```

The live database file defaults to `./data/soltradingbot.sqlite`. Git ignores it. Schema migrations are committed; data files are not.

Public DEX Screener and Solana RPC endpoints are acceptable for development. They are **not** appropriate for a production trading bot because of rate limits and reliability.

## How to run tests

```bash
npm run test
```

Automated tests do not call the live internet. They use `:memory:` or temporary SQLite files.

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
  config/        Reads settings such as NODE_ENV, TRADING_ENABLED, discovery, and DATABASE_PATH
  core/          Startup, banner, and safety checks
  solana/        Read-only Solana RPC client and health check
  market-data/   Read-only DEX market snapshots and watchlist
  discovery/     Read-only public-feed candidate discovery
  persistence/   SQLite repository, migrations, and db commands
  collector/     Discover + persist orchestration (no SQL)
  utils/         Small shared helpers
  index.ts       The program entry point
tests/           Automated tests (no live DEX Screener or Solana calls)
docs/            Project documents, including the roadmap
data/            Local runtime database files (ignored by git)
```

Later checkpoints will add a risk scanner and strategies. Those pieces are listed in [docs/ROADMAP.md](docs/ROADMAP.md). They are **not** implemented yet.
