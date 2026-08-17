# Meme Trading Bot

This project will eventually become a **Solana meme-coin trading system**.

It is being built in small, safe checkpoints so you can learn as you go. You do not need to be an experienced trader or programmer to follow along.

## Current checkpoint: 12.5

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
- pm10_v1 simulated position management
- x11_v1 paper exit engine
- a12_v1 GROSS paper performance analytics
- r125_v1 strategy research / benchmark lab

### What this checkpoint is not

- **Blockchain capability: READ ONLY**
- **Local SQLite persistence: YES**
- **Backtester: YES**
- **Paper trading: YES**
- **Position management: YES**
- **Exit engine: YES**
- **Performance analytics: YES**
- **Strategy benchmark lab: YES**
- **Dashboard: NO**
- **Wallet: NO**
- **Signer: NO**
- **Transaction sending: NO**
- **Real trading: NO**

`ENTRY_CANDIDATE` is a strategy classification only. It does **not** create an order, buy, sell, or blockchain trade.

A p09_v1 **paper entry observation** records that frozen `s07_v1` classified a live snapshot as an entry candidate, using that snapshot’s exact `priceUsd` as a reference price. It is **not** an executable quote, fill, or position.

pm10_v1 may open a **simulated paper position** from that observation: one current open position per token mint, a fixed **$100** reference notional, and `quantity = 100 / entry price`. That $100 figure is a modeling reference, not real funds, not a bankroll, and not a recommendation for future live size.

x11_v1 may then **simulate a full close** of that open position using the **exact opening DEX pair**, a 10% stop, a 20% take profit, and a 6-hour maximum hold. Those thresholds are an experimental baseline. They are not optimized, not financial advice, and not evidence of live profitability.

a12_v1 may then **describe GROSS paper PnL and returns** for completed simulated closes already stored in SQLite. Those numbers exclude fees, slippage, and execution. They are not net performance, not a wallet result, and not a forecast. The current local database may have zero closed paper trades; that is not a 0% result.

r125_v1 may then **compare five fixed entry hypotheses** against the same historical SQLite dataset. Those comparisons reuse frozen c06 features, frozen x11 exits, and a12-compatible GROSS math. They do **not** prove a live edge, pick a winner, or optimize thresholds.

Features describe observations. They do **not** decide trades.

Risk findings are **technical indicators**, not investment recommendations. A report with no findings does **not** prove a token is safe.

Writing a SQLite row is a **local file write**. It is not a Solana transaction.

**First observed** means the first time _this database_ recorded a mint. It does **not** mean token launch time, mint-creation time, or listing time.

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

Checkpoint: 12.5
Blockchain capability: READ ONLY
Local persistence: available
Token risk scanner: available
Feature engine: available
Strategy evaluator: available
Backtester: available
Paper trading: available
Position management: available
Exit engine: available
Performance analytics: available
Strategy benchmark lab: available
Dashboard: unavailable
Trading capability: disabled
```

`npm run dev` does **not** start market, discovery, collector, risk, feature, strategy, backtest, paper, position, exit, performance, or research watchers, and it does **not** write database rows. It does **not** automatically run `paper:step`, `position:step`, `exit:step`, `performance:report`, `performance:trades`, `research:catalog`, `research:compare`, or `research:trades`.

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

## How to run simulated position management

Checkpoint 10 may open a simulated paper position from a p09_v1 entry observation. Spec `pm10_v1` uses a fixed $100 reference notional and `quantity = 100 / entry price`. It does **not** send a transaction or close a position.

```bash
npm run position:step -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

Show the current open paper position for one mint (`DATABASE_ENABLED=true`, no network, no current price or PnL):

```bash
npm run position:status -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

Show stored position evaluations for one mint:

```bash
npm run position:history -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

`paper:step` remains p09_v1 only. It does **not** create a position. A live result of `NO_ENTRY` / `NO_ACTION` / `NO_CHANGE` is acceptable. Do not weaken `s07_v1` to force an open. There is no `position:watch`.

See [docs/CHECKPOINT_10.md](docs/CHECKPOINT_10.md) for token-wide one-open-position rules, the $100 modeling limitation, and why entry rows are separate from current-open state.

## How to run a simulated paper exit

Checkpoint 11 may close a simulated open paper position. Spec `x11_v1` uses the **exact opening pair**, a 10% stop, a 20% take profit, a 6-hour max hold, and a 100% quantity close. It does **not** send a transaction or calculate PnL.

```bash
npm run exit:step -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

Show stored exit evaluations for one mint (`DATABASE_ENABLED=true`, no network, no re-evaluation):

```bash
npm run exit:history -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

If there is no current open paper position, `exit:step` is a successful no-op: no market request and no domain write. That is expected. Do not fabricate a live open position just to exercise a close. Synthetic tests cover stop, take-profit, max hold, and reopen.

`position:step` remains pm10 only. It does **not** run the exit engine. After a simulated close, `position:status` shows no current open position. Historical `paper_positions` entry rows remain. There is no `exit:watch`.

See [docs/CHECKPOINT_11.md](docs/CHECKPOINT_11.md) for exact-pair pricing, inclusive thresholds, decision precedence, zero-price handling, and stale-state protection.

## How to read GROSS paper performance analytics

Checkpoint 12 describes completed simulated paper trades already stored by x11. Spec `a12_v1` computes GROSS paper PnL and returns from immutable SQLite rows. It does **not** fetch a current price, send a transaction, or save analytics tables.

Stored quantity is used for PnL only after a12 proves it equals the frozen pm10_v1 fact `100 / entryPriceUsd` (`Object.is`, no tolerance). Source identities are recomputed from the loaded opening/exit facts using the frozen p09/pm10/x11 builders, then compared to the stored strings. Changing a price, quantity, pair, or timestamp while leaving identity text untouched fails the report.

Analytics numbers canonicalize IEEE `-0` to `+0`. That is not rounding. Dataset fingerprinting still uses semantic identities after that integrity check, never row ids.

`performance:report` and `performance:trades` both validate the complete eligible closed-trade set inside one SQLite deferred read snapshot. `PERFORMANCE_TRADE_LIMIT` only slices the printed trade list.

```bash
npm run performance:report
npm run performance:trades
```

`performance:report` requires `DATABASE_ENABLED=true` and an existing SQLite file. It opens that file **read-only**. It always uses every eligible closed paper trade. There is no date picker, token filter, or “best period” switch.

`performance:trades` only limits how many completed trades are **printed**. Default `PERFORMANCE_TRADE_LIMIT=20` (allowed `1..100`). That display bound does not change the aggregate report.

If the local database has no closed paper positions, the report status is `no_closed_trades`. That is not a 0% return and not a 0% win rate. Do not fabricate live trades to make the report look populated.

These GROSS paper numbers exclude fees, slippage, price impact, MEV, failed transactions, and partial fills. The stored exit price is an observed reference price, not a guaranteed fill. Gross paper results are not evidence of live profitability.

There is no `performance:watch`.

See [docs/CHECKPOINT_12.md](docs/CHECKPOINT_12.md) for beginner explanations of GROSS PnL, win rate, profit factor, closed-trade drawdown, and winner concentration.

## How to run the strategy research / benchmark lab

Phase 12.5 compares five **fixed** entry hypotheses against the **same** historical SQLite dataset. Spec `r125_v1` reconstructs frozen c06_v1 features point-in-time, uses frozen x11_v1 exits for every candidate, and reuses a12-compatible GROSS paper math. It does **not** send a transaction, write research tables, call the network, or declare a winner.

```bash
npm run research:catalog
npm run research:compare
npm run research:trades -- s07_baseline
```

`research:catalog` prints the five frozen candidates and their fingerprints. It contains **no** performance numbers.

`research:compare` requires `DATABASE_ENABLED=true` and an existing SQLite file. It opens that file **read-only**. It always uses the full r125 research universe. There is no date picker, token filter, “best period” switch, or threshold flag.

`research:trades` only limits how many completed **research** trades are **printed** for one candidate id. Default `RESEARCH_TRADE_LIMIT=20` (allowed `1..100`). That display bound does not change `research:compare`, the dataset fingerprint, or candidate metrics.

Zero entries, zero completed trades, or many unresolved positions is acceptable. Do not loosen candidate rules to make the report prettier. Do not call the highest historical GROSS PnL a proven strategy.

There is no `research:watch`, `research:optimize`, or `research:live`.

See [docs/CHECKPOINT_12_5.md](docs/CHECKPOINT_12_5.md) and [docs/STRATEGY_RESEARCH_SOURCES.md](docs/STRATEGY_RESEARCH_SOURCES.md).

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
  position/      pm10_v1 simulated single-open-position management (no automatic exits or PnL)
  exit/          x11_v1 experimental paper exit engine (exact opening pair, full close, no PnL)
  performance/   a12_v1 read-only GROSS closed-paper-trade analytics (no stored metric tables)
  research/      r125_v1 read-only strategy research / benchmark lab (no stored research tables)
  utils/         Small shared helpers
  index.ts       The program entry point
tests/           Automated tests (no live DEX Screener or Solana calls)
docs/            Project documents, including the roadmap
data/            Local runtime database files (ignored by git)
```

Later checkpoints will add a dashboard, then real execution. Those pieces are listed in [docs/ROADMAP.md](docs/ROADMAP.md). Checkpoint 13+ is **not** implemented yet.
