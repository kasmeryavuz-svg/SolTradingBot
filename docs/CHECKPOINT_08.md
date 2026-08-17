# Checkpoint 08 — Deterministic historical backtester

This checkpoint measures the frozen Checkpoint 07 strategy against history this bot actually stored. It does not trade.

## What a backtest is here

A backtest asks a historical question:

If `s07_v1` had been evaluated immediately when each stored market snapshot was collected, using only information known at that time, what classification would it have produced?

For `ENTRY_CANDIDATE` events only, it also asks:

What was the stored same-pair token price about 15 minutes later?

That is a **fixed-horizon historical strategy event study**. It is research output.

## What a backtest is not

A backtest is **not live trading**. Nothing is sent to Solana. There is no wallet, signer, or transaction.

A backtest is **not paper trading**. Paper trading (Checkpoint 09) would simulate fills and positions over time. Checkpoint 08 does not open positions, size orders, or apply stop-loss / take-profit logic.

Do not describe these rows as trades. Prefer:

- strategy event
- `ENTRY_CANDIDATE` event
- reference price
- future price observation
- gross forward price return

There is no fill price and no realized PnL.

## Frozen strategy

`s07_v1` was frozen **before** this backtest existed. Checkpoint 08 measures it. It does not improve it.

- Strategy version: `s07_v1`
- Strategy name: `conservative_flow_momentum_baseline`
- Required feature set: `c06_v1`
- Backtest spec: `b08_v1` (`fixed_horizon_gross_price_outcome`)

Thresholds, rules, and the strategy fingerprint must stay exactly as Checkpoint 07 left them. A noisy, empty, or mostly `NO_ENTRY` result is acceptable. Do not retune `s07_v1` because a backtest looks bad. Strategy optimization is Checkpoint 17.

## Point-in-time replay

Each stored market snapshot is replayed independently.

```text
historical market snapshot
        ↓
point-in-time c06_v1 FeatureVector
        ↓
frozen s07_v1 evaluator
        ↓
historical strategy classification
        ↓
fixed-horizon FUTURE PRICE OUTCOME  (ENTRY_CANDIDATE only)
```

The replay as-of time is the snapshot’s own collection time:

`backtestAsOf = marketSnapshot.collectedAt`

That same timestamp is used for:

- `FeatureInputs.asOf`
- `FeatureVector.generatedAt`
- `StrategyEvaluation.evaluatedAt`

The question is: what would the system have known **immediately when that stored snapshot arrived**?

It does not use `Date.now()`, the current runtime clock, or the latest database timestamp inside the pure evaluation.

### Example: risk scans must not leak from the future

Suppose:

- 10:00 — market snapshot
- 09:58 — risk scan
- 10:05 — later risk scan

At 10:00:

- the 09:58 scan **may** be used
- the 10:05 scan **must not** be used

Even if you run the backtest days later, a scan taken after the snapshot is future knowledge.

If no risk scan existed yet, risk is `null`. Checkpoint 06 then marks risk features unavailable. `s07_v1` naturally produces `INSUFFICIENT_DATA` when no other rule failed, or `NO_ENTRY` when another factual rule already failed.

`s07_v1` does not gate `risk_age_seconds`. `b08_v1` does not invent a hidden risk-freshness rule.

## Historical risk facts, not a full TokenRiskReport

Checkpoint 08 reconstructs the persisted historical risk facts required to reproduce c06_v1 risk-derived features.

It does **not** reconstruct the full original TokenRiskReport. Checkpoint 05's schema did not historically persist every parser-level `TokenExtensionObservation` field. Backtesting therefore does not invent those missing facts.

Migration 002 stored extension columns such as `extension_name`, `authority`, `program_id`, `state`, `transfer_fee_basis_points`, `maximum_fee_raw`, and `parsed`. The live parser type also contains `rawName`, `classified`, `olderTransferFeeBasisPoints`, `newerTransferFeeBasisPoints`, `olderMaximumFeeRaw`, and `newerMaximumFeeRaw`. Those extra fields were never stored. Unknown historical values are not turned into `false`, `null`, or a copied name and then described as a faithful roundtrip.

c06_v1 risk-derived features only need:

- persisted `scannedAt`
- persisted `tokenProgram`
- persisted `dataCompleteness`
- persisted `RiskFinding` rows (`code`, `category`, `severity`, `confidence`, `title`, `description`)
- persisted top1/top5/top10/top20 concentration BPS, or a historical unavailable concentration

Those facts are loaded as a historical risk-feature projection. Live `TokenRiskReport` values are adapted to the same projection and then both paths use the same c06_v1 formulas. Finding counts and severity counts use every persisted finding, not only the seven `s07_v1` blockers.

Findings come from the `risk_findings` rows stored with that scan. Checkpoint 08 does not rerun today's Checkpoint 05 evaluator over old extension data. Future evaluator changes must not rewrite history.

If concentration was unavailable historically, c06_v1 concentration features stay unavailable with the same stable Checkpoint 06 reason. Zero concentration is not invented. Beneficial owners are not inferred.

`dataCompleteness` and `tokenProgram` are loaded exactly as stored. They are not recomputed from today's chain. `risk_age_seconds` uses historical backtest `asOf` minus persisted `scannedAt` with the existing c06_v1 whole-second semantics. The current clock is not used.

Past scans cannot retroactively acquire facts that were never persisted. Schema stays at version 4. There is no migration 005.

## Why market age becomes 0

Live collection often evaluates a snapshot a few seconds after it was fetched. Historical replay uses `asOf = collectedAt`, so `market_age_seconds` is **0** for a normal replay event. That is expected. It is not a bug.

## Previous same-pair snapshot

For each replay snapshot, the previous market snapshot is the newest earlier row with:

- the same token mint
- the same pair address
- `collectedAt` **strictly less than** the current `collectedAt`

A different pair is not used. An equal timestamp is not previous. A future snapshot is not previous. If none exists, `previousMarket` is `null`. Checkpoint 06 then marks historical-delta features unavailable. Those features do not gate `s07_v1`.

## Current historical provider values

The replay snapshot itself is allowed. Its stored DEX fields were known at `collectedAt`. The backtester does not fetch DEX Screener again, update prices, or reselect today’s best pair.

## Two-phase lookahead protection

Phase 1 reconstructs the historical decision from past-and-present facts only.

Phase 2 attaches a future outcome for `ENTRY_CANDIDATE` events.

Future prices must never change:

- the feature vector
- risk selection
- previous-market selection
- strategy rules
- the strategy decision

## Signal sampling policy

Every historical market snapshot produces one classification:

- `entry_candidate`
- `no_entry`
- `insufficient_data`

If several consecutive snapshots are `ENTRY_CANDIDATE`, they remain **separate backtest events**. There is no cooldown, no position lock, and no “already in a trade” filter.

Those events may overlap in their 15-minute future windows. They are **not** independent executed trades. Event count is not the number of positions a live bot would have opened.

## Fixed 15-minute horizon

For each `ENTRY_CANDIDATE`:

- `targetAt = asOf + 900 seconds`
- `windowEndAt = targetAt + 120 seconds`

The allowed outcome window is `[targetAt, windowEndAt]`, inclusive at both ends.

- a snapshot exactly at `targetAt` is accepted
- a snapshot 1 millisecond before `targetAt` is not
- a snapshot exactly at `windowEndAt` is accepted
- a snapshot 1 millisecond after `windowEndAt` is not

Do not tune 900 or 120 because results look better with another horizon. Changing those constants would be a new backtest spec, not `b08_v1`.

## Earliest same-pair future snapshot

Inside the window, choose the **earliest** snapshot with the same token and the **same pair**.

Do not choose:

- the closest return
- the highest or lowest price
- the latest price
- a different pair or DEX

If pair selection changes later, prices are not compared across pairs. The backtester does not invert quote-token prices or stitch two pairs into one series.

If no same-pair snapshot exists in the window, the outcome is unavailable with reason:

`no_same_pair_snapshot_in_outcome_window`

If the collector was offline, that gap stays a gap. Prices are not interpolated. Candles are not synthesized. The internet is not used to fill missing history.

## Invalid earliest future price

The earliest eligible snapshot is chosen first. Then its `priceUsd` is inspected.

If that price is null, non-finite, or `<= 0`, the outcome is unavailable with reason:

`outcome_price_unavailable`

The engine does **not** skip that row and keep searching for a later valid price. That would silently change the measurement rule.

## Gross forward price return

When the future price is valid:

```text
grossForwardReturnPct =
  ((outcomePriceUsd - referencePriceUsd) / referencePriceUsd) * 100
```

`referencePriceUsd` is the historical current snapshot price. It is a **reference price**, not an executed entry or fill.

This is a **gross price return**. It deliberately ignores slippage, fees, spread, gas, priority fees, MEV, execution latency, and route impact. It is **not** net trading profit.

`actualHorizonSeconds` and `outcomeDelaySeconds` use whole seconds after flooring milliseconds. Delay is expected to stay in `0..120`.

## Missing outcomes

`NO_ENTRY` and `INSUFFICIENT_DATA` events are counted as classifications. They do not receive a hypothetical return. Their `outcome` is `null`.

Every `ENTRY_CANDIDATE` has an outcome object: either `resolved` or `unavailable`. Missing future data is not hidden as `null`.

## Historical coverage and bias

The backtest covers only observations actually stored by this local bot. It is **not**:

- the entire historical Solana market
- all meme coins
- all pair launches

The bot only has data for tokens and pairs it observed and persisted. Missing tokens are not reconstructed. If the collector was offline, future outcomes may be unavailable.

That is collection and selection bias. Survivorship bias can also appear: tokens the bot never saw cannot lose in this sample. Checkpoint 08 does not correct that statistically.

The local database is currently a small sample. Results from it do not establish that `s07_v1` is profitable, that it “works,” or that it will work in the future.

## Summary metrics

The summary stays basic on purpose:

- classification counts, including `INSUFFICIENT_DATA` separately from `NO_ENTRY`
- resolved vs unavailable `ENTRY_CANDIDATE` outcomes
- positive vs non-positive gross forward outcomes (`> 0` vs `<= 0`, including zero)
- arithmetic mean of **resolved** candidate returns only (`null` if none)

These are not called wins or losses. There is no Sharpe ratio, drawdown, equity curve, or profit factor. Richer analytics belong in Checkpoint 12.

## Read-only database

`npm run backtest:run` is a database **read** operation.

- `DATABASE_ENABLED=true` is required
- the SQLite file must already exist
- the command does not create a missing file
- it does not run migrations
- schema stays at version 4
- it does not write backtest rows, feature vectors, or strategy evaluations

If a stored `s07_v1` strategy definition exists, the command checks that it still matches the frozen code definition. It will not insert or update that row. If no stored definition exists, the backtest still runs from the frozen code.

Replay does **not** use stored `strategy_evaluations` as the event list. Older market history can predate Checkpoint 07. Events are reconstructed from market snapshots plus the persisted historical risk facts required to reproduce c06_v1 risk-derived features.

## How to run it

All stored tokens:

```bash
npm run backtest:run
```

One mint:

```bash
npm run backtest:run -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

USDC may produce zero `ENTRY_CANDIDATE` events. That is acceptable. Do not change thresholds because of it.

`npm run dev` does not run a backtest.
