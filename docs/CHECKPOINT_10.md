# Checkpoint 10 — Deterministic paper position management

Checkpoint 10 sits **after** frozen paper evaluation. It can open a **simulated** paper position. It cannot trade on Solana.

## Four different ideas

These are easy to mix up:

| Idea | What it is | What it is not |
| --- | --- | --- |
| Paper entry observation (`p09_v1`) | A stored record that frozen `s07_v1` classified a live snapshot as an entry candidate, at that snapshot’s exact `priceUsd` | A buy, a fill, or a position |
| Paper position (`pm10_v1`) | Local simulated inventory for one token: opening pair, reference price, fixed $100 notional, derived paper quantity | An on-chain SPL balance or a wallet holding |
| Actual blockchain position / trade | A signed Solana transaction that moves tokens | Not implemented. There is no wallet |
| Exit / PnL | Closing, stop loss, take profit, current value | Checkpoint 11 and 12. Not implemented here |

`p09_v1` is **unchanged**. It still has `quantityModel = none`, `positionModel = none`, and `exitModel = none`. `paper:step` still does **not** open a position. Only explicit `position:step` runs pm10_v1.

## How a paper position is created

pm10_v1 creates a paper position **only** from a valid `p09_v1` `entry_observation`, and only when that token has **no current open paper position**.

| Paper action | Current open position | Position action | Reason |
| --- | --- | --- | --- |
| `entry_observation` | none | `open_position` | none (`null`) |
| `entry_observation` | already open for this mint | `no_change` | `position_already_open` |
| `no_action` / `strategy_no_entry` | none or open | `no_change` | `paper_strategy_no_entry` |
| `no_action` / `strategy_insufficient_data` | none or open | `no_change` | `paper_strategy_insufficient_data` |

Position management does **not** re-check liquidity, volume, momentum, risk, or token age. Those rules already ran in `s07_v1` / `p09_v1`. Checkpoint 10 only applies **state** after that frozen paper result.

## One current open position per token mint

The rule is **token-wide**, not pair-wide.

Two DEX pairs for the same mint are still exposure to the **same token**. If a position is already open from pair A, a later entry observation on pair B records `position_already_open`. The original row is not replaced, averaged, or resized.

A second signal while a position is already open does **not**:

- open a second position
- add quantity
- average the entry price
- change the notional
- move the position to another pair

The opening pair stays anchored on the original entry. Checkpoint 11 will decide how exits relate to pair continuity. That is not implemented now.

## Fixed $100 reference notional

When a simulated position opens:

- `entryPriceUsd` = the paper evaluation’s `simulatedEntryPriceUsd` (the exact p09 reference price)
- `entryNotionalUsd` = **100**
- `quantityTokens` = `100 / entryPriceUsd`

There is **no rounding** in domain math. Display may round.

This $100 figure is a **paper modeling reference**. It is not financial advice, not an account balance, not real money, and not a required future live trade size. Changing it later requires `pm10_v2` (or another position spec version). It is not an environment variable.

There is **no balance model**. Opening a paper position does not debit cash, SOL, margin, or “virtual capital”. Checkpoint 10 only stores individual position state.

## Paper quantity is not SPL raw units

`quantityTokens` is a paper simulation number. It is **not**:

- raw SPL token units
- lamports
- an on-chain integer amount
- a transaction instruction amount

Token decimals are not used. There is no transaction.

## Immutable entry vs current-open state

Two tables on purpose:

| Table | Role |
| --- | --- |
| `paper_positions` | Immutable **historical entry evidence**. Once opened, pair, price, notional, quantity, timestamps, and identities do not change. |
| `paper_open_positions` | **Current operational index**: at most one open row per token mint. Checkpoint 10 only **inserts** here. It does not update, delete, or replace. |

`paper_positions.token_id` is **not** unique. After a future close, the same token may be opened again. The one-current-position rule lives on `paper_open_positions.token_id` (primary key).

SQLite also enforces that a current-open row cannot point at another token’s position:

- `paper_positions` has `UNIQUE (id, token_id)` and `UNIQUE (id, source_identity)`
- `paper_open_positions` has `FOREIGN KEY (position_id, token_id) REFERENCES paper_positions(id, token_id)`
- `position_evaluations` links `paper_evaluation_id` and `prior_open_position_id` to the same `token_id`
- when a prior position id is stored, its source identity must be the source identity of that same `paper_positions` row

A direct SQL insert that pairs Token A’s open-state with Token B’s position is rejected by SQLite, not only by application code.

There is **no closed state** yet: no `closed_at`, exit price, or status=`closed`. Checkpoint 11 can later record an exit and remove the current-open index **without deleting** the historical entry.

## No current valuation or PnL

Checkpoint 10 does not calculate `quantity * currentPrice`, compare current price to entry, or report profit, loss, return, Sharpe, drawdown, or an equity curve. `position:status` describes **entry state only**. It does not look up a live market price.

## Source identities and idempotency

A position evaluation is identified by:

- position spec version and definition fingerprint
- the exact recomputed p09 paper source identity
- the prior open-position source identity (`null` if none)

A newly opened position entry is identified by spec + fingerprint + the opening paper source identity.

Persistence stores **one** position evaluation per exact persisted paper evaluation. Replaying the same paper event reuses that row (`inserted=false`). Replaying it with different position semantics is an error. The same historical paper event must not be reprocessed later under a different open-position state.

## Atomic persistence

`recordPositionBundle` uses **one** SQLite write transaction. A fresh open writes token, market, risk, features, strategy, paper, position definition, position evaluation, the immutable paper position, and the current-open index together.

It does **not** commit a paper bundle and then add a position in a second transaction. If any insert fails, every new row in that transaction rolls back.

Before accepting the supplied evaluation, persistence reloads current open state **inside** the write transaction. If that state no longer matches what the evaluator used, it fails with `PersistenceError`. It does **not** silently re-run the evaluator. The command may be retried.

The position row is linked to the **exact** paper evaluation by recomputed source identity, not `MAX(id)` or “latest paper row”.

## Commands

```bash
npm run position:step -- <TOKEN_MINT>
npm run position:status -- <TOKEN_MINT>
npm run position:history -- <TOKEN_MINT>
```

`position:step` is an explicit one-shot live chain: frozen c06 → s07 → p09 → pm10, then one atomic persist. There is no `position:watch`. A long-running manager without exits is not useful yet.

`position:status` and `position:history` are database reads. They do not use the network.

The only new environment setting is `POSITION_HISTORY_LIMIT` (display count, 1–100). Notional, max positions, and quantity are **not** configurable.

## What this checkpoint does not do

No wallet, signer, transaction, swap, real buy, or real sell. No exit engine, stop loss, take profit, or closing a position. No realized or unrealized PnL. No bankroll or capital allocation.

A simulated paper position does **not** establish actual executable performance.
