# Meme Trading Bot

This project will eventually become a **Solana meme-coin trading system**.

It is being built in small, safe checkpoints so you can learn as you go. You do not need to be an experienced trader or programmer to follow along.

## Current checkpoint: 09

**Current capabilities:**

- TypeScript foundation
- hard trading safety guard
- read-only Solana RPC
- live market observations
- discovery
- SQLite persistence
- technical risk scanner
- c06_v1 feature engine
- s07_v1 strategy
- b08_v1 historical backtester
- p09_v1 live paper-entry observation

### What this checkpoint is not

- **Blockchain capability: READ ONLY**
- **Local SQLite persistence: YES**
- **Backtester: YES**
- **Paper trading foundation: YES**
- **Position management: NO**
- **Exit engine: NO**
- **Wallet: NO**
- **Signer: NO**
- **Transaction sending: NO**
- **Real trading: NO**

`ENTRY_CANDIDATE` is a strategy classification only. It does **not** create an order, buy, sell, or blockchain trade.

A p09_v1 **paper entry observation** records that frozen `s07_v1` classified a live snapshot as an entry candidate, using that snapshot’s exact `priceUsd` as a reference price. It is **not** an executable quote, fill, or position. It does not model slippage, fees, DEX execution, latency, MEV, size, or liquidity impact. There is no quantity or virtual balance yet.

Features describe observations. They do **not** decide trades.

Risk findings are **technical indicators**, not investment recommendations. A report with no findings does **not** prove a token is safe.

Writing a SQLite row is a **local file write**. It is not a Solana transaction.

**First observed** means the first time *this database* recorded a mint. It does **not** mean token launch time, mint-creation time, or listing time.

If `TRADING_ENABLED=true`, the app will refuse to start. `DATABASE_ENABLED` and `DISCOVERY_ENABLED` do not turn trading on.

## What is a risk scan?

The bot can already discover tokens and store market snapshots. Checkpoint 05 inspects on-chain mint facts: authorities, Token-2022 extensions, supply, and the largest **token accounts**.

`getTokenLargestAccounts` does not return beneficial owners. A large account may be a DEX vault, a program, or something else.

See [docs/CHECKPOINT_05.md](docs/CHECKPOINT_05.md) for a beginner explanation.

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

Checkpoint: 09
Blockchain capability: READ ONLY
Local persistence: available
Token risk scanner: available
Feature engine: available
Strategy evaluator: available
Backtester: available
Paper trading: available
Position management: unavailable
Trading capability: disabled
```

`npm run dev` does **not** start market, discovery, collector, risk, feature, strategy, backtest, or paper watchers, and it does **not** write database rows. It does **not** automatically run `paper:step`.

## How to check Solana, market data, and discovery

These commands stay look-only. They do not write the database:

```bash
npm run solana:check
npm run market:check
npm run market:watch
npm run discovery:check
npm run discovery:watch
```

## How to scan token risk

Read-only scan (no database required):

```bash
npm run risk:check -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

Scan and persist one report (`DATABASE_ENABLED=true`):

```bash
npm run risk:record -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

Show stored risk history for one mint:

```bash
npm run risk:history -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

The collector does **not** automatically risk-scan every discovered candidate.

## How to build feature vectors

Read-only feature check (no database required). Previous-snapshot features are normally unavailable because this command does not read history:

```bash
npm run feature:check -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

Scan current market and risk sources, then persist one feature vector (`DATABASE_ENABLED=true`):

```bash
npm run feature:record -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

Show stored feature history for one mint:

```bash
npm run feature:history -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

`collect:once`, `collect:watch`, and `risk:record` do **not** generate feature vectors automatically.

See [docs/CHECKPOINT_06.md](docs/CHECKPOINT_06.md) for a beginner explanation of features, point-in-time rules, and lookahead bias.

## How to evaluate the first strategy

`s07_v1` is an experimental baseline classifier. It interprets a `c06_v1` feature vector and returns `ENTRY_CANDIDATE`, `NO_ENTRY`, or `INSUFFICIENT_DATA`. None of those create an order.

Read-only strategy check (no database required):

```bash
npm run strategy:check -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

Collect live features, evaluate `s07_v1`, and persist the bundle (`DATABASE_ENABLED=true`):

```bash
npm run strategy:record -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

Show stored strategy evaluations for one mint:

```bash
npm run strategy:history -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

`collect:once`, `collect:watch`, `risk:record`, and `feature:record` do **not** run the strategy automatically. There is no `strategy:watch`.

See [docs/CHECKPOINT_07.md](docs/CHECKPOINT_07.md) for a beginner explanation of rules, classifications, and why thresholds are frozen.

## How to run the historical backtester

Checkpoint 08 replays stored market snapshots through frozen `s07_v1`. It is a **fixed-horizon historical strategy event study**, not trading.

Backtest spec `b08_v1`:

- every stored market snapshot is classified independently
- historical as-of time is `market.collectedAt`
- 15-minute fixed horizon (`900` seconds)
- 120-second outcome tolerance
- same pair only
- earliest same-pair snapshot in the outcome window
- `grossForwardReturnPct` is a gross price return
- no transaction costs, slippage, fees, positions, or paper trading

Replay all stored tokens:

```bash
npm run backtest:run
```

Replay one mint:

```bash
npm run backtest:run -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

`backtest:run` requires `DATABASE_ENABLED=true` and an existing SQLite file. It opens that file **read-only**. It does not create a missing database, run migrations, or write rows. If the file is missing, run `npm run db:init` as a separate command first.

The backtest covers only observations this local bot actually stored. It is not the entire Solana market, all meme coins, or all pair launches. Consecutive `ENTRY_CANDIDATE` events can overlap; they are not executed trades.

A positive average gross forward return on this sample would still **not** mean the strategy is profitable. Execution costs are excluded. Future performance is not established.

See [docs/CHECKPOINT_08.md](docs/CHECKPOINT_08.md) for point-in-time replay, outcome windows, and dataset bias.

## How to run a live paper-entry observation

Checkpoint 09 records what frozen `s07_v1` would do on one live snapshot. Spec `p09_v1` copies the exact strategy market reference price. It does **not** size an order, open a position, or send a transaction.

```bash
npm run paper:step -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

Show stored paper evaluations for one mint (`DATABASE_ENABLED=true`, no network):

```bash
npm run paper:history -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

`paper:step` may add market, risk, feature, strategy, and paper rows. That is expected. Blockchain state does not change.

A live result of `NO_ENTRY` / `NO_ACTION` is acceptable. Do not weaken `s07_v1` to force an entry observation. There is no `paper:watch`.

See [docs/CHECKPOINT_09.md](docs/CHECKPOINT_09.md) for the difference between strategy classification, paper observation, position, and a real trade.

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
  risk/          Read-only token risk scan, evaluator, and risk commands
  features/      Deterministic feature engine and feature commands
  strategy/      Experimental s07_v1 entry-candidate classifier and strategy commands
  backtest/      Read-only historical b08_v1 event study for frozen s07_v1
  paper/         p09_v1 live paper-entry observation (no quantity or positions)
  utils/         Small shared helpers
  index.ts       The program entry point
tests/           Automated tests (no live DEX Screener or Solana calls)
docs/            Project documents, including the roadmap
data/            Local runtime database files (ignored by git)
```

Later checkpoints will add position management and an exit engine. Those pieces are listed in [docs/ROADMAP.md](docs/ROADMAP.md). They are **not** implemented yet.
