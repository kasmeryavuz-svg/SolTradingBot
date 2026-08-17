# Checkpoint 06 — Deterministic feature engine

This checkpoint turns stored market snapshots and Checkpoint 05 risk reports into **features**. A feature is a machine-usable input. It is not a trading decision.

## What a feature is

A feature is a named fact or a calculation from facts. Examples: trade count, buy share, pair age, “was the mint-authority finding present?”

The feature engine does not say BUY, SELL, ENTER, EXIT, or SKIP.

## Raw data vs a feature

Raw data is what a provider already gave us:

- `buys5m = 60`
- `sells5m = 40`

Features derived from that:

- trade count = 100
- buy share = 60% (6000 basis points)

That still is **not** a buy signal. It only describes observed pair activity in the provider’s window.

## What a feature vector is

A feature vector is the full ordered list of Checkpoint 06 features for one mint at one `asOf` time, plus the source timestamps used to build it.

## Why feature order matters

The same inputs must produce the same values in the same order. Later backtests compare vectors by name and ordinal. The registry order is part of the `c06_v1` contract.

## Why feature-set versioning matters

`c06_v1` names the meaning of every feature. If a formula changes later, the version must change. Otherwise an old backtest and a new engine would silently disagree.

## What deterministic means

Same market snapshot, same previous snapshot, same risk report, same `asOf`, same feature-set version → the same vector. The engine does not call `Date.now()`, the network, or SQLite.

## What point-in-time means

A historical vector may only use information that already existed at `asOf`.

- market `collectedAt` must be `<= asOf`
- risk `scannedAt` must be `<= asOf` when risk is included
- previous market `collectedAt` must be `<` current `collectedAt`

## What lookahead bias is

Lookahead bias is using a later fact as if it had been known earlier.

Forbidden example:

- market observation at 10:00
- risk scan at 10:05
- historical vector `asOf` 10:00 using the 10:05 risk scan

That 10:05 scan must not be used.

## Why different pairs should not be compared casually

Price and liquidity deltas use **our** previous snapshot of the **same pair**. A different pair can jump because pair selection changed, not because the token moved.

## Why a previous-observation change is not a 5-minute return

Collection cadence is not guaranteed. `observed_price_change_from_previous_pct` is the change between two of **our** snapshots. It is not a 1-minute, 5-minute, or hourly return.

## What null / unavailable means

Missing is not zero. Unknown is not false.

If liquidity is missing, the volume/liquidity ratio is unavailable. If there is no risk report, `risk_finding_mint_authority_active` is unavailable, not `false`.

## What token-account concentration means

Checkpoint 06 reuses Checkpoint 05 concentration. Those are **token accounts**, not wallets, developers, or beneficial owners.

## Why no risk score exists

Finding counts stay separate. The engine does not compute `critical*10 + high*5` or any other score.

## Source identity

A feature vector’s deterministic source identity is JSON of:

- `featureSetVersion`
- `tokenMint`
- `asOf`
- `marketCollectedAt`
- `marketPairAddress`
- `previousMarketCollectedAt`
- `riskScannedAt`

`asOf` is included because `market_age_seconds` and `risk_age_seconds` change when `asOf` changes. `generatedAt` is excluded because recomputation time does not change feature values.

Persistence recomputes this identity from vector metadata. It does not trust a caller-supplied identity string.

## generatedAt vs asOf

`asOf` is the latest information time the vector may use. `generatedAt` is when the vector was produced. The engine requires `generatedAt >= asOf`. Historical recomputation may use an old `asOf` and a later `generatedAt`. `generatedAt` never selects source data.

## Timestamps

Feature-engine timestamps must be canonical UTC ISO-8601 as produced by `Date.toISOString()`: `YYYY-MM-DDTHH:mm:ss.sssZ`. Local-looking strings, missing `Z`, timezone offsets, and impossible calendar dates are rejected. Comparisons use parsed UTC milliseconds, not the host timezone.

## Risk-unavailable semantics

If there is no risk report, every risk-dependent feature is unavailable with the stable code `risk_report_unavailable`. Transient RPC error text is not persisted and is not part of source identity. Live `feature:check` may print a sanitized detail separately.

If a report exists but Checkpoint 05 concentration is null, concentration features use `token_account_concentration_unavailable`. Missing concentration is not zero.

## Feature-bundle source duplicates

Checkpoint 04 still skips an exact market snapshot identity with `ON CONFLICT DO NOTHING`. Inside a feature bundle, if that identity already exists and the stored values disagree, persistence fails instead of hiding the mismatch.

Checkpoint 05 still rejects a duplicate standalone risk scan. Inside a feature bundle, an existing `(token, scannedAt)` is reused only when the full persisted Checkpoint 05 risk facts match. A mismatch is a `PersistenceError`. Historical scans are never overwritten. Reuse is not limited to the seven booleans `s07_v1` currently reads.

## Integer seconds and buy-share rounding

Age and elapsed-time features are whole seconds: `Math.floor((laterMs - earlierMs) / 1000)`. Examples: 999ms → 0, 1000ms → 1, 1999ms → 1. Age features never emit a negative value. A future `pairCreatedAt` makes `pair_age_seconds` unavailable instead of clamping to zero.

Buy share uses integer (BigInt) floor division: `buys * 10000 / (buys + sells)`. Example: 1 buy and 2 sells → 3333 bps. 0 buys and 1 sell → 0 bps available. 0 buys and 0 sells → unavailable.

## JavaScript numbers

Derived ratios and percentages use finite JavaScript numbers. They are not exact financial decimals and must not be used for accounting or PnL.

## Why Checkpoint 07 is the first strategy

Checkpoint 06 only prepares inputs. Checkpoint 07 may interpret them. This checkpoint does not.
