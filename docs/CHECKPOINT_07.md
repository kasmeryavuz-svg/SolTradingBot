# Checkpoint 07 — First deterministic strategy

This checkpoint adds the first **versioned, deterministic entry-candidate strategy**. It reads a Checkpoint 06 `c06_v1` feature vector and classifies it. It does not trade.

## What a trading strategy is here

In this project a strategy is a **fixed rule set**. It looks at features and answers one analytical question:

Did every required s07_v1 rule pass for this feature vector?

That answer is a **classification**, not a trade.

## Feature, rule, strategy, classification, trade

These words mean different things.

A **feature** is a fact or a calculation from facts. Example:

`buy_share_5m_bps = 6000`

That means 60.00% of the provider’s observed 5-minute **trades** were classified as buys. It is not 60% of USD volume.

A **rule** compares one or more features to a frozen threshold. Example:

`buy_share_5m_bps >= 5500`

A **strategy** is the whole ordered set of required rules plus the decision rule that combines them.

A **classification** is the result:

- `ENTRY_CANDIDATE`
- `NO_ENTRY`
- `INSUFFICIENT_DATA`

A **trade** is a blockchain order, a paper fill, or a position. Checkpoint 07 creates none of those.

If every required rule passes, the classification is `ENTRY_CANDIDATE`. That still does **not** mean:

- a trade happened
- the token will rise
- the strategy is profitable

`s07_v1` is an **experimental baseline strategy hypothesis**. Its performance is unknown until later testing. Checkpoint 08 will evaluate historical behavior. This document does not include simulated returns.

## Strategy identity

- Strategy version: `s07_v1`
- Strategy name: `conservative_flow_momentum_baseline`
- Required feature set: `c06_v1`

These values live in code. They are not environment settings. Thresholds are not CLI flags.

## What s07_v1 asks

1. Is current pair data fresh enough?
2. Is there enough pair liquidity and activity?
3. Is short-window trade flow positively skewed?
4. Is short-window price movement positive but not extreme?
5. Are the selected high-confidence structural risk findings absent?

It does not ask whether price will rise, what return to expect, or when to exit.

## The ten s07_v1 rules

Rules run in this stable order.

### 1. PRICE_POSITIVE

Feature: `market_price_usd`

Pass when the feature is available and the value is greater than 0.

Criterion: `market_price_usd > 0`

### 2. LIQUIDITY_MINIMUM

Feature: `market_liquidity_usd`

Pass when pair-level USD liquidity is at least 50,000.

This is **selected DEX pair liquidity**, not total token liquidity everywhere.

### 3. PAIR_AGE_RANGE

Feature: `pair_age_seconds`

Pass when the DEX pair age is from 900 through 604,800 seconds inclusive. That is 15 minutes through 7 days.

This is pair age. It is not token mint age, token creation age, or project age.

### 4. MARKET_FRESHNESS

Feature: `market_age_seconds`

Pass when the value is from 0 through 120 seconds inclusive.

The strategy consumes the Checkpoint 06 feature. It does not recalculate timestamps on its own.

### 5. TRADES_5M_MINIMUM

Feature: `trades_5m`

Pass when the observed pair trade count is at least 20.

This is provider buy count plus sell count. It is not unique traders.

### 6. VOLUME_LIQUIDITY_5M_MINIMUM

Feature: `volume_to_liquidity_5m_ratio`

Pass when the ratio is at least 0.05. There is no upper bound. A value above 1 can be valid.

### 7. BUY_SHARE_5M_MINIMUM

Feature: `buy_share_5m_bps`

Pass when the value is at least 5500. That means at least 55.00% of observed 5-minute **trades** are provider-classified buys.

This is not 55% buying volume.

### 8. NET_BUYS_5M_MINIMUM

Feature: `net_buys_5m`

Pass when buys minus sells is at least 5.

This is a trade-count difference, not USD order flow.

### 9. PRICE_CHANGE_5M_RANGE

Feature: `market_price_change_5m_pct`

Pass when the provider-observed 5-minute price change is from 1 through 20 inclusive.

That describes the last window. It does not guarantee momentum will continue.

### 10. NO_BLOCKING_RISK_FINDINGS

This one aggregate rule consumes seven Checkpoint 06 boolean features:

- `risk_finding_mint_authority_active`
- `risk_finding_freeze_authority_active`
- `risk_finding_permanent_delegate_active`
- `risk_finding_non_transferable`
- `risk_finding_transfer_hook_active`
- `risk_finding_default_account_state_frozen`
- `risk_finding_transfer_fee_configured`

Pass only when all seven are available and all seven are false.

Fail when at least one available feature is true.

Unavailable when none are true and one or more required risk features are unavailable.

A true blocker beats missing data. Example: mint authority is true and transfer hook is unavailable → the rule **fails**, because there is already a factual reason not to classify the token as an entry candidate.

## Exact frozen thresholds

These are engineering defaults for `s07_v1`. They were not tuned against current database history.

| Name | Value |
| --- | --- |
| `MIN_PRICE_USD_EXCLUSIVE` | 0 |
| `MIN_LIQUIDITY_USD` | 50,000 |
| `MIN_PAIR_AGE_SECONDS` | 900 |
| `MAX_PAIR_AGE_SECONDS` | 604,800 |
| `MAX_MARKET_AGE_SECONDS` | 120 |
| `MIN_TRADES_5M` | 20 |
| `MIN_VOLUME_TO_LIQUIDITY_5M_RATIO` | 0.05 |
| `MIN_BUY_SHARE_5M_BPS` | 5,500 |
| `MIN_NET_BUYS_5M` | 5 |
| `MIN_PRICE_CHANGE_5M_PCT` | 1 |
| `MAX_PRICE_CHANGE_5M_PCT` | 20 |

If later research changes the meaning of a rule, create a **new strategy version**. Do not silently mutate `s07_v1`.

## Decision model

1. If any required rule fails → `NO_ENTRY`
2. Else if any required rule is unavailable → `INSUFFICIENT_DATA`
3. Else all required rules passed → `ENTRY_CANDIDATE`

Failure beats unavailable. Example: liquidity is $10,000 (fail) and risk is unavailable → `NO_ENTRY`.

Missing data is not itself a failure. If liquidity is unavailable and no other required rule failed, the result is `INSUFFICIENT_DATA`, not `NO_ENTRY`.

There is no score, weight, probability, expected return, or “8/10 rules passed” shortcut. One failed required rule is `NO_ENTRY`.

`ENTRY_CANDIDATE` is not BUY, ORDER, or TRADE NOW. `NO_ENTRY` is not a sell instruction. Checkpoint 07 has no position state.

## Why some risk facts are not gates

`risk_data_complete` is not a direct blocker. A partial Checkpoint 05 report can still contain valid mint, authority, and extension facts while largest-token-account data is missing. The seven blocking features decide the risk rule.

Token-account concentration features are not gates. Checkpoint 05 treats them as token-account concentration, not verified beneficial-owner concentration. They may appear as context. They do not decide `s07_v1`.

Token-2022 itself is not a blocker. Only the selected findings above matter.

Transfer-fee configuration **is** a blocker in this baseline. Checkpoint 05 does not claim which Token-2022 transfer-fee schedule is currently effective. `s07_v1` still excludes tokens where `risk_finding_transfer_fee_configured` is true because this first strategy does not model transfer-fee execution effects. That is not a claim that the token currently charges a specific percent.

## Why historical and 1-hour features are not required

`seconds_since_previous_snapshot`, `observed_price_change_from_previous_pct`, and `observed_liquidity_change_from_previous_pct` are not s07_v1 gates. The first strategy stays small enough for a database-free `strategy:check`.

1-hour flow and price features may be shown as context. They do not gate `s07_v1`.

## Why strategy versioning and the fingerprint matter

The definition fingerprint is SHA-256 of a canonical JSON object constructed with an explicit key order. It is portable strategy **data**, not evaluator source code, compiled JavaScript, file bytes, or a git SHA.

The fingerprint covers every decision-affecting `s07_v1` semantic:

- `strategyVersion`, `strategyName`, required feature-set version
- ordered rule records: ordinal, code, category, description, criterion, feature names, expected feature kinds
- named thresholds
- comparison operators and inclusive/exclusive bounds, including `price > 0`, `liquidity >= 50000`, pair age `900..604800`, market age `0..120`, `trades >= 20`, volume/liquidity `>= 0.05`, buy share `>= 5500`, net buys `>= 5`, and price change `1..20`
- the seven blocking risk feature names, in registry order
- risk-aggregate precedence: any true blocker => FAIL; no true blockers and one unavailable => UNAVAILABLE; all seven available and false => PASS
- overall decision precedence: any FAIL => `no_entry`; otherwise any UNAVAILABLE => `insufficient_data`; otherwise => `entry_candidate`

Persisted rule `description` and `criterion` are definition-bound invariants. Changing those strings without changing the fingerprint would let the same `s07_v1` identity store different rule evidence. They are therefore part of the fingerprint.

Dynamic `observed` values are **not** part of the fingerprint. Evaluation `reason` text is derived deterministically from the definition, the feature values, and the resulting status. `evaluatedAt` and `first_recorded_at` are metadata. Database IDs are excluded.

Same semantic definition => same SHA-256 on every machine. The input does not depend on locale, timezone, `Date.now()`, or object-key iteration order of an arbitrary record.

If someone later changes `MIN_LIQUIDITY_USD` from 50,000 to 25,000 but forgets to change `STRATEGY_VERSION`, the fingerprint changes. Persistence then refuses to treat the stored `s07_v1` row as the same strategy. The correct fix is a new strategy version. That protects historical reproducibility.

`evaluatedAt` is metadata only. Re-evaluating the same feature vector later must not change the decision, the rule results, or the strategy source identity.

Strategy source identity is:

- strategy version
- definition fingerprint
- Checkpoint 06 feature source identity

The evaluation’s `asOf` equals the feature vector’s `asOf`. The strategy cannot look at a newer risk scan or later price.

`first_recorded_at` on `strategy_definitions` is metadata: a canonical UTC timestamp of the first time this database stored that version. It is not part of the fingerprint, source identity, or decision. Re-evaluating later must not change it.

## Commands

- `strategy:check` — live features, no database, no persistence
- `strategy:record` — live features plus previous same-pair market from SQLite, then one atomic bundle write
- `strategy:history` — stored evaluations, newest first, no network

There is no `strategy:watch` and no backtester in this checkpoint.

## What Checkpoint 08 will do

Checkpoint 08 will evaluate historical behavior under dedicated point-in-time rules. This checkpoint does not inspect what happened after an `ENTRY_CANDIDATE`.
