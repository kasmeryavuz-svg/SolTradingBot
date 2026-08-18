import { describe, expect, it } from 'vitest';
import {
  FROZEN_LOGISTIC_HYPERPARAMETERS,
  averageRegularizedLoss,
  fitL2LogisticRegression,
  isTinyNonNegativeLossImprovement,
  predictProbability,
  regularizedGradients,
} from '../src/ml/logistic.js';
import { MlTrainingError } from '../src/ml/errors.js';

describe('ml logistic trainer', () => {
  it('ranks a synthetic separable dataset and is order-invariant after the given rows', () => {
    const features = [[1], [-1], [1], [-1]];
    const labels = [1, 0, 1, 0] as const;
    const fit = fitL2LogisticRegression({ features, labels: [...labels] });
    expect(fit.hyperparameters).toEqual(FROZEN_LOGISTIC_HYPERPARAMETERS);
    expect(Number.isFinite(fit.intercept)).toBe(true);
    expect(fit.coefficients.every((value) => Number.isFinite(value))).toBe(true);
    const pPos = predictProbability([1], fit.coefficients, fit.intercept);
    const pNeg = predictProbability([-1], fit.coefficients, fit.intercept);
    expect(pPos).toBeGreaterThan(pNeg);
    const reversed = fitL2LogisticRegression({
      features: [...features].reverse(),
      labels: [...labels].reverse(),
    });
    expect(reversed.coefficients[0]).toBeCloseTo(fit.coefficients[0] ?? 0, 10);
    expect(reversed.intercept).toBeCloseTo(fit.intercept, 10);
  });

  it('learns the intercept base rate when features are all zero', () => {
    const features = [[0], [0], [0], [0]];
    const labels = [1, 1, 1, 0] as const;
    const fit = fitL2LogisticRegression({ features, labels: [...labels] });
    expect(fit.coefficients[0]).toBeCloseTo(0, 12);
    const probability = predictProbability([0], fit.coefficients, fit.intercept);
    expect(probability).toBeGreaterThan(0.5);
    expect(probability).toBeLessThan(0.9);
  });

  it('uses the frozen hyperparameters and rejects non-finite rows', () => {
    expect(FROZEN_LOGISTIC_HYPERPARAMETERS.learningRate).toBe(0.05);
    expect(FROZEN_LOGISTIC_HYPERPARAMETERS.maxIterations).toBe(1000);
    expect(FROZEN_LOGISTIC_HYPERPARAMETERS.l2Lambda).toBe(0.01);
    expect(FROZEN_LOGISTIC_HYPERPARAMETERS.interceptRegularized).toBe(false);
    expect(() =>
      fitL2LogisticRegression({ features: [[Number.NaN]], labels: [1] }),
    ).toThrow(MlTrainingError);
  });

  it('matches the documented L2 objective with a finite-difference gradient', () => {
    const features = [[0.5], [-0.25]];
    const labels = [1, 0] as const;
    const coefficients = [0.3];
    const intercept = -0.1;
    const { gradW, gradB } = regularizedGradients(features, [...labels], coefficients, intercept);
    const eps = 1e-8;
    const loss = averageRegularizedLoss(features, [...labels], coefficients, intercept);
    const plusW = averageRegularizedLoss(features, [...labels], [0.3 + eps], intercept);
    const minusW = averageRegularizedLoss(features, [...labels], [0.3 - eps], intercept);
    const plusB = averageRegularizedLoss(features, [...labels], coefficients, intercept + eps);
    const minusB = averageRegularizedLoss(features, [...labels], coefficients, intercept - eps);
    expect(gradW[0]).toBeCloseTo((plusW - minusW) / (2 * eps), 6);
    expect(gradB).toBeCloseTo((plusB - minusB) / (2 * eps), 6);
    expect(Number.isFinite(loss)).toBe(true);
  });

  it('counts only tiny non-negative TRAIN loss decreases as early-stop improvement', () => {
    expect(isTinyNonNegativeLossImprovement(1, 1 - 1e-12)).toBe(true);
    expect(isTinyNonNegativeLossImprovement(1, 1 + 1e-12)).toBe(false);
    expect(isTinyNonNegativeLossImprovement(1, 0.5)).toBe(false);
  });
});
