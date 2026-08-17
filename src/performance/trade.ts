import { divideFinite, multiplyFinite, requireFiniteNumber, subtractFinite } from './numbers.js';
import {
  PerformanceError,
  type GrossTradeInputs,
  type GrossTradeMetrics,
  type TradeOutcome,
} from './types.js';

export function calculateGrossExitValueUsd(quantityTokens: number, exitPriceUsd: number): number {
  requireFiniteNumber(quantityTokens, 'quantityTokens');
  requireFiniteNumber(exitPriceUsd, 'exitPriceUsd');
  return multiplyFinite(quantityTokens, exitPriceUsd, 'grossExitValueUsd');
}

export function calculateGrossPnlUsd(
  grossExitValueUsd: number,
  entryReferenceNotionalUsd: number,
): number {
  requireFiniteNumber(grossExitValueUsd, 'grossExitValueUsd');
  requireFiniteNumber(entryReferenceNotionalUsd, 'entryReferenceNotionalUsd');
  return subtractFinite(grossExitValueUsd, entryReferenceNotionalUsd, 'grossPnlUsd');
}

export function calculateGrossReturnPct(entryPriceUsd: number, exitPriceUsd: number): number {
  requireFiniteNumber(entryPriceUsd, 'entryPriceUsd');
  requireFiniteNumber(exitPriceUsd, 'exitPriceUsd');
  if (!(entryPriceUsd > 0)) {
    throw new PerformanceError('Gross return requires a finite entryPriceUsd greater than 0.');
  }

  const ratio = divideFinite(exitPriceUsd, entryPriceUsd, 'exitPriceUsd / entryPriceUsd');
  return multiplyFinite(subtractFinite(ratio, 1, 'gross return ratio - 1'), 100, 'grossReturnPct');
}

export function calculateHoldingDurationMs(openedAtMs: number, exitedAtMs: number): number {
  if (!Number.isSafeInteger(openedAtMs) || !Number.isSafeInteger(exitedAtMs)) {
    throw new PerformanceError(
      'Holding duration requires safe-integer UTC millisecond timestamps.',
    );
  }
  if (exitedAtMs < openedAtMs) {
    throw new PerformanceError('Holding duration requires exitedAt to be at or after openedAt.');
  }

  const duration = exitedAtMs - openedAtMs;
  if (!Number.isSafeInteger(duration) || duration < 0) {
    throw new PerformanceError(
      'Holding duration produced a non-safe non-negative millisecond value.',
    );
  }
  return duration;
}

export function classifyGrossOutcome(grossPnlUsd: number): TradeOutcome {
  requireFiniteNumber(grossPnlUsd, 'grossPnlUsd');
  if (grossPnlUsd > 0) {
    return 'win';
  }
  if (grossPnlUsd < 0) {
    return 'loss';
  }
  return 'breakeven';
}

export function calculateGrossTradeMetrics(input: GrossTradeInputs): GrossTradeMetrics {
  if (!(input.entryPriceUsd > 0) || !Number.isFinite(input.entryPriceUsd)) {
    throw new PerformanceError(
      'Gross trade metrics require a finite entryPriceUsd greater than 0.',
    );
  }
  if (!(input.entryReferenceNotionalUsd > 0) || !Number.isFinite(input.entryReferenceNotionalUsd)) {
    throw new PerformanceError(
      'Gross trade metrics require a finite entryReferenceNotionalUsd greater than 0.',
    );
  }
  if (!(input.quantityTokens > 0) || !Number.isFinite(input.quantityTokens)) {
    throw new PerformanceError(
      'Gross trade metrics require a finite quantityTokens greater than 0.',
    );
  }
  if (input.exitPriceUsd < 0 || !Number.isFinite(input.exitPriceUsd)) {
    throw new PerformanceError(
      'Gross trade metrics require a finite exitPriceUsd of 0 or greater.',
    );
  }

  const grossExitValueUsd = calculateGrossExitValueUsd(input.quantityTokens, input.exitPriceUsd);
  const grossPnlUsd = calculateGrossPnlUsd(grossExitValueUsd, input.entryReferenceNotionalUsd);
  const grossReturnPct = calculateGrossReturnPct(input.entryPriceUsd, input.exitPriceUsd);
  const holdingDurationMs = calculateHoldingDurationMs(input.openedAtMs, input.exitedAtMs);

  return {
    grossExitValueUsd,
    grossPnlUsd,
    grossReturnPct,
    holdingDurationMs,
    outcome: classifyGrossOutcome(grossPnlUsd),
  };
}
