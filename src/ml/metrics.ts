import { MODEL_SIGNAL_THRESHOLD } from './constants.js';
import { MlError } from './errors.js';
import { stableLogLoss } from './logistic.js';
import { requireMlFinite } from './numbers.js';
import type { CalibrationBin, ClassificationMetrics, MlBinaryLabel } from './types.js';

export type ScoredLabel = {
  probability: number;
  label: MlBinaryLabel;
};

export function isResearchSelected(probability: number): boolean {
  return requireMlFinite(probability, 'probability') >= MODEL_SIGNAL_THRESHOLD;
}

/**
 * Tie-aware ROC-AUC equivalent to Mann-Whitney:
 * P(score_positive > score_negative) + 0.5 * P(tie).
 * Independent of input row order. Single-class input returns null.
 */
export function rocAuc(rows: readonly ScoredLabel[]): number | null {
  const positives = rows.filter((row) => row.label === 1);
  const negatives = rows.filter((row) => row.label === 0);
  if (positives.length === 0 || negatives.length === 0) {
    return null;
  }
  let wins = 0;
  for (const positive of positives) {
    for (const negative of negatives) {
      if (positive.probability > negative.probability) {
        wins += 1;
      } else if (positive.probability === negative.probability) {
        wins += 0.5;
      }
    }
  }
  return requireMlFinite(wins / (positives.length * negatives.length), 'rocAuc');
}

/**
 * Average precision over descending predicted-score groups.
 *
 * 1. Group samples by exact predicted probability.
 * 2. Walk groups from high score to low.
 * 3. After each group is added, precision = tp / (tp+fp).
 * 4. AP = sum(precision * groupPositives) / totalPositives.
 *
 * Ties are one group, so AP does not depend on input order.
 * Single-class negative-only input returns null (no positive to recall).
 */
export function averagePrecision(rows: readonly ScoredLabel[]): number | null {
  const positives = rows.filter((row) => row.label === 1).length;
  if (positives === 0) {
    return null;
  }
  const groups = new Map<string, { probability: number; positives: number; negatives: number }>();
  for (const row of rows) {
    const key = Object.is(row.probability, -0) ? '0' : String(row.probability);
    const current = groups.get(key) ?? { probability: row.probability, positives: 0, negatives: 0 };
    if (row.label === 1) {
      current.positives += 1;
    } else {
      current.negatives += 1;
    }
    groups.set(key, current);
  }
  const ordered = [...groups.values()].sort((left, right) => {
    if (left.probability > right.probability) {
      return -1;
    }
    if (left.probability < right.probability) {
      return 1;
    }
    return 0;
  });
  let tp = 0;
  let fp = 0;
  let sum = 0;
  for (const group of ordered) {
    tp += group.positives;
    fp += group.negatives;
    const precision = tp / (tp + fp);
    sum += precision * group.positives;
  }
  return requireMlFinite(sum / positives, 'prAuc');
}

export function meanLogLoss(rows: readonly ScoredLabel[]): number | null {
  if (rows.length === 0) {
    return null;
  }
  let sum = 0;
  for (const row of rows) {
    sum += stableLogLoss(row.label, row.probability);
  }
  return requireMlFinite(sum / rows.length, 'logLoss');
}

export function brierScore(rows: readonly ScoredLabel[]): number | null {
  if (rows.length === 0) {
    return null;
  }
  let sum = 0;
  for (const row of rows) {
    const error = row.probability - row.label;
    sum += error * error;
  }
  return requireMlFinite(sum / rows.length, 'brierScore');
}

export function calibrationBins(rows: readonly ScoredLabel[]): CalibrationBin[] {
  const bins: CalibrationBin[] = [
    { binIndex: 0, startInclusive: 0, endExclusive: 0.2, includesOne: false, count: 0, meanPredictedProbability: null, observedPositiveFraction: null },
    { binIndex: 1, startInclusive: 0.2, endExclusive: 0.4, includesOne: false, count: 0, meanPredictedProbability: null, observedPositiveFraction: null },
    { binIndex: 2, startInclusive: 0.4, endExclusive: 0.6, includesOne: false, count: 0, meanPredictedProbability: null, observedPositiveFraction: null },
    { binIndex: 3, startInclusive: 0.6, endExclusive: 0.8, includesOne: false, count: 0, meanPredictedProbability: null, observedPositiveFraction: null },
    { binIndex: 4, startInclusive: 0.8, endExclusive: 1, includesOne: true, count: 0, meanPredictedProbability: null, observedPositiveFraction: null },
  ];
  const sums = bins.map(() => ({ probability: 0, positives: 0 }));
  for (const row of rows) {
    const index = binIndex(row.probability);
    const bin = bins[index];
    const sum = sums[index];
    if (bin === undefined || sum === undefined) {
      throw new MlError('Calibration bin index out of range.');
    }
    bin.count += 1;
    sum.probability += row.probability;
    sum.positives += row.label;
  }
  return bins.map((bin, index) => {
    const sum = sums[index];
    if (sum === undefined) {
      throw new MlError('Calibration sum missing.');
    }
    if (bin.count === 0) {
      return bin;
    }
    return {
      ...bin,
      meanPredictedProbability: requireMlFinite(sum.probability / bin.count, 'calibration mean p'),
      observedPositiveFraction: requireMlFinite(sum.positives / bin.count, 'calibration observed'),
    };
  });
}

export function binIndex(probability: number): number {
  const p = requireMlFinite(probability, 'probability');
  if (p < 0 || p > 1) {
    throw new MlError('Calibration requires probability in [0, 1].');
  }
  if (p === 1) {
    return 4;
  }
  if (p >= 0.8) {
    return 4;
  }
  if (p >= 0.6) {
    return 3;
  }
  if (p >= 0.4) {
    return 2;
  }
  if (p >= 0.2) {
    return 1;
  }
  return 0;
}

export function classificationMetrics(rows: readonly ScoredLabel[]): ClassificationMetrics {
  const positiveCount = rows.filter((row) => row.label === 1).length;
  const negativeCount = rows.length - positiveCount;
  let truePositiveCount = 0;
  let falsePositiveCount = 0;
  let trueNegativeCount = 0;
  let falseNegativeCount = 0;
  for (const row of rows) {
    const selected = isResearchSelected(row.probability);
    if (selected && row.label === 1) {
      truePositiveCount += 1;
    } else if (selected && row.label === 0) {
      falsePositiveCount += 1;
    } else if (!selected && row.label === 0) {
      trueNegativeCount += 1;
    } else {
      falseNegativeCount += 1;
    }
  }
  const selectedCount = truePositiveCount + falsePositiveCount;
  const precision =
    selectedCount === 0 ? null : requireMlFinite(truePositiveCount / selectedCount, 'precision');
  const recall =
    positiveCount === 0 ? null : requireMlFinite(truePositiveCount / positiveCount, 'recall');
  return {
    labeledSamples: rows.length,
    positiveCount,
    negativeCount,
    positiveBaseRate:
      rows.length === 0 ? null : requireMlFinite(positiveCount / rows.length, 'positive base rate'),
    rocAuc: rocAuc(rows),
    prAuc: averagePrecision(rows),
    logLoss: meanLogLoss(rows),
    brierScore: brierScore(rows),
    threshold: MODEL_SIGNAL_THRESHOLD,
    selectedCount,
    precision,
    recall,
    truePositiveCount,
    falsePositiveCount,
    trueNegativeCount,
    falseNegativeCount,
    calibration: calibrationBins(rows),
  };
}
