# Completeness Gate

Permanent checklist. A market idea is not a paper candidate, and a paper candidate is not a live candidate, until every section has an explicit answer.

Allowed answers: `PASS`, `FAIL`, `UNKNOWN`, or a dated exception that still fail-closes automation.

`UNKNOWN` is not `PASS`. Missing data is not safe.

Live trading remains unavailable for this project unless a later checkpoint explicitly changes that contract. This file does not authorize live trading.

## How to use

1. Copy the sixteen sections.
2. Fill them for the named signal/spec/fingerprint.
3. If any required hard gate is `FAIL` or `UNKNOWN`, the candidate must not enter `PAPER_ELIGIBLE` / `PAPER_OPEN`. In `rw0_v1` those states are unreachable even if a caller tries to set statuses PASS.
4. Unsafe simulations, if any, must use `SHADOW_RESEARCH_OPEN` only, with `safety_incomplete=true` and completeness gate `FAIL`.
5. Shadow research never counts as live-readiness evidence.

## Sixteen sections

### MARKET SIGNAL

What is the entry hypothesis? What is frozen (version + fingerprint)? What would falsify it? Is it in-sample or forward?

### LIQUIDITY / SLIPPAGE

Displayed liquidity vs exit capacity. Missing liquidity fail-closed? Impact/slippage model? Pool concentration?

### SCAM / TOKEN RIGHTS

Mint/freeze/permanent delegate/hooks/fees/pausable/non-transferable. Honeypot/sell simulation. Incomplete mint evidence?

### HOLDER CONCENTRATION

State numerator, denominator, total vs circulating/tradable supply, LP/vault/burn exclusions, owner aggregation (including outside top-20), incomplete coverage → `UNKNOWN`, point-in-time rule. Do not treat token-account rank as beneficial owner share.

### CREATOR / DEV EXPOSURE

How creator/dev wallets are identified. Missing identification → `UNKNOWN`.

### BUNDLE / LINKED WALLETS

State denominator. Heuristic cluster ≠ ownership. Incomplete graph → `UNKNOWN`. No silent PASS.

### WALLET BEHAVIOR

What wallet-history evidence is used, if any, and what it is not (not buy/sell labels unless proven).

### DATA FRESHNESS / QUALITY

Stale, missing, duplicate, pair stickiness, provider failure, timestamp order, look-ahead.

### ENTRY EXECUTION

Which observation is the fill. Shadow vs safe-entry timing. No future information. No backfill of an earlier confirmation price after later safety completion.

### EXIT EXECUTION

Discrete observation vs invented fill. Stop, take-profit, time, gap/overshoot, MAE/MFE as observed-only.

### FEES / COSTS

Swap, network, priority, slippage, impact, failed routes. If unmodeled, say GROSS and do not promote as net edge.

### RISK / POSITION SIZING

Notional vs liquidity. Caps. Fail-closed when size cannot be justified.

### CENSORING

Disappeared/unavailable data is not a win or loss. Report censor fraction.

### OUT-OF-SAMPLE / FORWARD VALIDATION

Evidence collected after fingerprint freeze only. Do not replay the discovery sample as proof.

### PAPER VS LIVE DEVIATION

Quote vs mark, fees, gaps, route availability, honeypot, latency.

### LIVE SAFETY

Signer, broadcast, flags, caps. If live is unavailable, say so. Completeness FAIL forbids live.

---

## Recovery_v0 / `rw0_v1` answers (Foundation Slice 1)

Signal fingerprint and watcher fingerprint are the compiled SHA-256 identities in `src/recovery-watcher/identity.ts`.

| Gate | Answer | Notes |
| ---- | ------ | ----- |
| MARKET SIGNAL | **FAIL** as a proven edge; **frozen as unproven research** | `recovery_v0`: dip is 5m change in `[-60, -40]`, dip volume `>= 5000`, dip price known finite `> 0`. Confirmation (later, same pair) requires price `>` dip, liquidity `>= 10000`, known 5m volume, and V/L computed from those confirmation fields in `[1.0, 3.0)`. In-sample, tiny N, sparse ~5-minute historical observations. Forward 60s confirmation is a **new** regime; historical percentages are not proof of it. |
| LIQUIDITY / SLIPPAGE | **FAIL** | Displayed pair liquidity only, and only as a **confirmation** gate (`>= 10000`). No impact model. Missing confirmation liquidity fail-closed. $10k ≠ exit-safe. |
| SCAM / TOKEN RIGHTS | **UNKNOWN** | CP05 reuse is planned later, not in this slice. Pausable-paused must block in a future safety adapter. No honeypot/LP-lock/metadata. |
| HOLDER CONCENTRATION | **UNKNOWN** | `largest_real_holder_pct` is not implemented. Numerator/denominator/supply choice/exclusions/owner aggregation (including outside top-20) are unresolved. Incomplete coverage is UNKNOWN, not a proof that remainder supply hides a single >10% token account. |
| CREATOR / DEV EXPOSURE | **UNKNOWN** | Not implemented. |
| BUNDLE / LINKED WALLETS | **UNKNOWN** | `linked_bundle_pct` is not implemented. Denominator undefined. Heuristics ≠ ownership. Incomplete graph = UNKNOWN. No silent PASS. |
| WALLET BEHAVIOR | **UNKNOWN** | wi18 exists in the repo but is not a recovery input in this slice. |
| DATA FRESHNESS / QUALITY | **FAIL** for discovery completeness; **PASS** only for slice-1 timestamp/look-ahead rules in the state machine | DexScreener latest profile/boost is incomplete discovery. Pair must be sticky once an episode starts. Nested timestamps and evidence `observedAt` are rejected if future relative to the operation clock. |
| ENTRY EXECUTION | **FAIL** for live; **explicit for shadow**; **unreachable for safe paper in rw0_v1** | Shadow may enter at recovery confirmation. `PAPER_ELIGIBLE` / `PAPER_OPEN` cannot be reached, including by manually setting statuses PASS. Real holder/bundle/creator/token-rights/liquidity-execution safety requires a new spec version and fingerprint. |
| EXIT EXECUTION | **FAIL** as realistic fills; **not implemented in rw0_v1** | `CLOSED` from `SHADOW_RESEARCH_OPEN` is unavailable until a dedicated shadow-exit slice. Do not persist close rows with null threshold/overshoot and a fake gap flag. Intended later comparator: observed price, overshoot/gap recorded, no invented exact fill; `observedAt` and `observationCollectedAt` must be the same market-observation instant. |
| FEES / COSTS | **FAIL** | `cost_model = none` (GROSS). |
| RISK / POSITION SIZING | **UNKNOWN** | No recovery notional rule in this slice. |
| CENSORING | **PASS** as a rule | `CENSORED_UNAVAILABLE` is not win/loss. |
| OUT-OF-SAMPLE / FORWARD VALIDATION | **FAIL** until post-freeze forward 60s data exists | 5m historical replay is not 60s execution evidence. Historical percentages are not proof of the new confirmation regime. |
| PAPER VS LIVE DEVIATION | **FAIL** | No quote, no fees, discrete marks, incomplete discovery, UNKNOWN safety. |
| LIVE SAFETY | **PASS** as unavailable | No signer, no wallet import, no broadcast. Flags true → recovery refuses. Shadow and paper tracks cannot enable live. |

**Overall:** completeness gate **FAIL**. Shadow research may be recorded as unsafe simulation. `PAPER_ELIGIBLE` / `PAPER_OPEN` are **unreachable in `rw0_v1`**. Manually setting holder/bundle/creator PASS does not make safe paper reachable. A later spec that implements those gates needs a new version and fingerprint.
