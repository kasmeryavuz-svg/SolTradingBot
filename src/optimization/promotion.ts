import {
  BASELINE_COMPARABLE_MIN_AGGREGATE_COMPLETED_TRADES,
  BASELINE_COMPARABLE_MIN_COMPLETED_TRADES_PER_TEST_FOLD,
  OOS_MAX_AGGREGATE_CENSORED_FRACTION,
  OOS_MIN_AGGREGATE_COMPLETED_TRADES,
  OOS_MIN_COMPLETED_TRADES_PER_TEST_FOLD,
  PROMOTION_MAX_BASE_DRAWDOWN_PCT,
  PROMOTION_MAX_TOP1_CONCENTRATION_PCT,
  PROMOTION_MAX_TOP3_CONCENTRATION_PCT,
  PROMOTION_MIN_BASE_PROFIT_FACTOR,
  PROMOTION_MIN_POSITIVE_BASE_EXPECTANCY_FOLDS,
} from './constants.js';
import type {
  OptimizationGateResult,
  OptimizationPromotionStatus,
  OptimizationSimulationResult,
  PromotionGate,
  RuntimeIntegrityReport,
} from './types.js';

export type PromotionFoldInput = {
  oosSelected: OptimizationSimulationResult | null;
  oosBaseline: OptimizationSimulationResult | null;
};

export function evaluatePromotion(input: {
  folds: readonly PromotionFoldInput[];
  aggregateSelectedOos: OptimizationSimulationResult | null;
  aggregateBaselineOos: OptimizationSimulationResult | null;
  integrity: RuntimeIntegrityReport;
}): { status: OptimizationPromotionStatus; gates: PromotionGate[] } {
  const selected = input.aggregateSelectedOos;
  const baseline = input.aggregateBaselineOos;
  const sufficiency = dataSufficiency(input.folds, selected);
  const comparable = isBaselineComparable(input.folds, baseline);
  const gates: PromotionGate[] = [
    sufficiency.gate,
    gate(
      'oos_base_expectancy_positive',
      'Aggregate OOS BASE expectancy > 0',
      expectPositive(selected?.netBase.expectancyUsd ?? null, sufficiency.ok),
    ),
    gate(
      'oos_stress_expectancy_positive',
      'Aggregate OOS STRESS expectancy > 0',
      expectPositive(selected?.netStress.expectancyUsd ?? null, sufficiency.ok),
    ),
    gate(
      'oos_base_profit_factor',
      `Aggregate OOS BASE profit factor >= ${String(PROMOTION_MIN_BASE_PROFIT_FACTOR)}`,
      profitFactorGate(selected, sufficiency.ok),
    ),
    gate(
      'oos_base_max_drawdown',
      `Aggregate OOS BASE max drawdown <= ${String(PROMOTION_MAX_BASE_DRAWDOWN_PCT)}% of peak cumulative completed-trade net PnL`,
      drawdownGate(selected, sufficiency.ok),
    ),
    gate(
      'fold_consistency',
      `At least ${String(PROMOTION_MIN_POSITIVE_BASE_EXPECTANCY_FOLDS)} of 4 test folds have positive BASE expectancy`,
      foldConsistencyGate(input.folds, sufficiency.ok),
    ),
    gate(
      'top1_concentration',
      `Top1 positive-profit concentration <= ${String(PROMOTION_MAX_TOP1_CONCENTRATION_PCT)}%`,
      concentrationGate(selected?.netBase.top1PositiveConcentration ?? null, PROMOTION_MAX_TOP1_CONCENTRATION_PCT, sufficiency.ok),
    ),
    gate(
      'top3_concentration',
      `Top3 positive-profit concentration <= ${String(PROMOTION_MAX_TOP3_CONCENTRATION_PCT)}%`,
      concentrationGate(selected?.netBase.top3PositiveConcentration ?? null, PROMOTION_MAX_TOP3_CONCENTRATION_PCT, sufficiency.ok),
    ),
    ...baselineComparisonGates(selected, baseline, sufficiency.ok, comparable),
    gate('runtime_integrity', 'Runtime dataset/fold integrity', integrityGate(input.integrity)),
  ];

  if (input.integrity.status === 'FAIL') {
    return { status: 'NO_PROMOTION_FAILED_ROBUSTNESS', gates };
  }
  if (!sufficiency.ok) {
    return { status: 'NO_PROMOTION_INSUFFICIENT_DATA', gates };
  }
  const failed = gates.some((item) => item.result === 'FAIL');
  if (failed) {
    return { status: 'NO_PROMOTION_FAILED_ROBUSTNESS', gates };
  }
  const unresolved = gates.some(
    (item) => item.result === 'NOT_ENOUGH_DATA' || item.result === 'NOT_COMPARABLE',
  );
  if (unresolved) {
    return { status: 'NO_PROMOTION_INSUFFICIENT_DATA', gates };
  }
  return { status: 'ELIGIBLE_FOR_FORWARD_PAPER_VALIDATION', gates };
}

export function isBaselineComparable(
  folds: readonly PromotionFoldInput[],
  baseline: OptimizationSimulationResult | null,
): boolean {
  if (folds.length !== 4 || baseline === null) {
    return false;
  }
  if (baseline.coverage.completedTrades < BASELINE_COMPARABLE_MIN_AGGREGATE_COMPLETED_TRADES) {
    return false;
  }
  return folds.every(
    (fold) =>
      (fold.oosBaseline?.coverage.completedTrades ?? 0) >= BASELINE_COMPARABLE_MIN_COMPLETED_TRADES_PER_TEST_FOLD,
  );
}

function dataSufficiency(
  folds: readonly PromotionFoldInput[],
  selected: OptimizationSimulationResult | null,
): { ok: boolean; gate: PromotionGate } {
  if (folds.length !== 4) {
    return {
      ok: false,
      gate: gate('data_sufficiency', 'All 4 folds exist with sufficient selected-strategy OOS trades', {
        result: 'NOT_ENOUGH_DATA',
        detail: `Observed ${String(folds.length)} folds; 4 required.`,
      }),
    };
  }
  if (selected === null) {
    return {
      ok: false,
      gate: gate('data_sufficiency', 'All 4 folds exist with sufficient selected-strategy OOS trades', {
        result: 'NOT_ENOUGH_DATA',
        detail: 'No selected-strategy OOS trades. This is expected on a young database.',
      }),
    };
  }
  const perFold = folds.map((fold) => fold.oosSelected?.coverage.completedTrades ?? 0);
  const emptyFold = folds.some((fold) => fold.oosSelected === null || fold.oosSelected.coverage.completedTrades === 0);
  const eachFoldOk = perFold.every((count) => count >= OOS_MIN_COMPLETED_TRADES_PER_TEST_FOLD);
  const aggregateOk = selected.coverage.completedTrades >= OOS_MIN_AGGREGATE_COMPLETED_TRADES;
  const censored = selected.coverage.censoredFraction;
  const censoredOk = censored !== null && censored <= OOS_MAX_AGGREGATE_CENSORED_FRACTION;
  const ok = !emptyFold && eachFoldOk && aggregateOk && censoredOk;
  return {
    ok,
    gate: gate('data_sufficiency', 'All 4 folds exist with sufficient selected-strategy OOS trades', {
      result: ok ? 'PASS' : 'NOT_ENOUGH_DATA',
      detail: `aggregate completed=${String(selected.coverage.completedTrades)} (need ${String(OOS_MIN_AGGREGATE_COMPLETED_TRADES)}); per-fold completed=[${perFold.join(', ')}] (need ${String(OOS_MIN_COMPLETED_TRADES_PER_TEST_FOLD)} each); censored=${censored === null ? 'n/a' : String(censored)} (max ${String(OOS_MAX_AGGREGATE_CENSORED_FRACTION)}).`,
    }),
  };
}

function expectPositive(
  value: number | null,
  sufficiencyOk: boolean,
): { result: OptimizationGateResult; detail: string } {
  if (!sufficiencyOk || value === null) {
    return { result: 'NOT_ENOUGH_DATA', detail: 'Expectancy unavailable.' };
  }
  return value > 0
    ? { result: 'PASS', detail: `expectancy=${String(value)}` }
    : { result: 'FAIL', detail: `expectancy=${String(value)}` };
}

function profitFactorGate(
  selected: OptimizationSimulationResult | null,
  sufficiencyOk: boolean,
): { result: OptimizationGateResult; detail: string } {
  if (!sufficiencyOk || selected === null) {
    return { result: 'NOT_ENOUGH_DATA', detail: 'Profit factor unavailable.' };
  }
  const pf = selected.netBase.profitFactor;
  if (pf.kind === 'infinite') {
    return { result: 'PASS', detail: 'profitFactor=infinite (no losses)' };
  }
  if (pf.kind === 'undefined') {
    return { result: 'FAIL', detail: 'profitFactor undefined (no positive and no negative completed PnL)' };
  }
  return pf.value >= PROMOTION_MIN_BASE_PROFIT_FACTOR
    ? { result: 'PASS', detail: `profitFactor=${String(pf.value)}` }
    : { result: 'FAIL', detail: `profitFactor=${String(pf.value)}` };
}

function drawdownGate(
  selected: OptimizationSimulationResult | null,
  sufficiencyOk: boolean,
): { result: OptimizationGateResult; detail: string } {
  if (!sufficiencyOk || selected === null) {
    return { result: 'NOT_ENOUGH_DATA', detail: 'Drawdown unavailable.' };
  }
  if (selected.netBase.maxDrawdownPctOfReferenceBasis === null) {
    return {
      result: 'FAIL',
      detail:
        'Drawdown percent is undefined because peak cumulative completed-trade net PnL is not positive. This is not bankroll drawdown.',
    };
  }
  const pct = selected.netBase.maxDrawdownPctOfReferenceBasis;
  return pct <= PROMOTION_MAX_BASE_DRAWDOWN_PCT
    ? { result: 'PASS', detail: `maxDrawdownPctOfPeakCumulativePnl=${String(pct)}` }
    : { result: 'FAIL', detail: `maxDrawdownPctOfPeakCumulativePnl=${String(pct)}` };
}

function foldConsistencyGate(
  folds: readonly PromotionFoldInput[],
  sufficiencyOk: boolean,
): { result: OptimizationGateResult; detail: string } {
  if (!sufficiencyOk) {
    return { result: 'NOT_ENOUGH_DATA', detail: 'Fold expectancy unavailable.' };
  }
  const missing = folds.filter(
    (fold) => fold.oosSelected === null || fold.oosSelected.netBase.expectancyUsd === null,
  );
  if (missing.length > 0) {
    return {
      result: 'NOT_ENOUGH_DATA',
      detail: `${String(missing.length)} test fold(s) have no completed-trade BASE expectancy. Empty folds are neither positive nor negative.`,
    };
  }
  const positive = folds.filter((fold) => (fold.oosSelected?.netBase.expectancyUsd ?? 0) > 0).length;
  return positive >= PROMOTION_MIN_POSITIVE_BASE_EXPECTANCY_FOLDS
    ? { result: 'PASS', detail: `positive BASE expectancy folds=${String(positive)}` }
    : { result: 'FAIL', detail: `positive BASE expectancy folds=${String(positive)}` };
}

function concentrationGate(
  value: number | null,
  maxPct: number,
  sufficiencyOk: boolean,
): { result: OptimizationGateResult; detail: string } {
  if (!sufficiencyOk) {
    return { result: 'NOT_ENOUGH_DATA', detail: 'Concentration unavailable.' };
  }
  if (value === null) {
    return { result: 'FAIL', detail: 'No positive completed PnL; concentration is null.' };
  }
  return value <= maxPct
    ? { result: 'PASS', detail: `concentration=${String(value)}` }
    : { result: 'FAIL', detail: `concentration=${String(value)}` };
}

function baselineComparisonGates(
  selected: OptimizationSimulationResult | null,
  baseline: OptimizationSimulationResult | null,
  sufficiencyOk: boolean,
  comparable: boolean,
): PromotionGate[] {
  if (!sufficiencyOk) {
    return [
      gate('baseline_base_expectancy', 'Selected BASE expectancy > s07+x11 BASE expectancy', {
        result: 'NOT_ENOUGH_DATA',
        detail: 'Selected-strategy sample is insufficient; baseline comparison is not evaluated.',
      }),
      gate('baseline_stress_expectancy', 'Selected STRESS expectancy >= s07+x11 STRESS expectancy', {
        result: 'NOT_ENOUGH_DATA',
        detail: 'Selected-strategy sample is insufficient; baseline comparison is not evaluated.',
      }),
    ];
  }
  if (!comparable || selected === null || baseline === null) {
    return [
      gate('baseline_base_expectancy', 'Selected BASE expectancy > s07+x11 BASE expectancy', {
        result: 'NOT_COMPARABLE',
        detail: `Baseline is comparable only with all 4 OOS windows, >=${String(BASELINE_COMPARABLE_MIN_AGGREGATE_COMPLETED_TRADES)} aggregate completed trades, and >=${String(BASELINE_COMPARABLE_MIN_COMPLETED_TRADES_PER_TEST_FOLD)} completed trades in each test fold. Missing baseline comparison is not PASS.`,
      }),
      gate('baseline_stress_expectancy', 'Selected STRESS expectancy >= s07+x11 STRESS expectancy', {
        result: 'NOT_COMPARABLE',
        detail: `Baseline is comparable only with all 4 OOS windows, >=${String(BASELINE_COMPARABLE_MIN_AGGREGATE_COMPLETED_TRADES)} aggregate completed trades, and >=${String(BASELINE_COMPARABLE_MIN_COMPLETED_TRADES_PER_TEST_FOLD)} completed trades in each test fold. Missing baseline comparison is not PASS.`,
      }),
    ];
  }
  const selectedBase = selected.netBase.expectancyUsd;
  const selectedStress = selected.netStress.expectancyUsd;
  const baselineBase = baseline.netBase.expectancyUsd;
  const baselineStress = baseline.netStress.expectancyUsd;
  if (selectedBase === null || selectedStress === null || baselineBase === null || baselineStress === null) {
    return [
      gate('baseline_base_expectancy', 'Selected BASE expectancy > s07+x11 BASE expectancy', {
        result: 'NOT_COMPARABLE',
        detail: 'Expectancy unavailable for a comparable baseline comparison.',
      }),
      gate('baseline_stress_expectancy', 'Selected STRESS expectancy >= s07+x11 STRESS expectancy', {
        result: 'NOT_COMPARABLE',
        detail: 'Expectancy unavailable for a comparable baseline comparison.',
      }),
    ];
  }
  return [
    gate('baseline_base_expectancy', 'Selected BASE expectancy > s07+x11 BASE expectancy', {
      result: selectedBase > baselineBase ? 'PASS' : 'FAIL',
      detail: `selected=${String(selectedBase)} baseline=${String(baselineBase)}`,
    }),
    gate('baseline_stress_expectancy', 'Selected STRESS expectancy >= s07+x11 STRESS expectancy', {
      result: selectedStress >= baselineStress ? 'PASS' : 'FAIL',
      detail: `selected=${String(selectedStress)} baseline=${String(baselineStress)}`,
    }),
  ];
}

function integrityGate(integrity: RuntimeIntegrityReport): { result: OptimizationGateResult; detail: string } {
  if (integrity.status === 'PASS') {
    return {
      result: 'PASS',
      detail: `Runtime checks passed: ${integrity.checks.map((item) => item.id).join(', ')}. Hostile lookahead unit tests are development evidence, not this runtime gate.`,
    };
  }
  const failed = integrity.checks.filter((item) => item.result === 'FAIL');
  return {
    result: 'FAIL',
    detail: failed.map((item) => `${item.id}: ${item.detail}`).join('; '),
  };
}

function gate(
  id: string,
  title: string,
  body: { result: OptimizationGateResult; detail: string },
): PromotionGate {
  return { id, title, result: body.result, detail: body.detail };
}
