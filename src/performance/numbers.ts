import { PerformanceError } from './types.js';

export const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Canonical domain zero is IEEE +0.
 *
 * This is not rounding. `-0` and `+0` compare equal with `===` and both
 * classify as breakeven, but `Object.is(-0, 0)` is false and some formatters
 * can print a misleading negative sign. Every finite analytics number is
 * normalized through `requireFiniteNumber`.
 */
export function canonicalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

export function requireFiniteNumber(value: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PerformanceError(`Invalid ${field}. Expected a finite number.`);
  }
  return canonicalizeZero(value);
}

export function multiplyFinite(left: number, right: number, field: string): number {
  return requireFiniteNumber(left * right, field);
}

export function divideFinite(numerator: number, denominator: number, field: string): number {
  return requireFiniteNumber(numerator / denominator, field);
}

export function subtractFinite(left: number, right: number, field: string): number {
  return requireFiniteNumber(left - right, field);
}

export function requireUtcMillis(value: string, field: string): number {
  if (!ISO_UTC_PATTERN.test(value)) {
    throw new PerformanceError(
      `Invalid ${field}. Expected a canonical UTC ISO-8601 timestamp such as 2026-08-17T10:00:00.000Z.`,
    );
  }

  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) {
    throw new PerformanceError(`Invalid ${field}. The timestamp could not be parsed.`);
  }

  if (new Date(millis).toISOString() !== value) {
    throw new PerformanceError(
      `Invalid ${field}. The timestamp is not a valid UTC calendar instant.`,
    );
  }

  return millis;
}

type NeumaierAccumulator = {
  add(value: number): number;
  value(): number;
};

/**
 * Neumaier compensated summation.
 *
 * a12_v1 aggregate totals use this rule instead of rounding each addend.
 * Changing the summation algorithm requires a new analytics spec.
 */
export function createNeumaierAccumulator(): NeumaierAccumulator {
  let sum = 0;
  let compensation = 0;

  const current = (): number => canonicalizeZero(requireFiniteNumber(sum + compensation, 'compensated sum'));

  return {
    add(value: number): number {
      requireFiniteNumber(value, 'summand');
      const total = sum + value;
      if (Math.abs(sum) >= Math.abs(value)) {
        compensation += sum - total + value;
      } else {
        compensation += value - total + sum;
      }
      sum = total;
      return current();
    },
    value: current,
  };
}

export function neumaierSum(values: readonly number[]): number {
  const accumulator = createNeumaierAccumulator();
  for (const value of values) {
    accumulator.add(value);
  }
  return accumulator.value();
}

export function meanOf(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return divideFinite(neumaierSum(values), values.length, 'mean');
}

export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort(compareFiniteNumbers);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return requireFiniteNumber(sorted[middle] ?? Number.NaN, 'median');
  }

  const lower = requireFiniteNumber(sorted[middle - 1] ?? Number.NaN, 'median lower');
  const upper = requireFiniteNumber(sorted[middle] ?? Number.NaN, 'median upper');
  return divideFinite(neumaierSum([lower, upper]), 2, 'median');
}

export function compareFiniteNumbers(left: number, right: number): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
