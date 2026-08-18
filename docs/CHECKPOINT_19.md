# Checkpoint 19 — Advanced models / ML

Checkpoint 19 builds a **deterministic, read-only supervised machine-learning research lab**.

It asks whether already-frozen point-in-time **c06** features contain out-of-sample information about later **cost-adjusted** x11 outcomes. It does **not** ask how to make a backtest look profitable. It does **not** search models, thresholds, or hyperparameters on TEST. It does **not** connect predictions to paper or live execution.

Spec: `ml19_v1`  
Name: `purged_walk_forward_regularized_logistic_research_lab`

Schema stays **9**. Migration **010 does not exist**.

Wallet intelligence (`wi18_v1`) exists, but **is not a model input**. Most historical market observations do not have holder scans collected at or before those observations. Joining a later scan would leak the future.

## Beginner map

| Idea | What it means here |
| --- | --- |
| Supervised learning | Each sample has features known at time T and a later label. The lab fits one frozen model family that maps features to a probability |
| Feature | A frozen c06 number or boolean describing the market at T. Not a mint, pair, symbol, row id, fold id, or future outcome |
| Label | 1 if BASE-cost x11 net PnL > 0, else 0. Unresolved paths are CENSORED, not forced closed |
| TRAIN | The earlier period that may fit medians, z-score stats, logistic coefficients, and the intercept-only null model |
| TEST / OOS | The later period that only receives frozen TRAIN objects and is scored |
| Why random split is wrong | Time is ordered. Training on the future and testing on the past is leakage |
| Point-in-time | Features at T use only evidence available at T |
| Purging | A TRAIN sample whose label evidence reaches TEST is removed from TRAIN |
| Logistic regression | One weight per transformed feature plus intercept; output is a probability |
| Predicted probability | A number in (0, 1), not a guarantee and not a live order |
| ROC-AUC | Chance a random positive scores higher than a random negative; ties contribute 0.5 |
| Log loss | Penalizes confident wrong probabilities |
| Brier score | Mean squared probability error |
| Calibration | Do 0.6-ish predictions win about 60% of the time in that bin? |
| Cost-adjusted labels | 200 bps in and 200 bps out can turn a small gross winner into a non-positive label |
| Why wallet intelligence is unused | Historical scans are not uniformly available at or before each market snapshot |
| Why this is research-only | Even a passing OOS lab result is not live profitability |

A good historical result is still only a description of **this sample**. It is not a forecast.

## What this lab uses

- The exact conservative r125/o17 research snapshot universe
- Frozen `c06_v1` point-in-time features, no invented indicators
- Frozen `x11_v1` full-close path: 10% stop, 20% take, 6-hour max hold, observed-price fills
- Frozen cost17 BASE 200/200 bps labels; BASE and STRESS economic diagnostics
- Frozen `$100` reference notional
- Exact o17 integer-millisecond six-segment / four-fold partitions
- One trainable model: full-batch L2 logistic regression
- One null model: TRAIN positive rate (epsilon-clipped), applied as a constant on TEST
- Frozen decision threshold 0.65 — no search

## What this lab must not do

- Alter s07, x11, r125, o17, paper, or live
- Use wallet-intelligence features as model inputs
- Persist models, coefficients, predictions, or winners to SQLite
- Call the network, a wallet, Jupiter, Jito, or `live:execute`
- Use TEST statistics for imputation, scaling, threshold, or model choice
- Implement neural nets, trees, boosting, AutoML, or hyperparameter search
- Claim `LIVE_READY`, `DEPLOY`, `WINNER`, or profitable AI

## Sampling and labels

Eligible decision observations are research-universe snapshots with a finite price > 0. For each token+pair, take the earliest observation, then the next at or after T+6 hours, and so on. Cooldown uses time only.

Each sample is labeled by simulating frozen x11 on later same-pair observations inside the 6-hour label window. The entry row itself cannot be reused as future evidence (`collectedAt > T`). T+6h is included. No last-price close. BASE net PnL > 0 ⇒ POSITIVE (1); ≤ 0 ⇒ NON_POSITIVE (0), including exact zero.

## Walk-forward and purging

| Fold | TRAIN | TEST |
| --- | --- | --- |
| 1 | S1+S2 | S3 |
| 2 | S1+S2+S3 | S4 |
| 3 | S1+S2+S3+S4 | S5 |
| 4 | S1+S2+S3+S4+S5 | S6 |

A TRAIN sample is kept only if its label completion is **strictly before** TEST start. Label end equal to TEST start is purged. TEST labels that need the next segment are censored for that fold.

## Preprocessing (TRAIN only)

Nullable numeric features: TRAIN median imputation plus a 0/1 missingness indicator. Entirely missing TRAIN column: impute 0.

Frozen TRAIN median: sort finite TRAIN values; odd N uses the middle value; even N uses the arithmetic mean of the two middle values; all-missing column uses 0. TEST never participates.

Boolean policy is explicit and is **not** median-imputed:

| observation | value | missing |
| --- | --- | --- |
| observed false | 0 | 0 |
| observed true | 1 | 0 |
| missing | 0 | 1 |

Missing is not treated as observed false. Missing indicators are not standardized.

Continuous imputed values are z-scored with TRAIN **population** mean `sum(x)/N` and variance `sum((x-mean)^2)/N` (not sample N-1). std 0 ⇒ z=0. Clip to [-10, +10]. TEST uses the frozen TRAIN transformer. The per-fold preprocessing fingerprint binds feature order/types/nullable flags, TRAIN medians/means/stds, boolean-missing policy, clip bounds, and missing-indicator order. It does not bind TEST statistics.

## Evaluation universes

These counts are not interchangeable:

| Universe | Definition |
| --- | --- |
| Classification | labeled TEST samples only |
| Model signal | every feature-valid TEST decision sample |
| Economic completed | threshold-selected samples with a completed fold-bounded x11 outcome |
| Selected censoring | threshold-selected samples without a completed outcome |

The lab scores the full feature-valid TEST universe with the frozen TRAIN preprocessor and TRAIN model **before** reading outcome status. Availability of a completed label is not a prerequisite for model selection. Economic PnL / expectancy / PF / DD use completed selected observations only. Censoring remains visible beside them. “40 completed” is not “40 selected trades” when selected censored trades also exist.

Selected censoring bps = `floor(selectedCensored * 10000 / selectedOpened)`. `selectedOpened == 0` is `NOT_ENOUGH_DATA`. Promotion requires selected aggregate censoring ≤ 3500 bps, and the same per fold when that fold otherwise has enough selected observations.

General TRAIN/TEST label censoring must also be ≤ 3500 bps on every promotion-evaluable fold. A young database with most outcomes unresolved remains `NO_MODEL_PROMOTION_INSUFFICIENT_DATA`.

## Trainer

Initialization: all coefficients and intercept 0. Learning rate 0.05, max 1000 iterations, L2 λ=0.01, intercept not regularized. Sigmoid logits clipped to [-35, +35]. Probability epsilon 1e-12.

Frozen objective:

`L = mean binary log-loss + λ Σ w_j²`

λ is **not** divided by N. The intercept is not in the penalty.

Gradient:

`∂L/∂w_j = mean((p-y) x_j) + 2λ w_j`

`∂L/∂b = mean(p-y)`

Early stop: a tiny **non-negative** TRAIN-loss decrease `0 ≤ previousLoss-currentLoss < 1e-10` for 5 consecutive iterations. A loss increase is not an “improvement” and resets the counter.

TRAIN rows are sorted canonically before every reduction: entry timestamp, token mint, pair address, sample identity.

Non-finite values fail closed. Non-convergence is reportable but blocks promotion.

## Promotion

Allowed statuses:

- `NO_MODEL_PROMOTION_INSUFFICIENT_DATA`
- `NO_MODEL_PROMOTION_FAILED_VALIDATION`
- `ELIGIBLE_FOR_FORWARD_PAPER_MODEL_VALIDATION`

Status precedence:

1. Runtime integrity FAIL → `NO_MODEL_PROMOTION_FAILED_VALIDATION`
2. Labeled-sample minima or TRAIN/TEST label-censoring readiness fail → `NO_MODEL_PROMOTION_INSUFFICIENT_DATA`
3. Enough data, but a robustness/model/selected-censoring/baseline gate fails → `NO_MODEL_PROMOTION_FAILED_VALIDATION`
4. Else eligible

A young database is expected to be insufficient. That is not a reason to loosen gates. Eligibility still does not edit s07, write a model file, or enable live. `ml:run` does not train the forward candidate. `ml:candidate` retrains it only after independent OOS verification and only if eligible, using only samples whose label is fully known by the last-snapshot cutoff.

Promotion requires every gate: all four folds evaluable; trainer converged in all folds; aggregate OOS labeled ≥ 120; aggregate ROC-AUC ≥ 0.55; model log-loss and Brier strictly better than the TRAIN-rate null model; at least 3 of 4 folds with ROC-AUC > 0.50; 0.65-selected slice ≥ 40 completed aggregate and ≥ 5 per fold; selected and TRAIN/TEST label censoring ≤ 35%; selected BASE and STRESS expectancy > 0; BASE profit factor ≥ 1.10 (structured infinite can pass; undefined fails); research drawdown percent ≤ 20%; top1 ≤ 40% and top3 ≤ 70%; comparable s07+x11 baseline on the exact same TEST observation interval with the same 35% censoring limit; model-selected BASE expectancy greater than that baseline; model-selected STRESS expectancy at least as large; runtime integrity PASS.

If sample minima or censoring readiness fail: `NO_MODEL_PROMOTION_INSUFFICIENT_DATA`. If there is enough data but a robustness/model gate fails: `NO_MODEL_PROMOTION_FAILED_VALIDATION`.

ML decision-sample membership and the s07 baseline share the exact fold TEST **observation** interval (`isObservationInWindow` / o17 TEST start and end). The baseline does **not** use `latestEntryInclusive` to shorten that interval. s07 keeps its own frozen entry/signal policy, including skip-while-open. ML keeps its 6h cooldown sampler. Comparison is: same chronological evaluation interval, different frozen entry policies. Outcomes use the same fold-bounded x11 rule: COMPLETED or CENSORED, no later-fold completion, no forced close, no pre-filter on outcome availability.

Shared 6h boundary: the first sample at T may use T+6h as final x11 evidence, and the next sample at T+6h may use that same row as a new entry. The first sample does not use the second sample’s future.

A token is novel iff its mint never appears in that fold’s TRAIN **decision samples**, including censored TRAIN rows.

## Frozen c06 inputs

ml19 uses the 48 frozen c06_v1 scalar features in registry order. 47 are nullable and receive a missingness indicator, so the transformed dimension is 95. Token mint, pair, symbol, row IDs, timestamps-as-IDs, labels, PnL, fold IDs, and wallet addresses are forbidden. c06 has no non-numeric categorical text fields. Wallet-intelligence fields are not inputs.

## Residual limitations

Runtime integrity checks explicit invariants. It does not mathematically prove the absence of every possible leakage. The labeler still loads the full same-pair snapshot series from the already-built in-memory research indexes, then rechecks `collectedMs > T`, `T+6h` inclusive, and the fold bound locally. There is no separate SQL time-bounded outcome query. If integrity FAIL and a data-readiness gate both exist, integrity FAIL wins. If a robustness `FAIL`/`NOT_COMPARABLE` exists together with a later `NOT_ENOUGH_DATA` gate, `NO_MODEL_PROMOTION_FAILED_VALIDATION` wins after the integrity check. A passing OOS result is still only a description of this historical sample. Checkpoint 20 is not started. `live:execute` is not called.

## Commands

```bash
npm run ml:status
npm run ml:features
npm run ml:data
npm run ml:run
npm run ml:folds
npm run ml:candidate
```

There is no `ml:live`, `ml:trade`, `ml:deploy`, `ml:auto`, or `ml:optimize`.

See [ML_RESEARCH_SOURCES.md](ML_RESEARCH_SOURCES.md) for statistical references. This checkpoint does not require runtime external ML APIs.
