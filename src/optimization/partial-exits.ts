import { requireFiniteNumber, subtractFinite } from '../performance/numbers.js';
import { MOONBAG_CLOSE_FRACTION, PARTIAL_RUNNER_CLOSE_FRACTION } from './constants.js';
import { OptimizationError } from './types.js';

export function closeFractionQuantity(originalQuantityTokens: number, closeFraction: number): number {
  requireFiniteNumber(originalQuantityTokens, 'originalQuantityTokens');
  requireFiniteNumber(closeFraction, 'closeFraction');
  if (!(originalQuantityTokens > 0)) {
    throw new OptimizationError('Original quantity must be greater than 0.');
  }
  if (!(closeFraction > 0) || closeFraction > 1) {
    throw new OptimizationError('Close fraction must be in (0, 1].');
  }
  const hundredths = Math.round(closeFraction * 100);
  if (hundredths < 1 || hundredths > 100) {
    throw new OptimizationError('Close fraction hundredths must be in 1..100.');
  }
  const closed = requireFiniteNumber(
    (originalQuantityTokens * hundredths) / 100,
    'closed quantity',
  );
  if (!(closed > 0) || closed > originalQuantityTokens) {
    throw new OptimizationError('Closed quantity must be within the original position.');
  }
  return closed;
}

export function remainingAfterClose(originalQuantityTokens: number, closedQuantityTokens: number): number {
  const remaining = subtractFinite(originalQuantityTokens, closedQuantityTokens, 'remaining quantity');
  if (remaining < 0) {
    throw new OptimizationError('Remaining quantity cannot be negative.');
  }
  return remaining;
}

export function assertQuantityConserved(
  originalQuantityTokens: number,
  realizedQuantityTokens: number,
  remainingQuantityTokens: number,
): void {
  const remaining = remainingAfterClose(originalQuantityTokens, realizedQuantityTokens);
  if (remaining !== remainingQuantityTokens) {
    throw new OptimizationError('Realized + remaining quantity must equal original quantity exactly.');
  }
}

export function assertRealizedDoesNotExceedOriginal(
  originalQuantityTokens: number,
  realizedQuantityTokens: number,
): void {
  if (realizedQuantityTokens - originalQuantityTokens > 0) {
    throw new OptimizationError('Realized quantity cannot exceed original quantity.');
  }
}

export const PARTIAL_RUNNER_CLOSE_FRACTION_FROZEN = PARTIAL_RUNNER_CLOSE_FRACTION;
export const MOONBAG_CLOSE_FRACTION_FROZEN = MOONBAG_CLOSE_FRACTION;
