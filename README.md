# Meme Trading Bot

This project will eventually become a **Solana meme-coin trading system**.

It is being built in small, safe checkpoints so you can learn as you go. You do not need to be an experienced trader or programmer to follow along.

## Current checkpoint: 17

**Checkpoint 17 is a read-only strategy-optimization research lab.** It does **not** send transactions and does **not** connect strategy signals to the Checkpoint 16 broadcaster.

Checkpoint 16 already introduced code capable of transmitting real funds. That capability remains **manual, hard-capped, and single-shot**. It is not an automatic trading bot. CP17 does not call it.

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
- d13_v1 local read-only observability dashboard
- e14_v1 Jupiter V2 unsigned swap preflight engine
- w15_v1 interactive in-memory signer security boundary
- l16_v1 manual single-shot tiny mainnet RPC broadcaster
- o17_v1 anchored walk-forward / cost-stress strategy-optimization lab

### What this checkpoint is not

- **Blockchain capability: READ ONLY by default**
- **Local SQLite persistence: YES**
- **Backtester: YES**
- **Paper trading: YES**
- **Position management: YES**
- **Exit engine: YES**
- **Performance analytics: YES**
- **Strategy benchmark lab: YES**
- **Strategy optimization lab: YES (read-only walk-forward research; no live promotion)**
- **Dashboard: YES (local, read-only, frozen d13 — no live controls)**
- **Execution preflight: YES (terminal-only, unsigned until an explicit wallet or live command)**
- **Wallet security boundary: YES (interactive memory signer, hidden TTY only)**
- **Signing: YES (manual/local only)**
- **Manual tiny-live broadcast: YES (WSOL→USDC only, ≤0.001 SOL/attempt, ≤0.002 SOL/day, ≤2 attempts/day)**
- **Automatic live trading: NO**
- **Jito: NO**
- **Arbitrary meme-coin live entry: NO**
- **Dashboard execution: NO**

`live:execute` can send **one** standard Solana RPC transaction after every l16 gate. It cannot run continuously, cannot retry automatically, and cannot trade strategy signals.

An RPC `sendTransaction` success is **not** chain confirmation. A client timeout is **not** proof the transaction was unsent. Use `live:reconcile` with the stored expected txid. Do not resend.

`ENTRY_CANDIDATE` is a strategy classification only. It does **not** create an order, buy, sell, or blockchain trade.

A p09_v1 **paper entry observation** records that frozen `s07_v1` classified a live snapshot as an entry candidate, using that snapshot’s exact `priceUsd` as a reference price. It is **not** an executable quote, fill, or position.

pm10_v1 may open a **simulated paper position** from that observation: one current open position per token mint, a fixed **$100** reference notional, and `quantity = 100 / entry price`. That $100 figure is a modeling reference, not real funds, not a bankroll, and not a recommendation for future live size.

x11_v1 may then **simulate a full close** of that open position using the **exact opening DEX pair**, a 10% stop, a 20% take profit, and a 6-hour maximum hold. Those thresholds are an experimental baseline. They are not optimized, not financial advice, and not evidence of live profitability.

a12_v1 may then **describe GROSS paper PnL and returns** for completed simulated closes already stored in SQLite. Those numbers exclude fees, slippage, and execution. They are not net performance, not a wallet result, and not a forecast. The current local database may have zero closed paper trades; that is not a 0% result.

r125_v1 may then **compare five fixed entry hypotheses** against the same historical SQLite dataset. Those comparisons reuse frozen c06 features, frozen x11 exits, and a12-compatible GROSS math. They do **not** prove a live edge, pick a winner, or optimize thresholds.

o17_v1 may then **run an anchored chronological walk-forward** over a frozen catalog of 8 entries and 5 exits, with LOW/BASE/STRESS all-in friction *assumptions*. TRAIN may select. TEST/OOS may only measure. Promotion language is only `NO_PROMOTION_INSUFFICIENT_DATA`, `NO_PROMOTION_FAILED_ROBUSTNESS`, or `ELIGIBLE_FOR_FORWARD_PAPER_VALIDATION`. The last one is **not** live approval and does **not** edit s07 or the paper engine.

Checkpoint 13 adds a **local loopback-only read-only observability dashboard**. It visualizes already-stored market observations, runtime paper state, a12 GROSS performance, r125 research, and database health. It does **not** buy, sell, start collectors, change thresholds, or talk to Solana / DEX Screener. That dashboard stays frozen in Checkpoint 14. It has no BUILD / SIMULATE / SIGN / SEND buttons.

Checkpoint 14 adds an **unsigned Jupiter Swap API V2 preflight engine**. `execution:build` requests a real `/swap/v2/build` route and compiles a real unsigned v0 message. `execution:simulate` then estimates compute units on Solana RPC and requires a second simulation against an explicit CU limit. That is **not** a send. Quoted output is not guaranteed execution output. Simulation passed is not a guarantee of landing and not a profit result.

Checkpoint 15 adds the **wallet security and signing boundary**. A Solana keypair may be loaded into memory from a hidden interactive TTY, checked against `EXECUTION_TAKER_PUBKEY`, and used to sign either a domain-separated self-test or the exact e14 `simulation_passed` candidate. The signed wire is verified locally and discarded. That is **not** a broadcast. Never paste a private key into source, chat, `.env`, or a command argument.

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
Trading capability: MANUAL / HARD-CAPPED ONLY

Solana:
Network: mainnet-beta
RPC: connected
Slot: 123456789
Version: 2.x.x
Health: ok

Checkpoint: 17
Blockchain capability: READ ONLY by default
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
Strategy optimization lab: available
Dashboard: available
Execution preflight: available
Wallet security: available
Manual tiny-live broadcaster: available
Automatic live trading: unavailable
Jito: unavailable
Dashboard live controls: unavailable
Signing: manual/local only
Trading capability: MANUAL / HARD-CAPPED ONLY
```

`npm run dev` does **not** start market, discovery, collector, risk, feature, strategy, backtest, paper, position, exit, performance, research, optimization, dashboard, execution, wallet, or live commands, and it does **not** write database rows. It does **not** automatically run `paper:step`, `position:step`, `exit:step`, `performance:report`, `performance:trades`, `research:catalog`, `research:compare`, `research:trades`, `optimization:run`, `dashboard:start`, `execution:build`, `execution:simulate`, `wallet:verify`, `wallet:sign-test`, `wallet:sign-preflight`, `live:preview`, or `live:execute`. It does **not** prompt for a wallet secret and it does **not** send.

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

## How to run strategy optimization research

Checkpoint 17 is a **controlled walk-forward lab**. Spec `o17_v1`. It answers whether frozen entry/exit hypotheses survive chronological out-of-sample testing and conservative friction assumptions. It does **not** prove future profitability.

```bash
npm run optimization:status
npm run optimization:catalog
npm run optimization:data
npm run optimization:run
npm run optimization:folds
```

`optimization:status` and `optimization:catalog` need no database. They print identity, the frozen 8×5 catalog, and cost assumptions. Catalog output contains **no** performance numbers and does **not** rank candidates.

`optimization:data`, `optimization:run`, and `optimization:folds` require `DATABASE_ENABLED=true` and an existing SQLite file opened **read-only**. They reuse the exact conservative r125 universe (including exclusion of snapshots referenced by `exit_evaluations`). There is no date picker, token filter, or threshold flag.

Output distinguishes three readiness flags: time partitions constructible, walk-forward evaluable, and promotion data sufficient. Partitions can exist while evaluation is impossible.

**TRAIN** may select one entry (against frozen `x11_baseline`) then one exit. **TEST/OOS** only measures that frozen pair plus two controls (`s07+x11` and `quality_control+x11`). OOS never re-ranks. Aggregate selected OOS is the walk-forward **selection methodology**, not one frozen strategy unless every fold picked the same pair.

Quantity = `$100 / gross reference entry price`. Effective cash outlay under LOW/BASE/STRESS **may exceed $100**. Triggers stay on the GROSS path. Frozen `x11_baseline` keeps observed-take fills; new o17 exits use target-take fills. Stage B is not a perfectly normalized execution comparison.

The 24h fold cutoff is the maximum configured clock window inside the fold. It does not guarantee a closing observation.

**TRAIN** may select one entry (against frozen `x11_baseline`) then one exit. **TEST/OOS** only measures that frozen pair plus two controls (`s07+x11` and `quality_control+x11`). OOS never re-ranks.

Cost scenarios (LOW 75/75 bps, BASE 200/200, STRESS 500/500) are **all-in research allowances**, not measured historical execution cost. Gross PnL is never overwritten by net.

Partial/moonbag exits are tested on **observed snapshots only**. There is no interpolated high/low path and no assumed 2x/5x/10x remainder.

Allowed final statuses:

- `NO_PROMOTION_INSUFFICIENT_DATA`
- `NO_PROMOTION_FAILED_ROBUSTNESS`
- `ELIGIBLE_FOR_FORWARD_PAPER_VALIDATION`

The last one is a candidate for a **future paper period**. It does **not** edit s07, enable paper automatically, or approve live trading.

There is no `optimization:live`, `optimization:auto`, `optimization:watch`, `optimization:deploy`, `optimization:send`, or `optimization:paper-promote`.

See [docs/CHECKPOINT_17.md](docs/CHECKPOINT_17.md) and [docs/STRATEGY_OPTIMIZATION_SOURCES.md](docs/STRATEGY_OPTIMIZATION_SOURCES.md).

## How to open the local observability dashboard

Checkpoint 13 serves a **local read-only** browser UI over stored evidence. Spec `d13_v1`. It is **not** a trading console.

```bash
npm run dashboard:start
```

Default URL: [http://127.0.0.1:4313](http://127.0.0.1:4313)

The process binds **only** to `127.0.0.1`. There is no `DASHBOARD_HOST`. Optional `DASHBOARD_PORT` (default `4313`, allowed `1024..65535`) is operational configuration only.

**LOCAL ONLY. READ ONLY. NO WALLET. NO EXECUTION. NO LIVE TRADING CONTROLS.**

The dashboard shows:

- Latest stored market observations (not live prices)
- Runtime paper lifecycle (p09/pm10/x11), separate from research trades
- a12 GROSS paper performance (not net, not live)
- r125 historical research comparison (not optimized, not ranked)
- Database / data health facts (no invented quality score)

It does **not** call Solana RPC, DEX Screener, or any third-party HTTP API. It does **not** start collectors. It does **not** run `paper:step`, `position:step`, or `exit:step`. If `TRADING_ENABLED=true`, `dashboard:start` refuses to start because Checkpoint 13 is read-only only.

The HTML/JS/CSS files live in `src/dashboard/public`. `npm run build` does **not** copy them into `dist`. `dashboard:start` uses `tsx` and those source assets. `dist` is not a packaged dashboard. Sections are rebuilt independently; this is not one atomic database snapshot. Market values are latest stored observations, not live prices.

Zero runtime trades or many research `insufficient_data` rows is a valid empty state. That is not a 0% win rate.

Press `CTRL+C` to stop. `npm run dev` does **not** start the dashboard.

See [docs/CHECKPOINT_13.md](docs/CHECKPOINT_13.md).

## How to run unsigned execution preflight

Checkpoint 14 compiles a real Jupiter Swap API V2 route into an unsigned Solana v0 message and can simulate it. Spec `e14_v1`. It does **not** sign, send, or touch paper/research state.

```bash
npm run execution:status
npm run execution:build
npm run execution:simulate
```

`execution:status` is local only: no network, no database writes. It shows the e14 spec, whether public config is present, and that signing / wallet / broadcast / Jito send are unavailable.

`execution:build` and `execution:simulate` require all four public fields. There is no default wallet, token, or amount:

```text
EXECUTION_TAKER_PUBKEY=
EXECUTION_INPUT_MINT=
EXECUTION_OUTPUT_MINT=
EXECUTION_AMOUNT_RAW=
```

`amountRaw` is the input token’s **smallest native units**, not a USD size. Example: `1000000`.

`execution:simulate` does **not** send funds. Jupiter `/build` is real provider data. Solana simulation is real RPC preflight. The first CU estimate may replace the recent blockhash. The second simulation uses the exact Jupiter blockhash (`replaceRecentBlockhash: false`). 100 bps slippage is a frozen e14 test contract, not a “safe” or “optimal” setting.

The CLI reports a **calculated priority-fee component** and a separate **RPC transaction-fee estimate** from `getFeeForMessage` on the final message. Those two numbers are not added together. `getFeeForMessage` is the cluster charge for that message and may already include a priority component.

`execution:simulate` also checks `getGenesisHash` against the official mainnet-beta genesis. Setting `SOLANA_NETWORK=mainnet-beta` while pointing `SOLANA_RPC_URL` at another cluster is refused.

These commands refuse if `TRADING_ENABLED=true` and refuse `execution:build` / `execution:simulate` unless `SOLANA_NETWORK=mainnet-beta`.

Do **not** paste a private key into this project, `.env`, source, or chat.

There is no `execution:watch`, `execution:send`, or `execution:jito`.

See [docs/CHECKPOINT_14.md](docs/CHECKPOINT_14.md) and [docs/EXECUTION_SOURCES.md](docs/EXECUTION_SOURCES.md).

## How to use the wallet security boundary

Checkpoint 15 can load a trading-wallet secret into memory from a hidden TTY, prove it matches `EXECUTION_TAKER_PUBKEY`, and sign the exact e14 preflight candidate. Spec `w15_v1`. It does **not** broadcast. It does **not** accept a private key from `.env`, a file, a seed phrase, or command arguments.

```bash
npm run wallet:status
npm run wallet:verify
npm run wallet:sign-test
npm run wallet:sign-preflight
```

`wallet:status` is local only: no secret, no network, no database writes. It shows the w15 spec, that secrets are hidden-TTY-only, and that broadcast / Jito / dashboard signing are unavailable.

`wallet:verify` and `wallet:sign-test` prompt on an interactive terminal. Typed characters are not echoed. They do not call Jupiter or Solana RPC.

`wallet:sign-preflight` may call the same Jupiter `/build` and Solana RPC endpoints already used by Checkpoint 14. All expensive preflight happens before unlock. After unlock, the only network call is one bounded block-height expiry recheck. It prompts for the secret **only after** e14 status is `simulation_passed`, then signs the exact e14 final compiled message. The signed transaction is verified locally and discarded. The command result is a public proof, not a sendable byte string. Do not import a generic signer from `src/wallet`.

Never paste a private key into source, chat, `.env`, or `npm run` arguments. Shell history is not a keystore.

The interactive-memory backend is a local controlled signer. It is not unattended production custody. A later Keychain / KMS / HSM backend can replace it without changing strategy or execution logic.

There is no `wallet:send`, `wallet:broadcast`, `wallet:export`, or `wallet:generate`. Broadcast lives in Checkpoint 16 `live:execute` only.

See [docs/CHECKPOINT_15.md](docs/CHECKPOINT_15.md) and [docs/WALLET_SECURITY_SOURCES.md](docs/WALLET_SECURITY_SOURCES.md).

## How to use the manual tiny-live broadcaster

Checkpoint 16 can transmit real funds. Spec `l16_v1`. It is **not** automatic trading.

Frozen pair: **WSOL → USDC only**. Maximum **0.001 SOL** input per attempt, **0.002 SOL** of broadcast-at-risk input per UTC day, and **2** such attempts per UTC day. Standard Solana RPC only. One `sendTransaction` call. No automatic retry. No Jito. No Jupiter `/execute` or `/submit`. No dashboard SEND button. No arbitrary meme mint.

```bash
npm run live:status
npm run live:preview
npm run live:execute
npm run live:history
npm run live:reconcile
```

`live:status` is local only.

`live:preview` may call Jupiter `/build` and Solana RPC. It cannot sign or send.

`live:execute` requires **both** `TRADING_ENABLED=true` and `LIVE_BROADCAST_ENABLED=true`, then an exact TTY phrase:

```text
LIVE SEND <candidate-short-id> <amountRaw>
```

Only after that phrase does the hidden wallet prompt appear. There is no `--yes`. Piped stdin is refused.

RPC send success is not chain confirmation. A timeout is not proof the transaction was unsent. If the outcome is ambiguous, run `live:reconcile`. It uses the stored expected txid. It never broadcasts.

Do **not** run `live:execute` in automated tests or during implementation. The first real 0.001 SOL-or-less plumbing test is an explicit operator action after hostile audit and merge.

See [docs/CHECKPOINT_16.md](docs/CHECKPOINT_16.md) and [docs/LIVE_EXECUTION_SOURCES.md](docs/LIVE_EXECUTION_SOURCES.md).

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
  optimization/  o17_v1 read-only anchored walk-forward strategy-optimization lab (no stored result tables)
  dashboard/     d13_v1 local loopback-only read-only observability dashboard (no stored dashboard tables)
  execution/     e14_v1 Jupiter V2 unsigned swap preflight engine (no wallet, no sign, no send)
  wallet/        w15_v1 interactive in-memory signer (hidden TTY, no persist, no send)
  live/          l16_v1 manual tiny WSOL→USDC RPC broadcaster (one send, no automation)
  utils/         Small shared helpers
  index.ts       The program entry point
tests/           Automated tests (no live DEX Screener or Solana calls unless a test explicitly injects them)
docs/            Project documents, including the roadmap
data/            Local runtime database files (ignored by git)
```

Checkpoint 18 will focus wallet intelligence. That piece is listed in [docs/ROADMAP.md](docs/ROADMAP.md) and is **not** implemented yet. o17 promotion means forward paper validation only. It does not activate strategy automation or live broadcast.
