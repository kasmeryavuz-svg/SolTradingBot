# ML research sources

Primary and statistical references used while specifying Checkpoint 19 (`ml19_v1`, `purged_walk_forward_regularized_logistic_research_lab`). Date checked: **2026-08-18**.

This checkpoint does **not** call runtime external ML APIs. There is no TensorFlow, scikit-learn, XGBoost, or network model server in the dependency graph. The trainer is a small deterministic TypeScript implementation. This file records the statistical meanings bound in code. It is not a license to copy trading-strategy repositories.

## Logistic regression

- Cox, D. R. (1958). “The regression analysis of binary sequences.” *Journal of the Royal Statistical Society: Series B*, 20(2), 215–232. Binary outcomes with a linear predictor and logit link.
- Hosmer, D. W., Lemeshow, S., & Sturdivant, R. X. (2013). *Applied Logistic Regression* (3rd ed.). Wiley. L2-penalized logistic regression as a regularized likelihood; intercept commonly left unpenalized.

ml19_v1 uses full-batch gradient descent on mean log-loss plus `λ Σ w_j²` with `λ = 0.01`, intercept excluded from the penalty, all-zero initialization, and no randomness.

## Log loss / logarithmic scoring rule

- Good, I. J. (1952). “Rational decisions.” *Journal of the Royal Statistical Society: Series B*, 14(1), 107–114. Logarithmic score for probability forecasts.
- Gneiting, T., & Raftery, A. E. (2007). “Strictly proper scoring rules, prediction, and estimation.” *Journal of the American Statistical Association*, 102(477), 359–378. Log loss and Brier are strictly proper.

ml19 clips probabilities to `[1e-12, 1 - 1e-12]` before `-y log p - (1-y) log(1-p)`.

## ROC-AUC

- Hanley, J. A., & McNeil, B. J. (1982). “The meaning and use of the area under a receiver operating characteristic (ROC) curve.” *Radiology*, 143(1), 29–36.
- Fawcett, T. (2006). “An introduction to ROC analysis.” *Pattern Recognition Letters*, 27(8), 861–874.

ml19 uses the Mann–Whitney interpretation: probability that a random positive scores higher than a random negative, with tied scores contributing 0.5. The value does not depend on input row order. A single class returns `null` (`NOT_EVALUABLE`), never a fabricated 0 or 1.

## PR-AUC / average precision

- Manning, C. D., Raghavan, P., & Schütze, H. (2008). *Introduction to Information Retrieval*. Cambridge University Press. Average precision as precision at each positive, averaged.

ml19 freezes **average precision over descending predicted-score groups**: samples with the exact same predicted probability are one group. After each group is added, precision = tp/(tp+fp); AP = Σ (precision × group positives) / total positives. Ties therefore cannot change AP when input order changes.

## Brier score

- Brier, G. W. (1950). “Verification of forecasts expressed in terms of probability.” *Monthly Weather Review*, 78(1), 1–3.

ml19: mean of `(p − y)²` over labeled samples.

## Probability calibration

- Niculescu-Mizil, A., & Caruana, R. (2005). “Predicting good probabilities with supervised learning.” *ICML*. Reliability diagrams / binned observed frequency versus mean predicted probability.
- Guo, C., Pleiss, G., Sun, Y., & Weinberger, K. Q. (2017). “On calibration of modern neural networks.” *ICML*. Calibration is not implied by AUC.

ml19 uses five fixed bins `[0.0,0.2), [0.2,0.4), [0.4,0.6), [0.6,0.8), [0.8,1.0]` with the last bin including 1.0. No learned calibrator.

## Time-series / walk-forward validation and temporal leakage

- López de Prado, M. (2018). *Advances in Financial Machine Learning*. Wiley. Purged cross-validation and embargo: training labels whose outcome windows overlap the test period must be removed.
- Arnott, R., Harvey, C. R., & Markowitz, H. (2019). “A backtesting protocol in the era of machine learning.” *Journal of Financial Data Science*. Research design that forbids using the test set to pick the model.

ml19 reuses Checkpoint 17’s exact integer-millisecond six-segment partition and four anchored folds. TRAIN labels must finish strictly before TEST start. TEST outcomes may not borrow the next segment. There is no shuffled k-fold and no OOS model selection.

## Point-in-time features

Frozen `c06_v1` reconstruction is the feature engine. ml19 does not invent new market indicators and does not join later wallet-intelligence scans onto older snapshots.

## What was intentionally not used

Unofficial “AI meme-coin bot,” hyperopt tutorials, and AutoML competition code are not sources of truth. Neural nets, gradient boosting, and reinforcement learning are outside `ml19_v1`.
