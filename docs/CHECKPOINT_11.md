# Checkpoint 11 — Deterministic paper exit engine

Checkpoint 11 sits **after** frozen position management. It can **simulate a full close** of one existing `pm10_v1` paper position. It cannot trade on Solana, and it does not calculate profit or loss.

`x11_v1` is an **experimental baseline**. It is not optimized, not recommended, not proven, and not financial advice. The thresholds exist so the bot has a deterministic, testable close rule. They are **not** evidence that this rule is profitable.

## Three different stored things

These are easy to mix up:

| Idea | Table | What it is | What it is not |
| --- | --- | --- | --- |
| Historical paper **entry** | `paper_positions` | Immutable record of how the simulated position opened: pair, entry price, $100 notional, quantity | A wallet balance or a live order |
| Current-open **index** | `paper_open_positions` | At most one row per token mint pointing at the currently open `paper_positions` row | The only evidence that a position ever existed |
| Historical paper **exit** | `paper_position_exits` | Immutable record that x11_v1 simulated a full close, with the observed opening-pair price and the exact quantity | A DEX fill, a sell transaction, or PnL |

Closing a paper position **deletes** the current-open index row. It does **not** update or delete `paper_positions`. The entry remains. After a close, a later new p09 entry event may open a **new** paper position for the same token.

## Why the exit must use the exact opening pair

A `pm10_v1` position is anchored to `OpenPaperPosition.pairAddress`. That is the pair whose price created the entry quantity (`100 / entryPriceUsd`).

Exit evaluation fetches **that same pair only**. It does not:

- pick the “best” or highest-liquidity pair
- fall back to another pair for the same mint
- invert a quote-side price
- close because a different pair moved

If opening pair A is missing but pair B exists, the command **fails safely**. It does not close. It does not write an exit. The current-open row stays.

The requested mint must be the **base** token of that pair. Quote-side orientation is rejected. This keeps Checkpoint 02 price orientation.

If DEX Screener returns more than one exact match for that pair — even if the records look identical — the provider **rejects** the response. Silent choice would hide ambiguous data.

## Frozen experimental thresholds

These are code constants, not environment settings. Changing any one later requires a new spec such as `x11_v2`.

| Parameter | Value | Meaning |
| --- | --- | --- |
| Stop loss | 1000 bps | 10.00% below entry |
| Take profit | 2000 bps | 20.00% above entry |
| Max holding | 21,600,000 ms | 6 hours |
| Close fraction | 10,000 bps | 100% of the simulated quantity |

Formulas, with no domain rounding:

- `stopTriggerPriceUsd = entryPriceUsd * (1 - 1000 / 10000)`
- `takeProfitTriggerPriceUsd = entryPriceUsd * (1 + 2000 / 10000)`
- `holdingAgeMs = marketSnapshot.collectedAt - position.openedAt`

Comparisons are **inclusive**:

- stop if `priceUsd <= stopTriggerPriceUsd`
- take profit if `priceUsd >= takeProfitTriggerPriceUsd`
- max hold if `holdingAgeMs >= 21_600_000`

## Decision precedence

1. Market price unavailable (`priceUsd === null`) → `no_change` / `market_price_unavailable`
2. Stop-loss → `close_position` / `stop_loss_threshold`
3. Take-profit → `close_position` / `take_profit_threshold`
4. Maximum holding time → `close_position` / `max_holding_time`
5. Otherwise → `no_change` / `exit_conditions_not_met`

Price-unavailable wins even if the max-hold clock has already elapsed. A close needs an exit **reference** price. That price is still not a real executable DEX fill.

Stop and take-profit win over max holding when both are true.

## Zero observed price

An observed exit price of exactly `0` is valid. A token may collapse. Stop-loss must trigger at zero.

- Entry price must be finite and **greater than 0**
- Exit observed price may be `null` or finite **≥ 0**
- Negative, NaN, and ±Infinity prices are rejected

## Full close only

When the action is `close_position`:

- `simulatedExitPriceUsd` = the exact observed opening-pair `priceUsd`
- `closedQuantityTokens` = the exact immutable `openPosition.quantityTokens`

There is no remaining quantity, no rounding, no partial exit, no trailing stop, no breakeven stop, and no scale-out.

The current-open row is removed only after that full simulated close is persisted.

## No PnL in this checkpoint

The evaluator may compare the observed price to derived trigger prices. That is required to decide an exit.

Checkpoint 11 does **not** compute or store:

- profit or loss in USD
- percentage return
- market value
- exit notional (`quantity * exitPrice`)
- realized or unrealized PnL
- equity, win rate, Sharpe, or drawdown

Checkpoint 12 will analyze performance.

## Exact-pair market observation

`exit:step` uses a separate read-only exact-pair provider. Existing `MarketDataProvider.getSnapshot` (automatic best-pair selection) is unchanged and is **not** used for exits.

The exact-pair path:

1. Fetch token pairs for the mint (same DEX Screener HTTP client)
2. Keep only Solana pairs whose pair address equals the opening pair
3. Require the requested mint to be the base token
4. Normalize that one pair

No Solana RPC, risk scan, feature generation, strategy evaluation, paper evaluation, or position-opening evaluation runs inside `exit:step`.

## Stale-state protection

The command reads the current open position **before** the network call. Persistence re-reads that state **inside** the write transaction and compares every immutable fact, not only the position id:

- token, pair, spec, fingerprint
- openedAt and entry market collectedAt
- entry price, notional, quantity
- opening paper source identity and position source identity

If the evaluator saw position A, but the database now has a **different** current-open row B or changed facts for A, persistence rejects. It does **not** close a replacement position.

Exact successful close retry is the exception. If A was already closed by the **same** evaluation — same source identity and the same immutable position, market, evaluation, and evidence facts — persistence reuses the stored close with `inserted=false`. It does not insert another row, does not delete anything else, and does not fail merely because `paper_open_positions` is now empty.

An independent later close for the same already-closed position (different source identity or different facts) is still stale. After A closes and B opens on the same mint, a leftover close for A must not delete B.

## Atomic persistence

`recordExitBundle` uses **one** SQLite transaction:

1. Re-read current open state. If the open row is gone, only an exact identical already-persisted close may be reused read-only.
2. Persist or reuse the **exact** market snapshot passed to the evaluator (same token + pair + collectedAt with changed facts is an error; no “latest row” lookup)
3. Ensure the frozen x11_v1 definition
4. Persist or reuse the exit evaluation (same source identity with different semantics is an error)

If the action is `no_change`, it commits there. The open row stays. No `paper_position_exits` row is written.

If the action is `close_position`:

5. Insert immutable `paper_position_exits`
6. `DELETE FROM paper_open_positions WHERE token_id = ? AND position_id = ?`
7. Require exactly one row removed
8. Commit

Any failure rolls back, including a failure **after** the delete. The open row must reappear. Historical `paper_positions` is never updated or deleted.

A paper position can have **many** hold evaluations while it stays open, and **at most one** immutable close record.

## The exit reference price is not a fill

The observed DEX Screener USD price is a **paper reference**. There is no slippage model, no fee model, no Jupiter quote, and no Solana transaction. `close_position` is a local state transition, not a sell.

## Commands

```bash
npm run exit:step -- <TOKEN_MINT>
npm run exit:history -- <TOKEN_MINT>
```

`exit:step` is an explicit one-shot. There is no `exit:watch`.

If there is no current open paper position, `exit:step` is a successful no-op: no market request, no exit evaluation, no domain write.

`exit:history` is database-only. It does not use the network and does not re-evaluate exits. Newest `asOf` first, then `id` descending.

The only new environment setting is `EXIT_HISTORY_LIMIT` (display count, 1–100). Stop, take-profit, max hold, and close fraction are **not** configurable.

`position:step` remains pm10 opening/state-management only. `paper:step` remains p09 only. Neither command runs the exit engine. After a simulated close, `position:status` simply shows no current open position. It still does not calculate PnL.

## What this checkpoint does not do

No wallet, signer, transaction, swap, real buy, or real sell. No partial exits. No realized or unrealized PnL. No performance analytics, capital allocation, or strategy optimization.

A simulated paper close does **not** establish actual executable performance.
