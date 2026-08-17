# Checkpoint 12.5 — Strategy research / benchmark lab

Phase 12.5 turns the project from “one experimental strategy” into a **controlled historical comparison lab**.

It compares five **fixed** entry hypotheses against the **same** stored Solana dataset. It does **not** prove that any hypothesis will make money. It does **not** pick a live strategy. It does **not** optimize thresholds.

Spec: `r125_v1`  
Name: `fixed_candidate_historical_strategy_benchmark_lab`

## Beginner map

| Idea | What it means here |
| --- | --- |
| Hypothesis | A frozen entry rule we decided **before** looking at local results |
| Backtest / research run | Historical evidence under those frozen rules |
| Proven strategy | Something this lab **does not** claim |
| Baseline | `s07_baseline` — the existing frozen s07_v1 classifier, unchanged |
| Control | `quality_control_v1` — a simple liquid/safe gate with no extra momentum overlay |
| Ablation | `runner_friendly_momentum_v1` — same spirit as s07 except one rule is removed |

A good historical GROSS PnL is still only a description of **this sample**. It is not a forecast.

## What this lab uses

- Frozen `c06_v1` point-in-time features reconstructed from raw snapshots and risk scans
- Frozen technical risk evidence as-of each snapshot
- Deterministic entry rules with **no env thresholds**
- Frozen pm10_v1 `$100` reference notional and `quantity = 100 / entryPriceUsd`
- Frozen x11_v1 exits for **every** candidate
- a12-compatible GROSS paper performance mathematics

r125 reports are **not** a12 runtime immutable-trade reports. They reuse the same GROSS formulas. They do not pretend a synthetic research trade is a stored x11 close.

## What this lab must not do

- No wallet, signer, private keys, or transactions
- No Jupiter, Jito, swaps, or blockchain writes
- No network calls from research commands (no DEX Screener HTTP, no Solana RPC)
- No optimizer, hyperopt, machine learning, or parameter search
- No live paper writes
- No research result tables
- No migration 008

Schema stays **7**. Reports are rebuilt in memory from a query-only SQLite snapshot.

## Research snapshot universe

Every candidate sees the same included snapshots.

Some `market_snapshots` rows may exist because the live x11 exit engine was watching an open paper position. Those observations can be strategy-dependent, so they are a leakage risk.

r125_v1 **excludes** every market snapshot whose id is referenced by `exit_evaluations.market_snapshot_id`. This happens **before** any candidate runs. It is a provenance control, not a performance filter. It does **not** drop snapshots because price later went up or down.

Tradeoff: if a generic snapshot was later reused by x11, it is conservatively excluded too. That can shrink the sample. Completeness is preferred over accidentally using exit-driven observations.

The report prints:

- `rawMarketSnapshotCount`
- `runtimeExitReferencedSnapshotCountExcluded`
- `researchMarketSnapshotCount`

## Point-in-time reconstruction / lookahead

For snapshot T:

- `asOf = collectedAt`
- `generatedAt = T`
- previous market: same token, same pair, **strictly earlier**, newest eligible research snapshot
- risk: same token, `scannedAt <= T`, newest eligible

A future snapshot, future price, future risk scan, future exit, or later PnL must not change the decision at T. The current snapshot cannot be its own previous market. A same-timestamp snapshot cannot be previous market.

Because `asOf` equals `collectedAt`, reconstructed `market_age_seconds` is 0 at T. That is research-as-of-the-observation-instant, not a claim that live evaluations always had zero age.

## Five fixed candidates

1. **`s07_baseline`** — calls frozen `evaluateStrategy`. Control baseline. Fingerprint is the frozen s07 fingerprint.
2. **`quality_control_v1`** — common market/risk gate only. Asks whether fancy overlays add anything.
3. **`time_series_momentum_v1`** — common gate plus provider 5m/1h/24h price change all strictly `> 0`. Concept inspired by time-series momentum research. **Not** an academic portfolio.
4. **`flow_confirmed_momentum_v1`** — common gate plus short-horizon positive change and flow confirmation using c06 buy-share / net-buys / volume-to-liquidity. 5m thresholds reuse frozen s07 values. 1h uses simple majority (`buy_share_1h_bps > 5000`, `net_buys_1h > 0`).
5. **`runner_friendly_momentum_v1`** — ablation: s07-like entry rules **without** the +20% 5-minute momentum cap. This tests whether that cap discards strong runners **at entry**. It does **not** change the shared +20% x11 take-profit **exit**.

Unavailable required features become `insufficient_data`. They are never treated as false.

For the four **new** r125 candidates, unavailable required evidence takes precedence over an unrelated failing market or momentum rule. A snapshot with missing required risk data is `insufficient_data` even if liquidity is also below the minimum. Frozen `s07_baseline` keeps s07_v1’s existing fail-over-unavailable decision order and is not changed.

Same-timestamp observations of the **same token** are not a later-time lifecycle step. Only the first event in frozen sort order at that `collectedAt` may open, close, or otherwise change that token’s simulated state. A later lexical twin at the same instant cannot close, switch pair, or re-enter.

## Shared exit

All five candidates use the same frozen x11_v1 exit:

- stop −10%
- take +20%
- max hold 6 hours
- full close
- exact opening pair only
- zero price is a valid observed price

We compare **entry** hypotheses first. Different exits would mix two experiments.

**Runner note:** x11 closes the **entire** simulated position at +20%. r125_v1 cannot measure a 2x / 5x / 10x / 100x remainder. Do not infer that from these results.

## Simulator

- At most one simulated open position per token mint (across pairs)
- No bankroll / no portfolio capital constraint
- Overlapping token positions are **not** a portfolio return
- Event order: `collectedAt`, token mint, pair, market identity (not SQLite row id)
- If a token is open on another pair, ignore the event
- If open on the same pair, evaluate x11 first
- After a close, do **not** re-enter on that same snapshot
- Same-token events that share `collectedAt` do not create a zero-time pseudo-future: only the first sorted event at that instant may change that token’s lifecycle
- Entry price is the current snapshot `priceUsd` (finite `> 0`)
- Quantity is the frozen pm10 formula, no rounding, no fees, no slippage
- Max-hold is evaluated at the **next exact-pair observation** using that observation’s reference price. r125 does not interpolate a 6-hour print. Sparse observation can delay a max-hold close.

## Unresolved / censored trades

If a position is still open at dataset end, r125 does **not** close it at last price, mark it as a win/loss, fabricate a max-hold price, or switch pairs.

It is `unresolved_at_dataset_end`. Completed GROSS analytics use **completed** trades only. Coverage must show unresolved counts beside PnL. A flattering PnL with a huge unresolved pile is not a clean result.

## Chronological slices

Using the full research dataset span:

- EARLY: first 60% of elapsed time
- MIDDLE: next 20%
- LATE: final 20%

The simulation runs **continuously**. Open positions are **not** reset at slice boundaries. Completed trades are assigned by **exit** timestamp. These are descriptive robustness slices, **not** formal out-of-sample proof. Formal walk-forward belongs later (Checkpoint 17).

If the span is zero (one timestamp), every completed trade is assigned EARLY.

r125 does **not** apply a numeric “enough data” threshold (no minimum snapshot count, token count, or statistical-significance cutoff). Reports print raw coverage facts. A short span or thin risk coverage is visible in those facts; it is not a hidden pass/fail score.

## Why there is no optimizer yet

The five candidates are **pre-registered**. Do not change their thresholds after seeing local results. If evidence suggests a change, create a **new** candidate/version. Do not mutate an existing fingerprint.

No hyperopt. No grid search. No “try 500 thresholds and keep the best.” Checkpoint 17 owns optimization methodology.

## Why no strategy is called a winner

Historical GROSS PnL can be driven by one meme-coin spike, a tiny completed sample, or unresolved coverage. Ranking would invite selection bias.

`research:compare` prints candidates in frozen `candidateId` order. It does not sort by PnL. It does not output “best strategy”, “go live”, or “edge proven”.

Winner-concentration numbers (`top1` / `top3`) are a **fragility diagnostic**, not a ranking score.

## Bias vocabulary

- **Lookahead bias:** using information that did not exist at T
- **Selection bias / cherry-picking:** dropping losers, picking a lucky window, or tuning after seeing results
- **Data provenance:** knowing why a snapshot exists (generic collector vs exit watcher)
- **Overfitting:** fitting rules to one sample until the backtest looks good
- **Censoring:** unresolved positions whose later path was never observed

## Gross paper vs live net

These numbers exclude trading fees, Solana fees, slippage, price impact, MEV, latency, failed transactions, and partial fills. The `$100` size is a reference, not a bankroll. Academic or CEX results do not automatically transfer to sparse Solana meme-coin snapshots.

## Licensing / clean-room

External projects were reviewed as **research references**. This codebase does not copy Freqtrade or Hummingbot source and does not add those projects as dependencies. See [STRATEGY_RESEARCH_SOURCES.md](./STRATEGY_RESEARCH_SOURCES.md).

## Commands

```bash
npm run research:catalog
npm run research:compare
npm run research:trades -- s07_baseline
```

`RESEARCH_TRADE_LIMIT` only changes how many trades are printed. It does not change the simulation.

There is no `research:watch`, `research:optimize`, or `research:live`. `npm run dev` does not run research.
