# Strategy optimization sources

Checkpoint 17 reviewed external work as **methodology references**. It did **not** copy source, port Python, add Freqtrade or scikit-learn as dependencies, or implement CSCV / PBO.

o17_v1 is a **clean-room TypeScript** anchored walk-forward lab over a **frozen finite catalog**. It is **not** Freqtrade Hyperopt, not sklearn `TimeSeriesSplit`, and not a statistical proof of future profitability.

This file distinguishes:

- **concept used** — an idea we implemented in our own terms
- **concept deliberately NOT implemented** — read and rejected for o17_v1

Observed licenses are described as published on the reviewed pages. This is not a legal opinion.

Date checked: **2026-08-18** (reverified during the Checkpoint 17 hostile audit). Freqtrade Hyperopt remains Optuna/epoch search. sklearn `TimeSeriesSplit` remains equally-spaced **sample-index** expanding CV. Bailey et al. still define PBO via CSCV. o17 still implements **none** of those.

## Matrix

| Source | Date checked | Concept used | Concept deliberately NOT implemented | License / clean-room note |
| --- | --- | --- | --- | --- |
| Freqtrade Hyperopt docs (`docs.freqtrade.io` / `www.freqtrade.io` Hyperopt) | 2026-08-18 | Treat parameter search as a distinct, leakage-prone activity. After any selection, validate with a **separate** backtest/research pass. Do not silently rewrite the strategy from a search dump. | Optuna/Bayesian epochs, `--spaces`, loss-function hyperopt, 500-epoch search, random/parameter JSON overrides, Freqtrade `populate_entry_trend` / `populate_exit_trend` | Freqtrade is **GPL-3.0**. No Freqtrade code was copied. No Freqtrade dependency. |
| Freqtrade Lookahead analysis | 2026-08-18 | Future information must not change a decision at time T. Hostile tests mutate later-segment prices and require unchanged training selection. | Freqtrade’s sliced-dataframe lookahead command, candle-column diff reports, `minimum-trade-amount` cancellation | Clean-room. We already reconstruct c06 vectors point-in-time from stored snapshots. |
| Freqtrade Recursive analysis | 2026-08-18 | Recursive indicators can disagree between truncated and full history; startup windows matter. | EMA/RSI/MACD recursive-formula variance tables, `startup_candle_count` sweeps | Not applicable: o17 does not compute recursive OHLC indicators. |
| Freqtrade strategy / backtest validation guidance (Hyperopt “validate backtesting results”, lookahead/recursive warnings) | 2026-08-18 | Search results can diverge from a later evaluation if config, timerange, or protections differ. Keep methodology frozen. Prefer explicit out-of-sample measurement. | Freqtrade backtesting engine, ROI tables, trailing-stop config keys, protection spaces | Clean-room. o17 uses stored DexScreener snapshots, not Freqtrade OHLCV candles. |
| scikit-learn `TimeSeriesSplit` (stable docs, including user-guide time-series CV) | 2026-08-18 | For time-ordered data, training must precede testing. Successive training windows may be **anchored / expanding supersets**. Random KFold is wrong. | sklearn itself, sample-index splits that assume equally spaced rows, rolling `max_train_size` mode, `gap` in *row* units | No Python/sklearn dependency. o17 splits **equal-duration time spans** because meme snapshots are irregular. |
| Bailey, Borwein, López de Prado & Zhu, *The Probability of Backtest Overfitting* (Journal of Computational Finance; SSRN 2326253; authors’ PDF) | 2026-08-18 | In-sample winners are often mediocre out of sample. Ranking many variants inflates overfitting risk. Report train→OOS degradation. Do not call an IS winner “proven”. | Combinatorially Symmetric Cross-Validation (CSCV), Probability of Backtest Overfitting (PBO) statistic, Deflated Sharpe, Sharpe-based PBO | Academic paper. We cite the warning only. **o17_v1 does not implement CSCV or PBO.** Claiming PBO would be false. |

## What was not copied

- No Freqtrade Python, Hyperopt loss functions, or strategy templates
- No sklearn `TimeSeriesSplit` source or dependency
- No CSCV combinatorial split implementation
- No third-party optimizer names used as if we reproduced them

## Why Freqtrade Hyperopt is not o17

Freqtrade Hyperopt repeatedly backtests while a search algorithm proposes new parameters. That is a large multiple-testing surface. o17 instead ranks a **pre-registered** list of 8 entries and 5 exits with **stage-wise** selection (entries first against frozen x11, then exits for the chosen entry). There is no epoch loop and no threshold mutation after seeing local SQLite results.

## Why sklearn TimeSeriesSplit is only a concept

`TimeSeriesSplit` is an expanding-window CV helper for equally spaced samples. Our research universe is sparse, pair-specific, and timestamped. Splitting by row count would give dense minutes more votes than quiet hours. o17 therefore cuts the **elapsed time span** into six equal-duration segments and uses four anchored folds: train = S1…Sk, test = S(k+1).

## Why CSCV / PBO is not implemented

Bailey et al. estimate the probability that an in-sample optimum underperforms out of sample via many combinatorial IS/OOS splits (CSCV). That procedure is a different experiment, needs a performance matrix over many trials, and is easy to mis-claim. o17 reports chronological OOS measurement, selection frequency, concentration, and promotion refusal. It does **not** output a PBO number.

## Licensing / clean-room

External projects were reviewed as **research references**. This codebase does not copy Freqtrade or scikit-learn source and does not add those projects as dependencies. See also [STRATEGY_RESEARCH_SOURCES.md](./STRATEGY_RESEARCH_SOURCES.md) for the r125 candidate literature notes.
