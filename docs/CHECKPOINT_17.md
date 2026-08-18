# Checkpoint 17 — Strategy optimization

Checkpoint 17 builds a **controlled strategy-optimization research lab**.

It asks which frozen entry and exit hypotheses survive chronological out-of-sample testing, conservative friction assumptions, and concentration checks. It does **not** prove that any candidate will make money live. It does **not** connect strategy signals to Checkpoint 16. It does **not** write optimization tables.

Spec: `o17_v1`  
Name: `anchored_walk_forward_cost_stress_strategy_optimizer`  
Cost spec: `cost17_v1`

Schema stays **8**. Migration **009 does not exist**.

## Beginner map

| Idea | What it means here |
| --- | --- |
| Optimization | Choosing among a **frozen finite catalog**, not inventing new thresholds after seeing the local database |
| Overfitting | Fitting rules to one sample until the backtest looks good. o17 tries to make that harder, not impossible |
| In-sample / TRAIN | The period where a fold is **allowed** to select an entry and then an exit |
| Out-of-sample / TEST / OOS | The later period used only to **measure** the already-chosen pair. It cannot pick a replacement winner |
| Walk-forward | Repeating train-then-test as time moves forward, instead of one lucky split |
| Anchored training | Each later fold keeps all earlier segments in TRAIN (S1…Sk) and uses the next segment as TEST |
| Why random train/test is wrong | Time series are ordered. Training on the future and testing on the past leaks information that a live trader would not have had |
| Why OOS cannot choose the winner | If you try every idea on the test set and keep the best, the test set is no longer a test. It becomes another training set |
| Why costs matter | GROSS paper PnL ignores spread, slippage, impact, fees, latency, and adverse fills. o17 applies three **assumed** all-in bps scenarios. They are not measured historical execution costs |
| Why meme winners create concentration risk | One lucky token can dominate PnL. Top1/top3 positive-profit shares are fragility evidence |
| Why partial profits can look attractive | Closing 50% at +20% looks neat on a spreadsheet. Sparse snapshots may never show the runner path. o17 requires observed fills and reports `partially_realized_censored` if the remainder never closes |
| Why sparse snapshots cause censoring | The database stores observations, not a full intraperiod OHLC path. If later required rows are missing, the trade stays unresolved. o17 does not close at last price |
| Why no interpolation | Inferring hidden highs/lows or exact crossing times would invent fills that were never observed |
| Why 40 pairs are not brute-force ranked | 8 entries × 5 exits = 40 combinations. Ranking all 40 on TRAIN would multiply selection chances. Stage A compares 8 entries using frozen x11. Stage B then compares 5 exits for the one chosen entry |
| Why stage-wise selection reduces search | You pay the multiple-testing cost of 8 + 5 comparisons per fold, not 40 |
| Why a paper-validation candidate is still not live-approved | `ELIGIBLE_FOR_FORWARD_PAPER_VALIDATION` only names a pair to watch in a **future paper period**. It does not edit s07, enable paper, or allow `live:execute` |

A good historical result is still only a description of **this sample**. It is not a forecast.

## What this lab uses

- The exact conservative r125 research universe (exclude snapshots referenced by `exit_evaluations.market_snapshot_id` **before** optimization)
- Frozen `c06_v1` point-in-time features
- Five frozen r125 entries, unchanged, plus three pre-registered CP17 entries
- Five exit hypotheses, including frozen x11 as the control exit
- Frozen pm10 `$100` reference notional and `quantity = 100 / entryPriceUsd`
- Four anchored folds over six equal-duration time segments
- 24-hour max-hold cutoff so a trade’s observation window stays inside its fold
- LOW / BASE / STRESS all-in friction **assumptions**

## What this lab must not do

- Alter s07_v1, x11_v1, or r125_v1
- Automatically promote a strategy to live or paper
- Connect signals to the CP16 broadcaster
- Call Jupiter, Solana RPC, Jito, or a wallet
- Use live internet data
- Use future information
- Optimize until something looks profitable
- Claim statistical proof of future profitability
- Implement Freqtrade Hyperopt, sklearn, CSCV, or PBO
- Create migration 009 or persist winners to SQLite

## Walk-forward

The eligible research **time span** is split into six **integer-millisecond** chronological segments S1…S6. Not randomly. Not by row count. Not by IEEE `span/6` floats.

Widths: the first `span % 6` segments receive `floor(span/6)+1` ms; the rest receive `floor(span/6)` ms. Widths sum to `span` exactly. S1–S5 are `[start, next)` exclusive. S6 is `[start, lastMs]` inclusive. Every included snapshot belongs to exactly one segment.

| Fold | TRAIN | TEST |
| --- | --- | --- |
| 1 | S1+S2 | S3 |
| 2 | S1+S2+S3 | S4 |
| 3 | S1+S2+S3+S4 | S5 |
| 4 | S1+S2+S3+S4+S5 | S6 |

Public readiness is three flags, never a generic YES:

| Flag | Meaning |
| --- | --- |
| `timePartitionsConstructible` | S1…S6 exist as an exact integer partition |
| `walkForwardEvaluable` | every fold has a 24h-eligible TRAIN entry window **and** TEST observations **and** TEST-eligible entries |
| `promotionDataSufficient` | selected-strategy OOS sample meets the frozen trade/censor gates |

New TRAIN entries must occur at or before `trainEnd − 24h` (inclusive cutoff). New TEST entries must occur at or before `testObservationEnd − 24h`. An exit observation after the fold’s observation end cannot complete that fold’s trade.

The 24h cutoff provides the **maximum configured clock-time window inside the fold**. It does **not** guarantee a closing observation exists. Sparse data stays censored.

History **before** the window may still be used for previous-market and as-of risk facts. An OOS simulation must **not** start with a position entered inside TRAIN. Future rows may not.

Aggregate selected OOS measures the **walk-forward selection methodology**. Folds may pick different pairs. That is not one fixed strategy’s OOS proof.

## Stage-wise selection

For each fold, on TRAIN only:

1. **Stage A:** compare all 8 entries using `x11_baseline`. Need ≥ 20 completed trades and ≤ 35% unresolved/censored. Rank by stress expectancy, then base profit factor, then lower base drawdown, then base median, then smaller candidate id.
2. **Stage B:** with the one chosen entry, compare all 5 exits on the same TRAIN window using the same ranking.

If no entry is eligible: `NO_TRAIN_ENTRY_SELECTION`. OOS still reports the two controls.

OOS then evaluates **only** the frozen chosen pair, plus:

- Control 1: `s07_baseline` + `x11_baseline`
- Control 2: `quality_control_v1` + `x11_baseline`

## Observation-only exits

Stops, takes, and trails fire only on an observed same-pair snapshot.

- Take-profit fill: use the **target** price, not a better overshoot
- Stop-loss / trailing fill: use the **observed** price (gaps can be worse than the threshold)
- Peak for a trail: highest **observed** post-entry price
- Frozen `x11_baseline` still uses the frozen x11 evaluator (observed take fill). That is an intentional **historical control**. New o17 exits use target-take fills. Stage B is **not** a perfectly normalized execution comparison. Do not change x11 to make it comparable.

Quantity is `100 / gross reference entry price`. LOW/BASE/STRESS apply friction **after** a gross leg exists. Triggers (entry classification, stop, take, partial, trail peak, max hold) use the frozen GROSS path. Effective cash outlay under friction **may exceed $100**.

Partial/moonbag remaining quantity is `original − closed`, so realized + remaining equals the original position exactly. `partially_realized_censored` is not a completed trade. Its realized-leg evidence must not improve completed-trade ranking, drawdown, concentration, or promotion metrics.

Drawdown USD is peak-to-trough of cumulative **completed-trade** net PnL sorted by exit time (economic identity tie-break). Drawdown **percent** denominator is **peak cumulative completed-trade net PnL**, not `completedTrades × $100` and not a bankroll. o17 has no capital constraint. If peak ≤ 0, percent is undefined and the promotion drawdown gate fails.

Censored fraction = `(unresolved + partially_realized_censored) / opened`. `opened = 0` → null → ineligible. Training needs ≥ 20 completed trades and ≤ 35% censored.

Partial runner: at +20% close exactly `0.50` of original quantity; remainder trails 12% below observed peak; max hold 12h.

Moonbag: at +25% close exactly `0.67` of original quantity; remainder trails 20% below observed peak; max hold 24h.

If the first leg realizes and the runner is still open at fold/dataset end: `partially_realized_censored`. That is not a completed closed trade.

## Promotion vocabulary

Never output: PROFITABLE, EDGE PROVEN, READY FOR LIVE, GUARANTEED, WINNING STRATEGY.

Allowed:

- `NO_PROMOTION_INSUFFICIENT_DATA`
- `NO_PROMOTION_FAILED_ROBUSTNESS`
- `ELIGIBLE_FOR_FORWARD_PAPER_VALIDATION`

Even the last one is **not** live approval. If and only if every **required** gate is in an allowed passing state (`PASS`, never `FAIL` / `NOT_ENOUGH_DATA` / `NOT_COMPARABLE` / undefined), o17 may name a `PAPER_VALIDATION_CANDIDATE` from a final full-history training selection. That selection is not fresh OOS proof. Failed promotion invokes the paper selector **zero** times.

Baseline comparison is comparable only when the control is evaluated on all four exact OOS windows **and** has ≥ 40 aggregate completed trades **and** ≥ 5 completed in each test fold. Otherwise the gate is `NOT_COMPARABLE`, which is **not PASS** and blocks eligibility. A missing baseline is not an accidental true.

Runtime integrity (disjoint train/test, exact partition, no outcome beyond observation end, frozen selected ids, coverage accounting, fingerprints) is evaluated on **this dataset**. Unit tests are development evidence, not this runtime gate. Integrity `FAIL` makes promotion impossible (`NO_PROMOTION_FAILED_ROBUSTNESS`).

Insufficient-data gates are decided before profitability language. Three wildly profitable trades still yield `NO_PROMOTION_INSUFFICIENT_DATA`.

On a young database, insufficient data is the honest result. Do not loosen the 24h cutoff, minimum 20 TRAIN trades, minimum 40 OOS trades, costs, or catalogs to manufacture a winner.

## Commands

```bash
npm run optimization:status
npm run optimization:catalog
npm run optimization:data
npm run optimization:run
npm run optimization:folds
```

All are research / read-only. There is no `optimization:live` or `optimization:paper-promote`. `npm run dev` does not run optimization.

## Sources

External methodology notes: [STRATEGY_OPTIMIZATION_SOURCES.md](./STRATEGY_OPTIMIZATION_SOURCES.md).
