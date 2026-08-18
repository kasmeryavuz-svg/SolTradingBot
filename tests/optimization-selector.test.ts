import { describe, expect, it } from 'vitest';
import { selectFromTrainingMetrics, compareTrainingSelection, toTrainingSelectionRow, selectFromTrainingSelectorInputs } from '../src/optimization/selector.js';
import { trainingMetrics } from './optimization-fixtures.js';

describe('training-only selector', () => {
  it('selects the TRAIN winner and cannot see OOS fields', () => {
    const winnerA = trainingMetrics({
      candidateId: 'candidate_a',
      completedTrades: 25,
      stressExpectancyUsd: 2,
      baseProfitFactor: { kind: 'finite', value: 1.1 },
      baseMaxDrawdownUsd: 50,
      baseMedianTradePnlUsd: 1,
    });
    const loserTrainWinnerOosB = trainingMetrics({
      candidateId: 'candidate_b',
      completedTrades: 25,
      stressExpectancyUsd: 1,
      baseProfitFactor: { kind: 'finite', value: 9 },
      baseMaxDrawdownUsd: 1,
      baseMedianTradePnlUsd: 8,
    });
    expect(Object.keys(winnerA)).not.toContain('oos');
    expect(Object.keys(winnerA)).not.toContain('netOos');
    const selected = selectFromTrainingMetrics([loserTrainWinnerOosB, winnerA]);
    expect(selected.status).toBe('selected');
    expect(selected.candidateId).toBe('candidate_a');
  });

  it('marks thin samples TRAIN_INELIGIBLE and returns NO_TRAIN_ENTRY_SELECTION', () => {
    const thin = trainingMetrics({
      candidateId: 'thin',
      eligibility: 'TRAIN_INELIGIBLE',
      completedTrades: 19,
    });
    const selected = selectFromTrainingMetrics([thin]);
    expect(selected.status).toBe('NO_TRAIN_ENTRY_SELECTION');
    expect(selected.candidateId).toBeNull();
  });

  it('breaks remaining ties with lexicographically smaller candidateId', () => {
    const left = trainingMetrics({ candidateId: 'quality_control_v1', completedTrades: 20, stressExpectancyUsd: 1 });
    const right = trainingMetrics({ candidateId: 's07_baseline', completedTrades: 20, stressExpectancyUsd: 1 });
    expect(compareTrainingSelection(toTrainingSelectionRow(left), toTrainingSelectionRow(right))).toBeLessThan(0);
    expect(selectFromTrainingMetrics([right, left]).candidateId).toBe('quality_control_v1');
  });

  it('ranks infinite profit factor above finite, and finite above undefined', () => {
    const infinite = trainingMetrics({
      candidateId: 'infinite',
      completedTrades: 20,
      stressExpectancyUsd: 1,
      baseProfitFactor: { kind: 'infinite' },
    });
    const finite = trainingMetrics({
      candidateId: 'finite',
      completedTrades: 20,
      stressExpectancyUsd: 1,
      baseProfitFactor: { kind: 'finite', value: 99 },
    });
    const undefinedPf = trainingMetrics({
      candidateId: 'undefined_pf',
      completedTrades: 20,
      stressExpectancyUsd: 1,
      baseProfitFactor: { kind: 'undefined' },
    });
    expect(selectFromTrainingMetrics([finite, infinite]).candidateId).toBe('infinite');
    expect(selectFromTrainingMetrics([undefinedPf, finite]).candidateId).toBe('finite');
  });

  it('treats 19 completed trades as ineligible and 20 as eligible when censoring passes', () => {
    expect(
      selectFromTrainingMetrics([trainingMetrics({ candidateId: 'nineteen', completedTrades: 19 })]).status,
    ).toBe('NO_TRAIN_ENTRY_SELECTION');
    expect(
      selectFromTrainingMetrics([trainingMetrics({ candidateId: 'twenty', completedTrades: 20 })]).candidateId,
    ).toBe('twenty');
  });

  it('uses exact 35% censoring as the inclusive eligibility boundary', () => {
    const exact = trainingMetrics({
      candidateId: 'exact',
      completedTrades: 65,
      openedPositions: 100,
      unresolvedTrades: 35,
    });
    const over = trainingMetrics({
      candidateId: 'over',
      completedTrades: 64,
      openedPositions: 100,
      unresolvedTrades: 36,
    });
    expect(selectFromTrainingMetrics([exact]).candidateId).toBe('exact');
    expect(selectFromTrainingMetrics([over]).status).toBe('NO_TRAIN_ENTRY_SELECTION');
  });

  it('rejects selector rows that smuggle OOS or future fields', () => {
    const row = {
      ...toTrainingSelectionRow(trainingMetrics({ candidateId: 'smuggle', completedTrades: 20 })),
      oosExpectancyUsd: 999,
    };
    expect(() => selectFromTrainingSelectorInputs([row])).toThrow(/OOS or future-outcome/);
  });

  it('throws on NaN selector metrics instead of sorting them as a winner', () => {
    expect(() =>
      selectFromTrainingMetrics([
        trainingMetrics({ candidateId: 'nan', completedTrades: 20, stressExpectancyUsd: Number.NaN }),
      ]),
    ).toThrow();
  });

  it('breaks near-ties by exact candidateId code-point order, not localeCompare', () => {
    const left = trainingMetrics({ candidateId: 'A', completedTrades: 20, stressExpectancyUsd: 1 });
    const right = trainingMetrics({ candidateId: 'B', completedTrades: 20, stressExpectancyUsd: 1 + 1e-12 });
    expect(selectFromTrainingMetrics([left, right]).candidateId).toBe('B');
    const tiedLeft = trainingMetrics({ candidateId: 'quality_control_v1', completedTrades: 20, stressExpectancyUsd: 1 });
    const tiedRight = trainingMetrics({ candidateId: 's07_baseline', completedTrades: 20, stressExpectancyUsd: 1 });
    expect(selectFromTrainingMetrics([tiedRight, tiedLeft]).candidateId).toBe('quality_control_v1');
    expect(compareTrainingSelection(toTrainingSelectionRow(tiedLeft), toTrainingSelectionRow(tiedRight))).toBeLessThan(
      0,
    );
  });
});
