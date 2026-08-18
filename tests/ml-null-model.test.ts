import { describe, expect, it } from 'vitest';
import { fitInterceptOnlyNullModel } from '../src/ml/null-model.js';

describe('ml null model', () => {
  it('uses the TRAIN positive rate with epsilon protection and not the TEST rate', () => {
    const fit = fitInterceptOnlyNullModel([1, 0, 1, 0]);
    expect(fit.probability).toBeCloseTo(0.5, 12);
    expect(fit.trainPositiveRate).toBe(0.5);
    const allPositive = fitInterceptOnlyNullModel([1, 1, 1, 1]);
    expect(allPositive.probability).toBeLessThan(1);
    expect(allPositive.probability).toBeGreaterThan(0.9);
    const allNegative = fitInterceptOnlyNullModel([0, 0, 0, 0]);
    expect(allNegative.probability).toBeGreaterThan(0);
    expect(allNegative.probability).toBeLessThan(0.1);
  });
});
