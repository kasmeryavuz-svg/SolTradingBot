# Checkpoint 09 — Live paper-entry observation

This checkpoint watches what frozen `s07_v1` would do on a live market snapshot and stores that as a **paper evaluation**. It does not trade.

## What paper trading means here

Checkpoint 09 is a **paper-execution foundation**. For each explicit `paper:step`, the bot:

1. collects the live market snapshot and technical risk facts
2. builds a `c06_v1` feature vector
3. evaluates frozen `s07_v1`
4. records a deterministic paper action for that exact bundle
5. writes the whole bundle to local SQLite in one transaction

The paper layer does **not** invent a second strategy. If `s07_v1` says `NO_ENTRY`, paper says `NO_ACTION`. If it says `ENTRY_CANDIDATE`, paper records an **entry observation**.

## Four different ideas

These are easy to mix up:

| Idea | What it is | What it is not |
| --- | --- | --- |
| Strategy classification | `ENTRY_CANDIDATE`, `NO_ENTRY`, or `INSUFFICIENT_DATA` from frozen `s07_v1` | An order |
| Paper entry observation | A historical record that the strategy classified this snapshot as an entry candidate, at the exact market `priceUsd` | A buy, fill, quote, or position |
| Position | Inventory, size, average entry, open/closed state | Not implemented. That is Checkpoint 10 |
| Real blockchain trade | A signed Solana transaction that moves tokens | Not implemented. There is no wallet |

`ENTRY_CANDIDATE` does **not** mean an actual order. It only means the frozen classifier’s ten rules all passed on that feature vector.

## The p09_v1 reference-price model

Paper spec:

- version: `p09_v1`
- name: `live_reference_price_entry_observation`

For an entry observation:

- `referencePriceUsd` = the exact `MarketSnapshot.priceUsd` used to build the feature vector
- `simulatedEntryPriceUsd` = `referencePriceUsd`

That equality is intentional. This is a **paper reference-price model**. It is **not** a claim that a real DEX swap could fill at that price.

p09_v1 does **not** model:

- Solana base fees, priority fees, or compute-unit fees
- DEX fees or transfer taxes
- slippage, spread, or price impact
- MEV
- route cost
- RPC or transaction latency
- order size or liquidity consumption

Do not call a reference-price difference “profit”. These observations cannot estimate net executable trading performance.

## No quantity yet

There is intentionally **no** `$10` order, `1 token`, virtual cash, or portfolio balance.

Paper entry observations have price evidence and **no quantity**. Position sizing belongs to Checkpoint 10. The exit engine belongs to Checkpoint 11. Performance analytics belong to Checkpoint 12.

## NO_ACTION

| Strategy decision | Paper action | Reason | Prices stored |
| --- | --- | --- | --- |
| `ENTRY_CANDIDATE` | `entry_observation` | none (`null`) | exact market price |
| `NO_ENTRY` | `no_action` | `strategy_no_entry` | none (`null`) |
| `INSUFFICIENT_DATA` | `no_action` | `strategy_insufficient_data` | none (`null`) |

`NO_ACTION` is not a simulated entry. Even if the market snapshot has a price, paper stores `null` so the database does not look like a trade occurred.

The paper engine may not override a valid `ENTRY_CANDIDATE` because it “does not like” liquidity, age, or momentum. Those rules already live in `s07_v1`. Malformed or internally inconsistent inputs throw an error instead of being rewritten as `NO_ACTION`.

## Exact source identities

A paper evaluation is tied to the **exact** live bundle that produced the strategy decision:

- same token mint on market snapshot, feature vector, strategy evaluation, and paper evaluation
- same pair and `collectedAt` as the feature vector’s market snapshot
- same `asOf` as the strategy evaluation
- `evaluatedAt` copied from the strategy evaluation (no extra wall clock)
- feature source identity recomputed from the feature vector
- strategy source identity recomputed from that feature identity and frozen `s07_v1`
- paper source identity = `{ paperSpecVersion, paperDefinitionFingerprint, strategySourceIdentity }`

The bot must not look up “the latest market row” or “the latest strategy row” to fill in a price.

## Persistence and idempotency

Schema version is **5**. Migration `005_paper_evaluations` adds `paper_definitions` and `paper_evaluations`. Migrations `001`–`004` stay unchanged.

The entire `paper:step` write is one SQLite transaction: token timestamps, market, risk, features, strategy, paper definition, and paper evaluation. If the paper insert fails, newly inserted source rows in that transaction roll back.

Exact duplicate semantics:

- same p09_v1 fingerprint + same strategy source identity → reuse, `inserted = false`, recording metadata unchanged
- same identity with different semantic output → `PersistenceError`, no overwrite
- stored `p09_v1` fingerprint disagrees with current code → `PersistenceError`. The correct change is `p09_v2`, not an UPDATE

`first_recorded_at` on `paper_definitions` is persistence metadata only. It does not affect the paper fingerprint or source identity.

There is no `paper_positions` table. Checkpoint 10 will introduce position state.

## Commands

```bash
npm run paper:step -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
npm run paper:history -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

`paper:step` is an explicit one-shot live evaluation. It may write SQLite rows. It never writes to Solana.

`paper:history` reads stored rows only. It does not call RPC, DEX Screener, or recompute strategy/paper actions.

There is no `paper:watch` in Checkpoint 09. A continuous runner that emitted unlimited simulated entries would imply position semantics that do not exist yet.

`npm run dev`, collector, risk, feature, strategy, and backtest commands do **not** run paper evaluation automatically.

## Backtest compatibility

After the live database migrates to schema 5, `npm run backtest:run` must still open that file **read-only**. `b08_v1` outcome semantics and fingerprint stay frozen. Backtest accepts schema 4 or 5 and does not run migrations.

## What these results cannot prove

A live `NO_ENTRY` / `NO_ACTION` result is acceptable. The current historical sample may still produce zero `ENTRY_CANDIDATE` rows. That does **not** authorize weakening `s07_v1`.

Paper results cannot establish future profitability. This is an experimental reference-price observation layer. Real execution, size, fees, and exits are unknown.

## Safety

Paper trading does not imply access to funds. There is no wallet address requirement, SOL balance requirement, or private key requirement. The paper subsystem is data plus local SQLite only.

- Blockchain capability: READ ONLY
- Wallet: NO
- Signer: NO
- Transaction sending: NO
- Real trading: NO
