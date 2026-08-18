import { describe, expect, it } from 'vitest';
import {
  averagePrecision,
  brierScore,
  calibrationBins,
  classificationMetrics,
  isResearchSelected,
  meanLogLoss,
  rocAuc,
} from '../src/ml/metrics.js';
import { MODEL_SIGNAL_THRESHOLD } from '../src/ml/constants.js';
import { stableLogLoss } from '../src/ml/logistic.js';

describe('ml metrics', () => {
  it('computes tie-aware ROC-AUC independent of order', () => {
    expect(rocAuc([{ probability: 0.9, label: 1 }, { probability: 0.1, label: 0 }])).toBe(1);
    expect(rocAuc([{ probability: 0.1, label: 1 }, { probability: 0.9, label: 0 }])).toBe(0);
    expect(rocAuc([{ probability: 0.5, label: 1 }, { probability: 0.5, label: 0 }])).toBe(0.5);
    expect(rocAuc([{ probability: 0.7, label: 1 }, { probability: 0.7, label: 1 }])).toBeNull();
    const mixed = [
      { probability: 0.2, label: 0 as const },
      { probability: 0.8, label: 1 as const },
      { probability: 0.8, label: 0 as const },
    ];
    expect(rocAuc(mixed)).toBe(rocAuc([...mixed].reverse()));
  });

  it('computes group average precision, log loss, Brier, and calibration boundaries', () => {
    const rows = [
      { probability: 0.9, label: 1 as const },
      { probability: 0.9, label: 0 as const },
      { probability: 0.1, label: 0 as const },
    ];
    expect(averagePrecision(rows)).toBeCloseTo((0.5 * 1 + 1 / 3 * 0) / 1, 12);
    expect(meanLogLoss([{ probability: 0.5, label: 1 }])).toBeCloseTo(stableLogLoss(1, 0.5), 12);
    expect(brierScore([{ probability: 0.25, label: 1 }])).toBeCloseTo(0.5625, 12);
    const bins = calibrationBins([
      { probability: 0, label: 0 },
      { probability: 0.2, label: 1 },
      { probability: 0.4, label: 0 },
      { probability: 0.6, label: 1 },
      { probability: 0.8, label: 0 },
      { probability: 1, label: 1 },
    ]);
    expect(bins).toHaveLength(5);
    expect(bins[0]?.count).toBe(1);
    expect(bins[1]?.startInclusive).toBe(0.2);
    expect(bins[4]?.includesOne).toBe(true);
    expect(bins[4]?.count).toBe(2);
    const empty = calibrationBins([]);
    expect(empty.every((bin) => bin.count === 0)).toBe(true);
    expect(empty.every((bin) => bin.meanPredictedProbability === null && bin.observedPositiveFraction === null)).toBe(
      true,
    );
    expect(averagePrecision([{ probability: 0.9, label: 0 }])).toBeNull();
    expect(averagePrecision([{ probability: 0.2, label: 1 }, { probability: 0.1, label: 1 }])).toBe(1);
    const tied = [
      { probability: 0.4, label: 1 as const },
      { probability: 0.4, label: 0 as const },
      { probability: 0.4, label: 1 as const },
    ];
    expect(averagePrecision(tied)).toBe(averagePrecision([...tied].reverse()));
  });

  it('uses the frozen 0.65 threshold with no search', () => {
    expect(MODEL_SIGNAL_THRESHOLD).toBe(0.65);
    expect(isResearchSelected(0.649999)).toBe(false);
    expect(isResearchSelected(0.65)).toBe(true);
    expect(isResearchSelected(0.650001)).toBe(true);
    const metrics = classificationMetrics([
      { probability: 0.65, label: 1 },
      { probability: 0.649999, label: 0 },
    ]);
    expect(metrics.selectedCount).toBe(1);
    expect(metrics.truePositiveCount).toBe(1);
    expect(metrics.falsePositiveCount).toBe(0);
  });
});
