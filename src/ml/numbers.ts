import { canonicalizeZero } from '../performance/numbers.js';
import { CANONICAL_NUMBER_PRECISION } from './constants.js';
import { MlError, MlTrainingError } from './errors.js';

export function requireMlFinite(value: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MlTrainingError(`Invalid ${field}. Expected a finite number.`);
  }
  return canonicalizeZero(value);
}

export function canonicalNumberString(value: number): string {
  const finite = canonicalizeZero(requireMlFinite(value, 'canonical number'));
  return finite.toPrecision(CANONICAL_NUMBER_PRECISION);
}

export function assertAllFinite(values: readonly number[], field: string): void {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new MlTrainingError(`${field}[${String(index)}] is not a finite number.`);
    }
  }
}

export function clip(value: number, lo: number, hi: number, field: string): number {
  const finite = requireMlFinite(value, field);
  if (finite < lo) {
    return lo;
  }
  if (finite > hi) {
    return hi;
  }
  return finite;
}

export function stableMedian(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => {
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
    return 0;
  });
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    const value = sorted[middle];
    if (value === undefined) {
      throw new MlError('Median index missing.');
    }
    return requireMlFinite(value, 'median');
  }
  const hi = sorted[middle];
  const lo = sorted[middle - 1];
  if (hi === undefined || lo === undefined) {
    throw new MlError('Even-length median neighbors missing.');
  }
  return requireMlFinite((lo + hi) / 2, 'median');
}

export function populationMean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of values) {
    sum += requireMlFinite(value, 'mean summand');
  }
  return requireMlFinite(sum / values.length, 'mean');
}

export function populationStd(values: readonly number[], mean: number): number {
  if (values.length === 0) {
    return 0;
  }
  let sumSquares = 0;
  for (const value of values) {
    const delta = requireMlFinite(value, 'std summand') - mean;
    sumSquares += delta * delta;
  }
  return requireMlFinite(Math.sqrt(sumSquares / values.length), 'std');
}

export function compareCanonicalText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
