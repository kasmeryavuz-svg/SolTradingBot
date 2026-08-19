# Recovery Watcher v0 (`rw0_v1`)

Paper/data research only. Automatic live trading is unavailable.

This document is the operator-facing contract for Foundation after hostile-review repair 2. It does **not** claim that Recovery_v0 is profitable, complete, or live-ready.

## What this slice is

Foundation Slice 1 freezes identity, isolation, an isolated SQLite file, and a deterministic episode state machine.

It does **not** poll DexScreener, scan holders, cluster wallets, open safety-approved paper, or broadcast.

## What this slice is not

- Not production (`prod20_v1`)
- Not a change to production schema 9
- Not migration 010
- Not `p09_v1` / `pm10_v1` / `x11_v1` (those remain frozen to `s07_v1`)
- Not safety-approved paper (unreachable in `rw0_v1`)
- Not complete market discovery
- Not a holder 10% gate
- Not a bundle 20% gate
- Not network polling / Slice 2

## Isolation

| Resource | Recovery Watcher | Production |
| -------- | ---------------- | ---------- |
| Process | `recovery:status` only in this slice | `prod:run` |
| SQLite file | `./data/recovery-watcher.sqlite` (`RW0_DATABASE_PATH`) | configured `DATABASE_PATH` (default `./data/soltradingbot.sqlite`) |
| Schema | `rw0` version 1 (`rw0_001_initial`) plus SQL digest | version 9 (`001`–`009`) |
| Lock file | `.rw0-runtime.lock` with ownership-safe pid + process-start identity | `.prod20-runtime.lock` |
| Trading flags | must be false or the process refuses | must be false or `prod:run` refuses |

`TRADING_ENABLED=true` or `LIVE_BROADCAST_ENABLED=true` is fail-closed for recovery status.

`RW0_DATABASE_PATH` is rejected when it resolves to the **configured** production `DATABASE_PATH` from the same environment, and is also rejected when it is the default production path. Existing files are compared by resolved path / realpath / file identity so aliases and symlinks cannot initialize RW0 tables in the production file.

Runtime config **rejects** `RW0_DATABASE_PATH=:memory:`. In-memory SQLite is allowed only through the explicit test helper `openRecoveryMemoryDatabase`. Opening a recovery file database requires `configuredProductionPath`; forgetting that isolation argument fails closed and cannot open production.

File opens go through `openRecoverySqlite(path, { configuredProductionPath })` or `openRecoverySqliteFromConfig(config)`. There is no naked-path runtime open.

Recovery never imports `src/live`, `src/wallet`, `src/production`, or `src/execution`.

## Research tracks (do not overload)

Two tracks exist. They must never share a “paper open” meaning.

### SHADOW_RESEARCH (unsafe research simulation)

State: `SHADOW_RESEARCH_OPEN`

- The **only** simulation path in `rw0_v1`
- May simulate recovery entry/exit **before** holder/bundle/creator gates exist
- `safety_incomplete = true`
- Completeness gate = **FAIL**
- Never counts as live-readiness evidence
- Never appears as `PAPER_ELIGIBLE` or `PAPER_OPEN`
- Entry time/price **may** be the recovery-confirmation observation because the track is explicitly unsafe
- **Cannot** transition to `CLOSED` in `rw0_v1`. Shadow exit execution (threshold / overshoot / gap from a persisted market observation) is reserved for a dedicated later slice. Do not open shadow positions that you cannot subsequently monitor/close in Slice 2.

### Safety-approved paper (reserved, unreachable in `rw0_v1`)

States: `PAPER_ELIGIBLE` then `PAPER_OPEN`

These **names** are reserved in the type/schema for a later watcher/spec version. In `rw0_v1`:

- Holder, bundle, creator/dev, token-rights completeness, and liquidity/execution safety are **not implemented**
- Completeness gate **PASS** is not set on any reachable path
- `SIGNAL_PENDING_SAFETY -> PAPER_ELIGIBLE` fails closed with `safe_paper_not_implemented`
- Callers **cannot** synthesize PASS statuses to reach PAPER
- Implementing real safety requires a **new** watcher/spec version and fingerprint

Until that later spec exists: **SHADOW_RESEARCH_OPEN is the only simulation path.**

## Entry timing / look-ahead

Every timestamp supplied in a transition or evidence record is validated against the operation clock. Nested fields may not be in the future even when `transition.at` is valid.

Required order includes:

- `recoveryConfirmedAt <= request.at <= now`
- `safetyCompletedAt <= request.at <= now` (future spec)
- `shadowEntryAt <= request.at <= now`
- `safeEntryObservationCollectedAt <= safeEntryAt <= request.at <= now` (future spec)
- evidence `observedAt <=` decision/transition time
- no persisted market observation may be future relative to the operation clock

`SIGNAL_PENDING_SAFETY` requires `request.at` to be the same instant as `recoveryConfirmedAt` because that state change is caused by that exact observed recovery event.

Recovery confirmation is legal **only** when:

- `watchStartedAt != null` (frozen when entering `RECOVERY_WATCH`)
- `watchExpiresAt = watchStartedAt + RW0_WATCH_TTL_MS`
- `recoveryConfirmedAt < watchExpiresAt`

At `recoveryConfirmedAt >= watchExpiresAt` the episode must **not** confirm; it is expiry-eligible. The exact TTL boundary belongs to `EXPIRED` (`transition.at >= watchExpiresAt`).

Persisted `SIGNAL_PENDING_SAFETY` must be derived inside `BEGIN IMMEDIATE` from an already stored `rw0_market_observations` row identified by `episode_id + pair_address + collected_at` (same instant as `recoveryConfirmedAt`). Same mint, exact pinned pair, matching signal/watcher fingerprints. Price, liquidity, and volume come from that stored row; V/L is computed from those stored raw fields. Caller-supplied economics that disagree fail closed and cannot override the observation.

### SHADOW_RESEARCH

1. Dip observation at `dip_observed_at` (no future data)
2. Later same-pair recovery confirmation
3. Shadow entry **may** use that confirmation observation

### Future safety-approved PAPER (not reachable in `rw0_v1`)

1. Recovery confirmation occurs first
2. Safety evidence is collected
3. **All** required safety evidence must have `observed_at <= safe_entry_at`
4. After safety is complete and PASS, entry price must come from the **first fresh market observation at or after safety completion**
5. **Never** backfill the recovery-confirmation price as a safe entry if safety completed later

## Frozen research signal (`recovery_v0`)

Unproven. Discovered in-sample from a tiny historical slice that used **sparse ~5-minute observations**. The intended forward watcher uses a **60-second** confirmation cadence. Historical percentages are **not** proof of that new execution regime. Forward evidence counts only after fingerprint freeze.

### Dip observation

| Field | Rule | Missing data |
| ----- | ---- | ------------ |
| 5m price change | `>= -60` and `<= -40` (percent) | fail closed (`REJECTED_INCOMPLETE`) |
| 5m volume USD | known and `>= 5000` | fail closed |
| Observed price | known, finite, `> 0` | fail closed |

Dip liquidity and dip V/L are **not** dip gates.

### Recovery confirmation observation

Must be **strictly later**, exact **same pair**, with:

| Field | Rule | Missing data |
| ----- | ---- | ------------ |
| Observed price | known, finite, `> 0`, and `>` dip observed price | fail closed / not yet |
| Liquidity USD | known and `>= 10000` | fail closed |
| 5m volume USD | known | fail closed |
| V/L | `volume_5m_usd / liquidity_usd`, `>= 1.0` and `< 3.0` | fail closed |

V/L is computed from raw confirmation volume and liquidity. A caller-supplied ratio that disagrees with those raw fields fails closed.

Changing any bound requires a new signal version and fingerprint.

## Operational constants (`rw0_v1` watcher spec)

These are fingerprinted separately from the signal so a cadence change cannot silently pretend to be the same experiment.

| Constant | Slice 1 value | Meaning |
| -------- | ------------- | ------- |
| Watch cadence | 60_000 ms | intended high-res poll (not implemented in this slice) |
| Watch TTL | 7_200_000 ms (2 hours) | max **entry watch** lifetime after `watchStartedAt` |
| Cooldown | 7_200_000 ms (2 hours) | separate fingerprinted constant; mint cooldown after terminal states |
| Max holding | 21_600_000 ms (6 hours) | shadow max-hold **CLOSED** comparator, not `EXPIRED` |
| Max concurrent high-res slots | 10 | all `WATCH_SLOT_STATES`, not only `RECOVERY_WATCH` |
| Max episodes / mint / 24h | 3 | bounded re-observation, not a lifetime ban |

`WATCH_SLOT_STATES`: `RECOVERY_WATCH`, `SIGNAL_PENDING_SAFETY`, `SHADOW_RESEARCH_OPEN`, and reserved `PAPER_ELIGIBLE` / `PAPER_OPEN` (unreachable here, counted if they ever appear).

Admission to a new `RECOVERY_WATCH` uses the persisted slot count inside `BEGIN IMMEDIATE`. Ten shadow positions plus ten new recovery watches is forbidden.

`RECOVERY_WATCH -> EXPIRED` is legal only when `transition.at >= watchStartedAt + RW0_WATCH_TTL_MS`. Recovery confirmation is legal only when `recoveryConfirmedAt < watchStartedAt + RW0_WATCH_TTL_MS`. Callers cannot expire a watch early, and cannot confirm at or after the frozen deadline.

`SHADOW_RESEARCH_OPEN` does **not** use the 2h entry-watch `EXPIRED` transition. Shadow **exit / `CLOSED` is not implemented in `rw0_v1`**. A later dedicated slice must bind close evidence to a persisted market observation and record threshold, overshoot, and gap. Future `PAPER_OPEN` must not use entry-watch `EXPIRED`.

## Episode identity

`episode_id = SHA-256(mint, pair, dip_observed_at, signal_fingerprint)`

One **active** episode per mint (application check **and** a partial UNIQUE index). Cooldown does not permanently ban the mint. A later **new** dip (new `dip_observed_at`) may open a new episode after cooldown and within the 3/24h cap.

Persisted episodes must match `rw0_v1` signal/watcher/shadow/exit fingerprints and `cost_model=none` / `execution_model=discrete_observed_price_no_quote`. The recovery migration SQL digest is stored and bound into the watcher fingerprint. Drift without a version bump fails closed.

## State machine

Active: `DISCOVERED`, `DIP_CANDIDATE`, `RECOVERY_WATCH`, `SIGNAL_PENDING_SAFETY`, `SHADOW_RESEARCH_OPEN` (`PAPER_ELIGIBLE` / `PAPER_OPEN` reserved, unreachable)

Terminal-before-cooldown: `CLOSED`, `EXPIRED`, `REJECTED_FILTER`, `REJECTED_INCOMPLETE`, `REJECTED_SAFETY`, `REJECTED_SAFETY_UNKNOWN`, `REJECTED_CAP`, `CENSORED_UNAVAILABLE`

Terminal: `COOLDOWN`

`CENSORED_UNAVAILABLE` is not a win or a loss. A token disappearing is not a completed trade.

Illegal transitions fail closed.

Idempotency is exact: retrying the **same** semantic event (target, timestamp, reason, payload / event identity) may no-op. The same target state with a different event identity fails closed as a conflict.

`CLOSED` is reserved in types/schema but **unreachable** in `rw0_v1`. Foundation does not generate close rows. If a later slice implements exit execution, `CloseEvidence.observedAt` and `observationCollectedAt` must identify the **same** persisted market-observation instant (same pair and price as that `rw0_market_observations` row). Unrelated timestamps must not form one exit identity. `CENSORED_UNAVAILABLE` remains separate and is never a win/loss.

## Discovery coverage

DexScreener latest profile/boost feeds are acceptable for `rw0_v1` **research collection**. They are **not** complete market discovery.

Tokens that never appear on those feeds, tokens dropped by production’s cap-20 persist path, and tokens that crash between polls can be missing. Discovery coverage remains a completeness **FAIL**.

## Holder concentration (unresolved)

`largest_real_holder_pct <= 10%` is a **future** hard requirement. It is **not** implemented.

Do not use Checkpoint 05 top-1 token-account bps or Checkpoint 18 `observedTop20BalanceShareBps` as that number.

A future implementation must define, in writing, before any PASS:

- **Numerator:** aggregated beneficial owner amount after documented exclusions
- **Denominator:** which supply (see below)
- **Total supply vs effective circulating/tradable supply:** these are different; picking one is a spec choice, not a silent default
- **LP / vault / burn / program exclusions:** only by **positive identification**, never by guessing
- **Owner aggregation:** multiple token accounts of one owner, including accounts **outside** the observed top-20
- **Incomplete owner coverage:** if aggregation or classification is incomplete, status is `UNKNOWN` (fail closed). This does **not** claim that an unexplained supply remainder above 10% proves a hidden single token account above 10%. The unresolved risk is incomplete beneficial-owner aggregation.
- **Point-in-time evidence:** `observed_at <= entry_at`. Querying holders later must not be labeled as holder state at an old entry.

Until that spec and data exist: **holder gate = UNKNOWN**.

## Bundle / linked wallets (unresolved)

`linked_bundle_pct <= 20%` is a **future** hard requirement. It is **not** implemented.

A future implementation must define the **denominator** (same supply question as holders). Heuristic clustering (common funding, timing, transfers) is **not** proof of common ownership. An incomplete graph is `UNKNOWN`. No bundle gate may silently PASS.

Until that spec and data exist: **bundle gate = UNKNOWN**.

## Creator / dev exposure (unresolved)

Not implemented. Status = `UNKNOWN`.

## Costs and execution

Slice 1 paper models:

- `cost_model = none` (GROSS; fees/slippage/impact not applied)
- `execution_model = discrete_observed_price_no_quote`

`rw0_exit_v0` **is not implemented as an execution path in `rw0_v1`**. The intended later comparator still records discrete observed prices, threshold, overshoot, and gap flags, and does not invent exact fills. −10% / +20% / 6h remain **x11 comparators**, not proven optima. Foundation must not persist partially truthful close rows with null threshold/overshoot and a fake `gapFlag=false`.

## Persistence

Recovery data lives only in the recovery SQLite file. Production `schema_migrations` and production paper tables are untouched.

Transitions load the current episode **inside** `BEGIN IMMEDIATE` and apply to that persisted row. Stale caller objects cannot overwrite newer state. Create-time one-active and 3/24h checks run inside the write transaction.

Market observations: exact duplicate (episode + pair + collected instant + identical semantic payload) is idempotent. Same identity/timestamp with conflicting price/liquidity/volume/source/fingerprint fails closed. Provider and source must be non-empty after trim.

Holder/bundle/creator (and other) safety evidence in `rw0_v1` is **UNKNOWN-only**. PASS and FAIL for those unimplemented gates are rejected. Exact duplicate (episode + kind + observed instant + identical payload) is idempotent. Same evidence identity with a conflicting payload fails closed. A FAIL row must not be stored while the state machine ignores it.

Every stored observation should keep mint, pair, timestamps, provider/source, signal version/fingerprint, watcher spec/fingerprint, observed price/liquidity/volume/5m change when known. Safety evidence must not silently change episode gate status. `UNKNOWN` never becomes `PASS` from absence of evidence.

Chronological comparisons use parsed UTC instants (`parseUtcInstant` / `assertTimestampOrder`), never raw timestamp-string lexicographic order. Equivalent formats (`...00Z`, `...00.1Z`, `...00.100Z`) are the same or ordered numerically.

Runtime episode creation goes through `persistCreatedEpisode` (`BEGIN IMMEDIATE`, active-episode invariant, cooldown, 3/24h, canonical identity). There is no public `insertEpisode` bypass.
