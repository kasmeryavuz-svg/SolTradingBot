import { describe, expect, it } from 'vitest';
import { evaluatePromotion } from '../src/optimization/promotion.js';
import { coverageFromCounts } from '../src/optimization/metrics.js';
import { fakeSimulation, passingIntegrity } from './optimization-fixtures.js';

function comparableBaseline(completed = 10) {
  return fakeSimulation({
    coverage: coverageFromCounts({
      snapshots: completed,
      uniqueTokenMints: completed,
      uniquePairs: completed,
      openedPositions: completed,
      completedTrades: completed,
      unresolvedTrades: 0,
      partiallyCensoredTrades: 0,
    }),
    netBase: { ...fakeSimulation().netBase, completedTrades: completed, expectancyUsd: 0.1 },
    netStress: { ...fakeSimulation().netStress, completedTrades: completed, expectancyUsd: 0.05 },
  });
}

function fold(completed: number, expectancy = 1) {
  return {
    oosSelected: fakeSimulation({
      coverage: coverageFromCounts({
        snapshots: completed,
        uniqueTokenMints: completed,
        uniquePairs: completed,
        openedPositions: completed,
        completedTrades: completed,
        unresolvedTrades: 0,
        partiallyCensoredTrades: 0,
      }),
      netBase: {
        ...fakeSimulation().netBase,
        completedTrades: completed,
        expectancyUsd: expectancy,
        profitFactor: { kind: 'finite', value: 1.2 },
        maxDrawdownPctOfReferenceBasis: 5,
        top1PositiveConcentration: 20,
        top3PositiveConcentration: 40,
      },
      netStress: { ...fakeSimulation().netStress, completedTrades: completed, expectancyUsd: expectancy },
    }),
    oosBaseline: comparableBaseline(completed),
  };
}

function promote(
  input: Omit<Parameters<typeof evaluatePromotion>[0], 'integrity'> & {
    integrity?: Parameters<typeof evaluatePromotion>[0]['integrity'];
  },
) {
  return evaluatePromotion({
    integrity: input.integrity ?? passingIntegrity(),
    folds: input.folds,
    aggregateSelectedOos: input.aggregateSelectedOos,
    aggregateBaselineOos: input.aggregateBaselineOos,
  });
}

describe('promotion gates', () => {
  it('refuses promotion when the sample is thin', () => {
    const result = promote({
      folds: [fold(4), fold(4), fold(4), fold(4)],
      aggregateSelectedOos: fakeSimulation({
        coverage: coverageFromCounts({
          snapshots: 16,
          uniqueTokenMints: 16,
          uniquePairs: 16,
          openedPositions: 16,
          completedTrades: 16,
          unresolvedTrades: 0,
          partiallyCensoredTrades: 0,
        }),
      }),
      aggregateBaselineOos: fakeSimulation(),
    });
    expect(result.status).toBe('NO_PROMOTION_INSUFFICIENT_DATA');
    expect(result.gates.find((gate) => gate.id === 'data_sufficiency')?.result).toBe('NOT_ENOUGH_DATA');
  });

  it('fails robustness when STRESS expectancy is not positive', () => {
    const folds = [fold(10), fold(10), fold(10), fold(10)];
    const aggregate = fakeSimulation({
      coverage: coverageFromCounts({
        snapshots: 40,
        uniqueTokenMints: 40,
        uniquePairs: 40,
        openedPositions: 40,
        completedTrades: 40,
        unresolvedTrades: 0,
        partiallyCensoredTrades: 0,
      }),
      netBase: {
        ...fakeSimulation().netBase,
        completedTrades: 40,
        expectancyUsd: 1,
        profitFactor: { kind: 'finite', value: 1.2 },
        maxDrawdownPctOfReferenceBasis: 5,
        top1PositiveConcentration: 20,
        top3PositiveConcentration: 40,
      },
      netStress: { ...fakeSimulation().netStress, completedTrades: 40, expectancyUsd: -0.1 },
    });
    const result = promote({
      folds,
      aggregateSelectedOos: aggregate,
      aggregateBaselineOos: fakeSimulation({
        coverage: coverageFromCounts({
          snapshots: 40,
          uniqueTokenMints: 40,
          uniquePairs: 40,
          openedPositions: 40,
          completedTrades: 40,
          unresolvedTrades: 0,
          partiallyCensoredTrades: 0,
        }),
        netBase: { ...fakeSimulation().netBase, completedTrades: 40, expectancyUsd: 0.1 },
        netStress: { ...fakeSimulation().netStress, completedTrades: 40, expectancyUsd: 0.05 },
      }),
    });
    expect(result.status).toBe('NO_PROMOTION_FAILED_ROBUSTNESS');
    expect(result.gates.find((gate) => gate.id === 'oos_stress_expectancy_positive')?.result).toBe('FAIL');
  });

  it('fails the concentration gate when one trade dominates positive PnL', () => {
    const folds = [fold(10), fold(10), fold(10), fold(10)];
    const aggregate = fakeSimulation({
      coverage: coverageFromCounts({
        snapshots: 40,
        uniqueTokenMints: 40,
        uniquePairs: 40,
        openedPositions: 40,
        completedTrades: 40,
        unresolvedTrades: 0,
        partiallyCensoredTrades: 0,
      }),
      netBase: {
        ...fakeSimulation().netBase,
        completedTrades: 40,
        expectancyUsd: 1,
        profitFactor: { kind: 'finite', value: 1.2 },
        maxDrawdownPctOfReferenceBasis: 5,
        top1PositiveConcentration: 41,
        top3PositiveConcentration: 40,
      },
      netStress: { ...fakeSimulation().netStress, completedTrades: 40, expectancyUsd: 0.5 },
    });
    const result = promote({
      folds,
      aggregateSelectedOos: aggregate,
      aggregateBaselineOos: fakeSimulation({
        coverage: coverageFromCounts({
          snapshots: 40,
          uniqueTokenMints: 40,
          uniquePairs: 40,
          openedPositions: 40,
          completedTrades: 40,
          unresolvedTrades: 0,
          partiallyCensoredTrades: 0,
        }),
        netBase: { ...fakeSimulation().netBase, completedTrades: 40, expectancyUsd: 0.1 },
        netStress: { ...fakeSimulation().netStress, completedTrades: 40, expectancyUsd: 0.05 },
      }),
    });
    expect(result.gates.find((gate) => gate.id === 'top1_concentration')?.result).toBe('FAIL');
    expect(result.status).toBe('NO_PROMOTION_FAILED_ROBUSTNESS');
  });

  it('compares selected vs s07+x11 baseline when both have comparable OOS trades', () => {
    const folds = [fold(10, 2), fold(10, 2), fold(10, 2), fold(10, -1)];
    const aggregate = fakeSimulation({
      coverage: coverageFromCounts({
        snapshots: 40,
        uniqueTokenMints: 40,
        uniquePairs: 40,
        openedPositions: 40,
        completedTrades: 40,
        unresolvedTrades: 0,
        partiallyCensoredTrades: 0,
      }),
      netBase: {
        ...fakeSimulation().netBase,
        completedTrades: 40,
        expectancyUsd: 1,
        profitFactor: { kind: 'finite', value: 1.2 },
        maxDrawdownPctOfReferenceBasis: 5,
        top1PositiveConcentration: 20,
        top3PositiveConcentration: 40,
      },
      netStress: { ...fakeSimulation().netStress, completedTrades: 40, expectancyUsd: 0.5 },
    });
    const weakerBaseline = promote({
      folds,
      aggregateSelectedOos: aggregate,
      aggregateBaselineOos: fakeSimulation({
        coverage: coverageFromCounts({
          snapshots: 40,
          uniqueTokenMints: 40,
          uniquePairs: 40,
          openedPositions: 40,
          completedTrades: 40,
          unresolvedTrades: 0,
          partiallyCensoredTrades: 0,
        }),
        netBase: { ...fakeSimulation().netBase, completedTrades: 40, expectancyUsd: 0.2 },
        netStress: { ...fakeSimulation().netStress, completedTrades: 40, expectancyUsd: 0.1 },
      }),
    });
    expect(weakerBaseline.gates.find((gate) => gate.id === 'baseline_base_expectancy')?.result).toBe('PASS');
    expect(weakerBaseline.status).toBe('ELIGIBLE_FOR_FORWARD_PAPER_VALIDATION');
    const strongerBaseline = promote({
      folds,
      aggregateSelectedOos: aggregate,
      aggregateBaselineOos: fakeSimulation({
        coverage: coverageFromCounts({
          snapshots: 40,
          uniqueTokenMints: 40,
          uniquePairs: 40,
          openedPositions: 40,
          completedTrades: 40,
          unresolvedTrades: 0,
          partiallyCensoredTrades: 0,
        }),
        netBase: { ...fakeSimulation().netBase, completedTrades: 40, expectancyUsd: 2 },
        netStress: { ...fakeSimulation().netStress, completedTrades: 40, expectancyUsd: 0.1 },
      }),
    });
    expect(strongerBaseline.gates.find((gate) => gate.id === 'baseline_base_expectancy')?.result).toBe('FAIL');
    expect(strongerBaseline.status).toBe('NO_PROMOTION_FAILED_ROBUSTNESS');
  });

  function sufficientSelected(
    overrides: Partial<ReturnType<typeof fakeSimulation>> = {},
  ): ReturnType<typeof fakeSimulation> {
    return fakeSimulation({
      coverage: coverageFromCounts({
        snapshots: 40,
        uniqueTokenMints: 40,
        uniquePairs: 40,
        openedPositions: 40,
        completedTrades: 40,
        unresolvedTrades: 0,
        partiallyCensoredTrades: 0,
      }),
      netBase: {
        ...fakeSimulation().netBase,
        completedTrades: 40,
        expectancyUsd: 1,
        profitFactor: { kind: 'finite', value: 1.2 },
        maxDrawdownPctOfReferenceBasis: 5,
        top1PositiveConcentration: 20,
        top3PositiveConcentration: 40,
      },
      netStress: { ...fakeSimulation().netStress, completedTrades: 40, expectancyUsd: 0.5 },
      ...overrides,
    });
  }

  function comparableAggregate() {
    return fakeSimulation({
      coverage: coverageFromCounts({
        snapshots: 40,
        uniqueTokenMints: 40,
        uniquePairs: 40,
        openedPositions: 40,
        completedTrades: 40,
        unresolvedTrades: 0,
        partiallyCensoredTrades: 0,
      }),
      netBase: { ...fakeSimulation().netBase, completedTrades: 40, expectancyUsd: 0.2 },
      netStress: { ...fakeSimulation().netStress, completedTrades: 40, expectancyUsd: 0.1 },
    });
  }

  it('keeps three profitable trades as insufficient, not promotional', () => {
    const result = promote({
      folds: [fold(1, 100), fold(1, 100), fold(1, 100), fold(0, 0)],
      aggregateSelectedOos: fakeSimulation({
        coverage: coverageFromCounts({
          snapshots: 3,
          uniqueTokenMints: 3,
          uniquePairs: 3,
          openedPositions: 3,
          completedTrades: 3,
          unresolvedTrades: 0,
          partiallyCensoredTrades: 0,
        }),
        netBase: {
          ...fakeSimulation().netBase,
          completedTrades: 3,
          expectancyUsd: 1_000,
          profitFactor: { kind: 'infinite' },
        },
      }),
      aggregateBaselineOos: comparableAggregate(),
    });
    expect(result.status).toBe('NO_PROMOTION_INSUFFICIENT_DATA');
    expect(result.gates.find((gate) => gate.id === 'data_sufficiency')?.result).toBe('NOT_ENOUGH_DATA');
    expect(JSON.stringify(result)).not.toMatch(/PROFITABLE|WINNER|LIVE READY|EDGE PROVEN/);
  });

  it('marks a missing or thin baseline NOT_COMPARABLE and refuses eligibility', () => {
    const folds = [fold(10), fold(10), fold(10), fold(10)];
    const missing = promote({
      folds,
      aggregateSelectedOos: sufficientSelected(),
      aggregateBaselineOos: null,
    });
    expect(missing.gates.find((gate) => gate.id === 'baseline_base_expectancy')?.result).toBe('NOT_COMPARABLE');
    expect(missing.gates.find((gate) => gate.id === 'baseline_stress_expectancy')?.result).toBe('NOT_COMPARABLE');
    expect(missing.status).toBe('NO_PROMOTION_INSUFFICIENT_DATA');
    const thin = promote({
      folds,
      aggregateSelectedOos: sufficientSelected(),
      aggregateBaselineOos: fakeSimulation({
        coverage: coverageFromCounts({
          snapshots: 3,
          uniqueTokenMints: 3,
          uniquePairs: 3,
          openedPositions: 3,
          completedTrades: 3,
          unresolvedTrades: 0,
          partiallyCensoredTrades: 0,
        }),
      }),
    });
    expect(thin.gates.find((gate) => gate.id === 'baseline_base_expectancy')?.result).toBe('NOT_COMPARABLE');
    expect(thin.status).toBe('NO_PROMOTION_INSUFFICIENT_DATA');
  });

  it('fails runtime integrity even when standalone gates would pass', () => {
    const result = promote({
      folds: [fold(10), fold(10), fold(10), fold(10)],
      aggregateSelectedOos: sufficientSelected(),
      aggregateBaselineOos: comparableAggregate(),
      integrity: {
        status: 'FAIL',
        checks: [{ id: 'disjoint_train_test', result: 'FAIL', detail: 'overlap' }],
      },
    });
    expect(result.gates.find((gate) => gate.id === 'runtime_integrity')?.result).toBe('FAIL');
    expect(result.status).toBe('NO_PROMOTION_FAILED_ROBUSTNESS');
  });

  it('treats an empty test fold as NOT_ENOUGH_DATA, not a zero-performance pass', () => {
    const emptyFold = {
      oosSelected: null,
      oosBaseline: comparableBaseline(10),
    };
    const result = promote({
      folds: [fold(14), fold(14), fold(12), emptyFold],
      aggregateSelectedOos: sufficientSelected(),
      aggregateBaselineOos: comparableAggregate(),
    });
    expect(result.gates.find((gate) => gate.id === 'data_sufficiency')?.result).toBe('NOT_ENOUGH_DATA');
    expect(result.status).toBe('NO_PROMOTION_INSUFFICIENT_DATA');
  });

  it('fails fold consistency at exactly 2 positive BASE folds and passes at 3', () => {
    const two = promote({
      folds: [fold(10, 1), fold(10, 1), fold(10, -1), fold(10, -1)],
      aggregateSelectedOos: sufficientSelected(),
      aggregateBaselineOos: comparableAggregate(),
    });
    expect(two.gates.find((gate) => gate.id === 'fold_consistency')?.result).toBe('FAIL');
    expect(two.status).toBe('NO_PROMOTION_FAILED_ROBUSTNESS');
    const three = promote({
      folds: [fold(10, 1), fold(10, 1), fold(10, 1), fold(10, -1)],
      aggregateSelectedOos: sufficientSelected(),
      aggregateBaselineOos: comparableAggregate(),
    });
    expect(three.gates.find((gate) => gate.id === 'fold_consistency')?.result).toBe('PASS');
    expect(three.status).toBe('ELIGIBLE_FOR_FORWARD_PAPER_VALIDATION');
  });

  it('fails remaining standalone robustness gates one at a time', () => {
    const folds = [fold(10), fold(10), fold(10), fold(10)];
    const cases: { id: string; selected: ReturnType<typeof sufficientSelected> }[] = [
      {
        id: 'oos_base_expectancy_positive',
        selected: sufficientSelected({
          netBase: { ...sufficientSelected().netBase, expectancyUsd: 0 },
        }),
      },
      {
        id: 'oos_stress_expectancy_positive',
        selected: sufficientSelected({
          netStress: { ...sufficientSelected().netStress, expectancyUsd: -0.01 },
        }),
      },
      {
        id: 'oos_base_profit_factor',
        selected: sufficientSelected({
          netBase: { ...sufficientSelected().netBase, profitFactor: { kind: 'finite', value: 1.09 } },
        }),
      },
      {
        id: 'oos_base_max_drawdown',
        selected: sufficientSelected({
          netBase: { ...sufficientSelected().netBase, maxDrawdownPctOfReferenceBasis: 20.01 },
        }),
      },
      {
        id: 'top3_concentration',
        selected: sufficientSelected({
          netBase: { ...sufficientSelected().netBase, top3PositiveConcentration: 70.01 },
        }),
      },
      {
        id: 'baseline_stress_expectancy',
        selected: sufficientSelected({
          netStress: { ...sufficientSelected().netStress, expectancyUsd: 0.01 },
        }),
      },
    ];
    for (const item of cases) {
      const baseline =
        item.id === 'baseline_stress_expectancy'
          ? fakeSimulation({
              coverage: comparableAggregate().coverage,
              netBase: { ...comparableAggregate().netBase, expectancyUsd: 0.2 },
              netStress: { ...comparableAggregate().netStress, expectancyUsd: 0.5 },
            })
          : comparableAggregate();
      const result = promote({
        folds,
        aggregateSelectedOos: item.selected,
        aggregateBaselineOos: baseline,
      });
      expect(result.gates.find((gate) => gate.id === item.id)?.result, item.id).toBe('FAIL');
      expect(result.status, item.id).toBe('NO_PROMOTION_FAILED_ROBUSTNESS');
    }
  });

  it('refuses eligibility when one test fold has fewer than 5 completed trades', () => {
    const result = promote({
      folds: [fold(12), fold(12), fold(12), fold(4)],
      aggregateSelectedOos: sufficientSelected({
        coverage: coverageFromCounts({
          snapshots: 40,
          uniqueTokenMints: 40,
          uniquePairs: 40,
          openedPositions: 40,
          completedTrades: 40,
          unresolvedTrades: 0,
          partiallyCensoredTrades: 0,
        }),
      }),
      aggregateBaselineOos: comparableAggregate(),
    });
    expect(result.gates.find((gate) => gate.id === 'data_sufficiency')?.result).toBe('NOT_ENOUGH_DATA');
    expect(result.status).toBe('NO_PROMOTION_INSUFFICIENT_DATA');
  });

  it('refuses eligibility when aggregate censoring exceeds 25%', () => {
    const result = promote({
      folds: [fold(10), fold(10), fold(10), fold(10)],
      aggregateSelectedOos: sufficientSelected({
        coverage: coverageFromCounts({
          snapshots: 54,
          uniqueTokenMints: 54,
          uniquePairs: 54,
          openedPositions: 54,
          completedTrades: 40,
          unresolvedTrades: 14,
          partiallyCensoredTrades: 0,
        }),
      }),
      aggregateBaselineOos: comparableAggregate(),
    });
    expect(result.gates.find((gate) => gate.id === 'data_sufficiency')?.result).toBe('NOT_ENOUGH_DATA');
    expect(result.status).toBe('NO_PROMOTION_INSUFFICIENT_DATA');
  });
});
