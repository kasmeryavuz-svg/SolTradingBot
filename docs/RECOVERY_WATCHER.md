# Recovery Watcher v0 (`rw0_v3`)

Paper/data research only. Automatic live trading is unavailable.

This document is the operator-facing contract for Slice 3A persisted safety evidence. It does **not** claim that Recovery_v0 is profitable, complete, or live-ready.

## What this slice is

Slice 3A retains Slice 2 observation semantics and adds a frozen, persisted, fail-closed safety-evidence reducer on the isolated RW0 database.

- Screening observations are independent of recovery episodes.
- Only a frozen `recovery_v0` dip admits a sticky-pair watch.
- A persisted later observation may confirm recovery.
- Confirmed signals enter `SIGNAL_PENDING_SAFETY`; a decision reads canonical persisted evidence only.
- Any persisted gate `FAIL` produces `REJECTED_SAFETY`; otherwise any `UNKNOWN` produces `REJECTED_SAFETY_UNKNOWN`.
- Even if all four evidence gates pass, Slice 3A produces `REJECTED_SAFETY_UNKNOWN` because evidence-only mode cannot grant paper eligibility.
- No paper position, shadow position, PnL, signing, broadcast, or live execution is added.

`recovery_v0` remains unchanged. Operational semantics are identified as `rw0_v3`; recovery schema version is 2.

## What this slice is not

- Not production (`prod20_v1`)
- Not a change to production schema 9
- Not migration 010
- Not `p09_v1` / `pm10_v1` / `x11_v1` (those remain frozen to `s07_v1`)
- Not safety-approved paper (unreachable in `rw0_v3`)
- Not complete market discovery
- Not a claim that incomplete holder or linked-wallet data is safe
- Not SHADOW_RESEARCH_OPEN / paper / exits / PnL

## Isolation

| Resource      | Recovery Watcher                                                                | Production                                                         |
| ------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Process       | `recovery:status`, `recovery:run`, `recovery:report`                            | `prod:run`                                                         |
| SQLite file   | `./data/recovery-watcher.sqlite` (`RW0_DATABASE_PATH`)                          | configured `DATABASE_PATH` (default `./data/soltradingbot.sqlite`) |
| Schema        | `rw0` version 2 (`rw0_001_initial`, `rw0_002_safety_evidence`) plus SQL digests | version 9 (`001`–`009`)                                            |
| Lock file     | `.rw0-runtime.lock` with ownership-safe pid + process-start identity            | `.prod20-runtime.lock`                                             |
| Trading flags | must be false or the process refuses                                            | must be false or `prod:run` refuses                                |

`TRADING_ENABLED=true` or `LIVE_BROADCAST_ENABLED=true` is fail-closed for recovery status.

`RW0_DATABASE_PATH` is rejected when it resolves to the **configured** production `DATABASE_PATH` from the same environment, and is also rejected when it is the default production path. Existing files are compared by resolved path / realpath / file identity so aliases and symlinks cannot initialize RW0 tables in the production file.

Runtime config **rejects** `RW0_DATABASE_PATH=:memory:`. In-memory SQLite is allowed only through the explicit test helper `openRecoveryMemoryDatabase`. Opening a recovery file database requires `configuredProductionPath`; forgetting that isolation argument fails closed and cannot open production.

File opens go through `openRecoverySqlite(path, { configuredProductionPath })` or `openRecoverySqliteFromConfig(config)`. There is no naked-path runtime open.

Recovery never imports `src/live`, `src/wallet`, `src/production`, or `src/execution`.

## Research tracks (do not overload)

Two tracks exist. They must never share a “paper open” meaning.

### SHADOW_RESEARCH (unsafe research simulation)

State: `SHADOW_RESEARCH_OPEN`

- A reserved research simulation path; Slice 3A does not open it
- May simulate recovery entry/exit **before** holder/bundle/creator gates exist
- `safety_incomplete = true`
- Completeness gate = **FAIL**
- Never counts as live-readiness evidence
- Never appears as `PAPER_ELIGIBLE` or `PAPER_OPEN`
- Entry time/price **may** be the recovery-confirmation observation because the track is explicitly unsafe
- **Cannot** transition to `CLOSED` in `rw0_v3`. Shadow exit execution remains reserved for a dedicated later slice.

### Safety-approved paper (reserved, unreachable in `rw0_v3`)

States: `PAPER_ELIGIBLE` then `PAPER_OPEN`

These **names** are reserved in the type/schema for a later watcher/spec version. In `rw0_v3`:

- Safety evidence can reject only; liquidity/execution safety and paper admission are **not implemented**
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

### Future safety-approved PAPER (not reachable in `rw0_v3`)

1. Recovery confirmation occurs first
2. Safety evidence is collected
3. **All** required safety evidence must have `observed_at <= safe_entry_at`
4. After safety is complete and PASS, entry price must come from the **first fresh market observation at or after safety completion**
5. **Never** backfill the recovery-confirmation price as a safe entry if safety completed later

## Frozen research signal (`recovery_v0`)

Unproven. Discovered in-sample from a tiny historical slice that used **sparse ~5-minute observations**. The intended forward watcher uses a **60-second** confirmation cadence. Historical percentages are **not** proof of that new execution regime. Forward evidence counts only after fingerprint freeze.

### Dip observation

| Field           | Rule                            | Missing data                        |
| --------------- | ------------------------------- | ----------------------------------- |
| 5m price change | `>= -60` and `<= -40` (percent) | fail closed (`REJECTED_INCOMPLETE`) |
| 5m volume USD   | known and `>= 5000`             | fail closed                         |
| Observed price  | known, finite, `> 0`            | fail closed                         |

Dip liquidity and dip V/L are **not** dip gates.

### Recovery confirmation observation

Must be **strictly later**, exact **same pair**, with:

| Field          | Rule                                                  | Missing data          |
| -------------- | ----------------------------------------------------- | --------------------- |
| Observed price | known, finite, `> 0`, and `>` dip observed price      | fail closed / not yet |
| Liquidity USD  | known and `>= 10000`                                  | fail closed           |
| 5m volume USD  | known                                                 | fail closed           |
| V/L            | `volume_5m_usd / liquidity_usd`, `>= 1.0` and `< 3.0` | fail closed           |

V/L is computed from raw confirmation volume and liquidity. A caller-supplied ratio that disagrees with those raw fields fails closed.

Changing any bound requires a new signal version and fingerprint.

## Operational constants (`rw0_v3` watcher spec)

These are fingerprinted separately from the signal so a cadence change cannot silently pretend to be the same experiment.

| Constant                      | Slice 1 value           | Meaning                                                              |
| ----------------------------- | ----------------------- | -------------------------------------------------------------------- |
| Watch cadence                 | 60_000 ms               | approximate high-res poll (not exact 60.000s market sampling)        |
| Watch TTL                     | 7_200_000 ms (2 hours)  | max **entry watch** lifetime after `watchStartedAt`                  |
| Cooldown                      | 7_200_000 ms (2 hours)  | separate fingerprinted constant; mint cooldown after terminal states |
| Max holding                   | 21_600_000 ms (6 hours) | shadow max-hold **CLOSED** comparator, not `EXPIRED`                 |
| Max concurrent high-res slots | 10                      | all `WATCH_SLOT_STATES`, not only `RECOVERY_WATCH`                   |
| Max episodes / mint / 24h     | 3                       | bounded re-observation, not a lifetime ban                           |

`WATCH_SLOT_STATES`: `RECOVERY_WATCH`, `SIGNAL_PENDING_SAFETY`, `SHADOW_RESEARCH_OPEN`, and reserved `PAPER_ELIGIBLE` / `PAPER_OPEN` (unreachable here, counted if they ever appear).

Admission to a new `RECOVERY_WATCH` uses the persisted slot count inside `BEGIN IMMEDIATE`. Ten shadow positions plus ten new recovery watches is forbidden.

`RECOVERY_WATCH -> EXPIRED` is legal only when `transition.at >= watchStartedAt + RW0_WATCH_TTL_MS`. Recovery confirmation is legal only when `recoveryConfirmedAt < watchStartedAt + RW0_WATCH_TTL_MS`. Callers cannot expire a watch early, and cannot confirm at or after the frozen deadline.

`SHADOW_RESEARCH_OPEN` does **not** use the 2h entry-watch `EXPIRED` transition. Shadow **exit / `CLOSED` is not implemented in `rw0_v3`**. A later dedicated slice must bind close evidence to a persisted market observation and record threshold, overshoot, and gap. Future `PAPER_OPEN` must not use entry-watch `EXPIRED`.

## Episode identity

`episode_id = SHA-256(mint, pair, dip_observed_at, signal_fingerprint)`

One **active** episode per mint (application check **and** a partial UNIQUE index). Cooldown does not permanently ban the mint. A later **new** dip (new `dip_observed_at`) may open a new episode after cooldown and within the 3/24h cap.

Persisted episodes must match `rw0_v3` signal/watcher/shadow/exit fingerprints and `cost_model=none` / `execution_model=discrete_observed_price_no_quote`. The recovery migration SQL digest is stored and bound into the watcher fingerprint. Drift without a version bump fails closed.

## State machine

Active: `DISCOVERED`, `DIP_CANDIDATE`, `RECOVERY_WATCH`, `SIGNAL_PENDING_SAFETY`, `SHADOW_RESEARCH_OPEN` (`PAPER_ELIGIBLE` / `PAPER_OPEN` reserved, unreachable)

Terminal-before-cooldown: `CLOSED`, `EXPIRED`, `REJECTED_FILTER`, `REJECTED_INCOMPLETE`, `REJECTED_SAFETY`, `REJECTED_SAFETY_UNKNOWN`, `REJECTED_CAP`, `CENSORED_UNAVAILABLE`

Terminal: `COOLDOWN`

`CENSORED_UNAVAILABLE` is not a win or a loss. A token disappearing is not a completed trade.

Illegal transitions fail closed.

Idempotency is exact: retrying the **same** semantic event (target, timestamp, reason, payload / event identity) may no-op. The same target state with a different event identity fails closed as a conflict.

`CLOSED` is reserved in types/schema but **unreachable** in `rw0_v3`. If a later slice implements exit execution, `CloseEvidence.observedAt` and `observationCollectedAt` must identify the **same** persisted market-observation instant. `CENSORED_UNAVAILABLE` remains separate and is never a win/loss.

## Discovery coverage

DexScreener latest profile/boost feeds are acceptable for `rw0_v3` **research collection**. They are **not** complete market discovery.

Tokens that never appear on those feeds, tokens dropped by production’s cap-20 persist path, and tokens that crash between polls can be missing. Discovery coverage remains a completeness **FAIL**.

## Frozen safety evidence (`rw0_safety_v2`)

The SHA-256 fingerprint covers the rules below. Every evidence row binds episode, mint, pinned pair, confirmation timestamp/event, signal identity, watcher identity, safety identity, observation time, collection time, provider, provenance, and canonical payload. Evidence before confirmation, evidence collected after a decision, future evidence, and mismatched identities fail closed.

### Token rights

Slice 3A reuses Checkpoint 05 factual extension classifiers. Active mint/freeze/delegate/pause/close authority, non-transferability, active transfer hook, frozen default account state, configured transfer fee, or paused capability is `FAIL`. Unsupported token programs and unparsed, unclassified, or incomplete facts are `UNKNOWN`. `PASS` requires a complete supported fact set with no dangerous or incompatible capability.

### Holder concentration

The hard bound is `largest_real_holder_pct <= 10%`.

- **Numerator:** largest aggregate of all nonexcluded token accounts sharing one beneficial owner.
- **Denominator:** total supply minus balances excluded by positive identification as pool, vault, burn, or program-controlled.
- Every exclusion records kind, subject address, source, and observation timestamp. An unexplained account is never excluded.
- Checkpoint 18 top-20 data alone can never `PASS`, even after owner aggregation.
- An observed aggregate above 10% is sufficient to `FAIL`. At or below 10%, incomplete owner coverage or supply reconciliation is `UNKNOWN`.
- Hard-gate comparison is exact BigInt arithmetic (`numerator * 100` versus `denominator * 10`); decimal percentages are reporting only.
- Unavailable provider data stores `null` supply and denominator with incomplete flags, never fabricated economics.

### Linked/bundle evidence

The hard bound is `linked_bundle_pct <= 20%`. Evidence persists the clustering rule, member owners and amounts, numerator inputs, effective-supply denominator, member provenance, confidence, graph completeness, and membership completeness. A heuristic cluster is not asserted to be ownership. A complete cluster above 20% is `FAIL`; any incomplete graph or membership set is `UNKNOWN`. The hard comparison uses exact BigInt arithmetic. Unavailable provider data stores a `null` denominator and no measured members.

### Creator/dev evidence

Missing trustworthy creator identity is `UNKNOWN`; no identity is guessed. Retained creator control capability is `FAIL`. `PASS` requires trustworthy identity provenance, complete controlled-account coverage, no retained control, and complete zero-exposure evidence. Nonzero exposure remains `UNKNOWN` because Slice 3A freezes no arbitrary creator percentage threshold.

## Costs and execution

Slice 1 paper models:

- `cost_model = none` (GROSS; fees/slippage/impact not applied)
- `execution_model = discrete_observed_price_no_quote`

`rw0_exit_v0` **is not implemented as an execution path in `rw0_v3`**.

## Persistence

Recovery data lives only in the recovery SQLite file. Production `schema_migrations` and production paper tables are untouched.

Transitions load the current episode **inside** `BEGIN IMMEDIATE` and apply to that persisted row. Stale caller objects cannot overwrite newer state. Create-time one-active and 3/24h checks run inside the write transaction.

The generic in-memory and persisted transition APIs reject both safety-rejection targets. Only the internal persisted-evidence decision reducer can produce `REJECTED_SAFETY` or `REJECTED_SAFETY_UNKNOWN`.

Market observations: exact duplicate (episode + pair + collected instant + identical semantic payload) is idempotent. Same identity/timestamp with conflicting price/liquidity/volume/source/fingerprint fails closed. Provider and source must be non-empty after trim.

Token-rights, holder, bundle, and creator evidence in `rw0_v3` is hydrated through the canonical `rw0_safety_v2` evaluator. Exact duplicate evidence is idempotent; the same episode/kind/observed instant with a conflicting payload fails closed. Direct-SQL payload/status/identity/future-time tampering is rejected during hydration, report, and decision.

Every stored observation keeps mint, pair, timestamps, provider/source, signal version/fingerprint, watcher spec/fingerprint, and observed economics when known. Safety status is recomputed from the persisted payload; `UNKNOWN` never becomes `PASS` from absence of evidence.

Chronological comparisons use parsed UTC instants (`parseUtcInstant` / `assertTimestampOrder`), never raw timestamp-string lexicographic order. Equivalent formats (`...00Z`, `...00.1Z`, `...00.100Z`) are the same or ordered numerically.

Runtime episode creation goes through `persistCreatedEpisode` (`BEGIN IMMEDIATE`, active-episode invariant, cooldown, 3/24h, canonical identity). There is no public `insertEpisode` bypass.

## Slice 2 screening vs episodes

Ordinary DexScreener tokens are recorded in `rw0_screening_observations` with **no episode FK**.

Frozen screening dispositions: `DIP_PASS`, `NOT_DIP`, `INCOMPLETE`, `MARKET_UNAVAILABLE`, `WATCH_CAP_FULL`, `EPISODE_LIMIT`, `COOLDOWN`, `ALREADY_ACTIVE`, `SKIPPED_CAP`.

`dip_filter_result` is stored separately as `PASS` | `NOT_DIP` | `INCOMPLETE` | `NOT_EVALUATED`. A genuine `recovery_v0` dip that cannot be admitted because the watch cap, 3/24h episode limit, or cooldown is full is still `dip_filter_result=PASS` with operational disposition `WATCH_CAP_FULL` / `EPISODE_LIMIT` / `COOLDOWN`. Reports count genuine dip-filter PASS rows separately from admitted watches. Do not treat capacity-blocked dips as if the detector did not fire.

`NOT_DIP` and `INCOMPLETE` do **not** create a recovery episode, do **not** consume the 3-admitted-episodes/mint/24h cap, do **not** start cooldown, and do **not** occupy an active episode. The mint may be observed again later.

Exact duplicate screening identity (`mint + screenedAt + signalFingerprint + watcherSpecFingerprint`) with the same payload is idempotent. The same identity with a conflicting payload fails closed.

Screening rows must match the current frozen `recovery_v0` / `rw0_v3` versions **and** fingerprints. Mixed-definition screening evidence fails closed on insert, hydration, and report.

Admission (`persistAdmittedDipWatch`) binds screening and market observation as the **same** observed event inside `BEGIN IMMEDIATE`: same mint, pair, UTC instant, price, liquidity, 5m volume, 5m change, frozen identities, operational `DIP_PASS`, and a **recomputed** `recovery_v0` dip filter pass from the raw economics. A caller cannot admit a non-dip by labeling it `DIP_PASS`.

Pair selection is allowed for screening only. After a dip is admitted, the pair is pinned. Exact-pair misses do not fall back to a new best pair. Missing pair / HTTP / 429 / timeout does not invent a price and does not immediately mark a losing trade. The watch may retry on a later tick while still before TTL.

`collectedAt` is this process's collection time. DexScreener latest profile/boost and token-pairs payloads do not expose a trustworthy quote/trade timestamp through the existing adapter; none is invented.

## Slice 2 scheduler

`recovery:run` uses isolated RW0 SQLite and the rw0 singleton lock. Startup order is: validate live gates → ensure the parent runtime directory exists → acquire `.rw0-runtime.lock` → open the isolated DB → initialize/verify schema → create providers → first network call. Lock-acquisition failure does not create or migrate the recovery DB.

Scheduling policy is `watch_due_target_from_pass_start`, not fixed-delay-after-completion:

- Watch cadence **target** is 60_000 ms from the monotonic start of the previous watch pass.
- After work: `sleep max(0, next_due - monotonic_now)`.
- If work overran the deadline, run **one** next due pass. Do **not** queue or catch up multiple missed cycles.
- Market evidence timestamps remain UTC wall-clock. Scheduler elapsed/deadlines use a monotonic clock.
- This is **not** a claim of exact 60.000-second market sampling.

Active `RECOVERY_WATCH` polling is the highest-priority timed work. Independent exact-pair HTTP requests run with bounded concurrency 10, then persist serially in `episode_id` order. SQLite writes stay serial. One recoverable provider failure does not corrupt another watch result. There is no retry storm.

Screening (2 concurrent discovery calls, then up to 20 enrichments at concurrency 4) runs only in leftover time until the next watch due, clipped by a frozen 20_000 ms wall budget. Remaining candidates after budget exhaustion are recorded as `SKIPPED_CAP` with reason `screening wall-time budget exhausted`. Screening must not delay a due watch by several minutes.

`recovery:report` opens the existing file with `DatabaseSync(..., { readOnly: true })` and `PRAGMA query_only = ON`. It does not mkdir, migrate, or change WAL. A missing DB reports `not initialized` without creating the file.

Unknown/unclassified thrown errors are fatal. Known `MarketDataError`, `DiscoveryError`, and explicitly tagged `RecoveryWatcherError` `provider_unavailable` are recoverable for that tick.

No overlapping cycles, no `Math.random` jitter. Live flags must be false before any network call.

Discovery per screening cycle: 2 calls (latest profiles + latest boosts). Screening enrichment cap: 20. Max high-resolution watches: 10. Network timeout: 10_000 ms. Our cap is not a claim of exact DexScreener rate-limit safety.

Slice 3A confirmation end state is `RECOVERY_WATCH` → `SIGNAL_PENDING_SAFETY` (bound to the persisted observation) → one of the two safety rejection states, reduced from persisted evidence. That is not a strategy loss. No shadow/paper/PnL.

## Forward-evidence freeze

The bounded public one-cycle DexScreener smoke collected before this Slice-2 repair is **disposable engineering smoke only**. It is **excluded** from strategy forward-validation evidence. Do not merge that database into later validation results. Do not use it for performance claims.

After this repair is approved, the first **retained** forward run freezes the watcher fingerprint and schema/migration digest for that dataset. Do not run another public smoke until the repair is reviewed.
