import { compareText, requireFiniteNumber } from '../performance/numbers.js';
import { TRAIN_MAX_CENSORED_FRACTION, TRAIN_MIN_COMPLETED_TRADES } from './constants.js';
import { compareProfitFactorDesc } from './metrics.js';
import { OptimizationError, type ProfitFactor, type StageSelection, type TrainingCandidateMetrics } from './types.js';

/**
 * Selector input. OOS prices, OOS metrics, and future outcomes are not
 * structurally part of this type and must not be passed here.
 */
export type TrainingSelectorInput = {
  candidateId: string;
  candidateDefinitionFingerprint: string;
  eligibility: 'eligible' | 'TRAIN_INELIGIBLE';
  completedTrades: number;
  censoredFraction: number | null;
  stressExpectancyUsd: number | null;
  baseProfitFactor: ProfitFactor;
  baseMaxDrawdownUsd: number | null;
  baseMedianTradePnlUsd: number | null;
};

export type TrainingSelectionRow = TrainingSelectorInput;

export function toTrainingSelectorInput(metrics: TrainingCandidateMetrics): TrainingSelectorInput {
  return {
    candidateId: metrics.candidateId,
    candidateDefinitionFingerprint: metrics.candidateDefinitionFingerprint,
    eligibility: metrics.eligibility,
    completedTrades: metrics.coverage.completedTrades,
    censoredFraction: metrics.coverage.censoredFraction,
    stressExpectancyUsd: metrics.netStress.expectancyUsd,
    baseProfitFactor: metrics.netBase.profitFactor,
    baseMaxDrawdownUsd: metrics.netBase.maxDrawdownUsd,
    baseMedianTradePnlUsd: metrics.netBase.medianTradePnlUsd,
  };
}

export const toTrainingSelectionRow = toTrainingSelectorInput;

export function isTrainEligible(row: TrainingSelectorInput): boolean {
  if (row.completedTrades < TRAIN_MIN_COMPLETED_TRADES) {
    return false;
  }
  if (row.censoredFraction === null) {
    return false;
  }
  requireFiniteNumber(row.censoredFraction, 'censoredFraction');
  return row.censoredFraction <= TRAIN_MAX_CENSORED_FRACTION;
}

export function ineligibleReason(row: TrainingSelectorInput): string {
  if (row.completedTrades < TRAIN_MIN_COMPLETED_TRADES) {
    return `completed trades ${String(row.completedTrades)} < ${String(TRAIN_MIN_COMPLETED_TRADES)}`;
  }
  if (row.censoredFraction === null) {
    return 'censored fraction undefined because no positions opened';
  }
  if (row.censoredFraction > TRAIN_MAX_CENSORED_FRACTION) {
    return `censored fraction ${String(row.censoredFraction)} > ${String(TRAIN_MAX_CENSORED_FRACTION)}`;
  }
  return 'eligible';
}

export function compareTrainingSelection(left: TrainingSelectorInput, right: TrainingSelectorInput): number {
  const stress = compareNullableDesc(
    finiteOrNull(left.stressExpectancyUsd, 'stressExpectancyUsd'),
    finiteOrNull(right.stressExpectancyUsd, 'stressExpectancyUsd'),
  );
  if (stress !== 0) {
    return stress;
  }
  const profitFactor = compareProfitFactorDesc(
    finiteProfitFactor(left.baseProfitFactor),
    finiteProfitFactor(right.baseProfitFactor),
  );
  if (profitFactor !== 0) {
    return profitFactor;
  }
  const drawdown = compareNullableAsc(
    finiteOrNull(left.baseMaxDrawdownUsd, 'baseMaxDrawdownUsd'),
    finiteOrNull(right.baseMaxDrawdownUsd, 'baseMaxDrawdownUsd'),
  );
  if (drawdown !== 0) {
    return drawdown;
  }
  const median = compareNullableDesc(
    finiteOrNull(left.baseMedianTradePnlUsd, 'baseMedianTradePnlUsd'),
    finiteOrNull(right.baseMedianTradePnlUsd, 'baseMedianTradePnlUsd'),
  );
  if (median !== 0) {
    return median;
  }
  return compareText(left.candidateId, right.candidateId);
}

export function selectFromTrainingSelectorInputs(rows: readonly TrainingSelectorInput[]): StageSelection {
  assertNoOosFields(rows);
  for (const row of rows) {
    assertFiniteSelectorRow(row);
  }
  const eligible = rows.filter((item) => item.eligibility === 'eligible' && isTrainEligible(item));
  const ranked = rows as unknown as TrainingCandidateMetrics[];
  if (eligible.length === 0) {
    return {
      status: 'NO_TRAIN_ENTRY_SELECTION',
      candidateId: null,
      candidateDefinitionFingerprint: null,
      ranked,
    };
  }
  const winner = [...eligible].sort(compareTrainingSelection)[0];
  if (winner === undefined) {
    return {
      status: 'NO_TRAIN_ENTRY_SELECTION',
      candidateId: null,
      candidateDefinitionFingerprint: null,
      ranked,
    };
  }
  return {
    status: 'selected',
    candidateId: winner.candidateId,
    candidateDefinitionFingerprint: winner.candidateDefinitionFingerprint,
    ranked,
  };
}

export function selectFromTrainingMetrics(ranked: readonly TrainingCandidateMetrics[]): StageSelection {
  const rows = ranked.map(toTrainingSelectorInput);
  const selected = selectFromTrainingSelectorInputs(rows);
  if (selected.status === 'NO_TRAIN_ENTRY_SELECTION') {
    return { ...selected, ranked };
  }
  return { ...selected, ranked };
}

function assertNoOosFields(rows: readonly TrainingSelectorInput[]): void {
  for (const row of rows) {
    const keys = Object.keys(row);
    for (const key of keys) {
      if (/oos|testSegment|future|pricePath/i.test(key)) {
        throw new OptimizationError('Selector must not receive OOS or future-outcome fields.');
      }
    }
  }
}

function assertFiniteSelectorRow(row: TrainingSelectorInput): void {
  requireFiniteNumber(row.completedTrades, 'completedTrades');
  if (row.censoredFraction !== null) {
    requireFiniteNumber(row.censoredFraction, 'censoredFraction');
  }
  if (row.stressExpectancyUsd !== null) {
    requireFiniteNumber(row.stressExpectancyUsd, 'stressExpectancyUsd');
  }
  if (row.baseMaxDrawdownUsd !== null) {
    requireFiniteNumber(row.baseMaxDrawdownUsd, 'baseMaxDrawdownUsd');
  }
  if (row.baseMedianTradePnlUsd !== null) {
    requireFiniteNumber(row.baseMedianTradePnlUsd, 'baseMedianTradePnlUsd');
  }
  if (row.baseProfitFactor.kind === 'finite') {
    requireFiniteNumber(row.baseProfitFactor.value, 'profitFactor');
  }
}

function finiteOrNull(value: number | null, label: string): number | null {
  if (value === null) {
    return null;
  }
  return requireFiniteNumber(value, label);
}

function finiteProfitFactor(value: ProfitFactor): ProfitFactor {
  if (value.kind === 'finite') {
    return { kind: 'finite', value: requireFiniteNumber(value.value, 'profitFactor') };
  }
  return value;
}

function compareNullableDesc(left: number | null, right: number | null): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  if (left > right) {
    return -1;
  }
  if (left < right) {
    return 1;
  }
  return 0;
}

function compareNullableAsc(left: number | null, right: number | null): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
