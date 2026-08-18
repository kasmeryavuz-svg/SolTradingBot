import {
  AGGREGATE_OOS_MIN_LABELED,
  BASELINE_COMPARABLE_MIN_AGGREGATE_COMPLETED,
  BASELINE_COMPARABLE_MIN_COMPLETED_PER_FOLD,
  MAX_CENSORING_BPS,
  PROMOTION_MAX_DRAWDOWN_PCT,
  PROMOTION_MAX_TOP1_CONCENTRATION_PCT,
  PROMOTION_MAX_TOP3_CONCENTRATION_PCT,
  PROMOTION_MIN_AGGREGATE_ROC_AUC,
  PROMOTION_MIN_BASE_PROFIT_FACTOR,
  PROMOTION_MIN_FOLDS_AUC_ABOVE_CHANCE,
  SELECTED_MIN_AGGREGATE_COMPLETED,
  SELECTED_MIN_COMPLETED_PER_FOLD,
} from './constants.js';
import { censoringBps, censoringExceedsLimit, formatCensoringBps } from './censoring.js';
import type {
  BaselineComparison,
  ClassificationMetrics,
  MlDataset,
  MlFoldResult,
  MlGateResult,
  MlPromotionStatus,
  PromotionGate,
  RuntimeIntegrityReport,
  SelectedEconomicSlice,
} from './types.js';

export function evaluateMlPromotion(input: {
  dataset?: MlDataset;
  folds: readonly MlFoldResult[];
  aggregateMetrics: ClassificationMetrics | null;
  aggregateNullMetrics: ClassificationMetrics | null;
  aggregateSelectedEconomics: SelectedEconomicSlice;
  integrity: RuntimeIntegrityReport;
}): {
  status: MlPromotionStatus;
  gates: PromotionGate[];
  baselineComparison: BaselineComparison;
} {
  const sufficiency = dataSufficiency(input.folds, input.aggregateMetrics, input.aggregateSelectedEconomics);
  const baselineComparison = baselineStatus(input.folds, input.aggregateSelectedEconomics);
  const gates: PromotionGate[] = [
    gate(
      'all_four_folds_evaluable',
      'All four folds are ML-evaluable after purging',
      allFoldsEvaluable(input.folds, sufficiency.sampleOk),
    ),
    gate(
      'trainer_converged',
      'Logistic trainer converged in all folds',
      convergenceGate(input.folds, sufficiency.sampleOk),
    ),
    gate(
      'aggregate_oos_labeled',
      `Aggregate OOS labeled samples >= ${String(AGGREGATE_OOS_MIN_LABELED)}`,
      numericAtLeast(input.aggregateMetrics?.labeledSamples ?? 0, AGGREGATE_OOS_MIN_LABELED),
    ),
    gate(
      'aggregate_roc_auc',
      `Aggregate OOS ROC-AUC >= ${String(PROMOTION_MIN_AGGREGATE_ROC_AUC)}`,
      aucGate(input.aggregateMetrics?.rocAuc ?? null, PROMOTION_MIN_AGGREGATE_ROC_AUC, sufficiency.sampleOk),
    ),
    gate(
      'log_loss_beats_null',
      'Aggregate model log-loss < aggregate null-model log-loss',
      lowerBetter(
        input.aggregateMetrics?.logLoss ?? null,
        input.aggregateNullMetrics?.logLoss ?? null,
        sufficiency.sampleOk,
      ),
    ),
    gate(
      'brier_beats_null',
      'Aggregate model Brier score < aggregate null-model Brier score',
      lowerBetter(
        input.aggregateMetrics?.brierScore ?? null,
        input.aggregateNullMetrics?.brierScore ?? null,
        sufficiency.sampleOk,
      ),
    ),
    gate(
      'fold_auc_consistency',
      `At least ${String(PROMOTION_MIN_FOLDS_AUC_ABOVE_CHANCE)} of 4 folds have ROC-AUC > 0.50`,
      foldAucGate(input.folds, sufficiency.sampleOk),
    ),
    gate(
      'selected_completed_coverage',
      `Fixed 0.65 selected slice: >= ${String(SELECTED_MIN_AGGREGATE_COMPLETED)} completed total and >= ${String(SELECTED_MIN_COMPLETED_PER_FOLD)} completed each fold`,
      selectedCoverageGate(input.folds, input.aggregateSelectedEconomics),
    ),
    gate(
      'train_test_label_censoring',
      `TRAIN and TEST label censoring <= ${String(MAX_CENSORING_BPS)} bps on every fold`,
      labelCensoringGate(input.folds, sufficiency.sampleOk),
    ),
    gate(
      'selected_censoring',
      `Selected-slice censoring <= ${String(MAX_CENSORING_BPS)} bps aggregate and per fold`,
      selectedCensoringGate(input.folds, input.aggregateSelectedEconomics, sufficiency.sampleOk),
    ),
    gate(
      'selected_base_expectancy',
      'Selected BASE expectancy > 0',
      expectPositive(input.aggregateSelectedEconomics.netBase?.expectancyUsd ?? null, sufficiency.sampleOk),
    ),
    gate(
      'selected_stress_expectancy',
      'Selected STRESS expectancy > 0',
      expectPositive(input.aggregateSelectedEconomics.netStress?.expectancyUsd ?? null, sufficiency.sampleOk),
    ),
    gate(
      'selected_base_profit_factor',
      `Selected BASE profit factor >= ${String(PROMOTION_MIN_BASE_PROFIT_FACTOR)}`,
      profitFactorGate(input.aggregateSelectedEconomics, sufficiency.sampleOk),
    ),
    gate(
      'selected_drawdown',
      `Research drawdown percent <= ${String(PROMOTION_MAX_DRAWDOWN_PCT)}%`,
      drawdownGate(input.aggregateSelectedEconomics, sufficiency.sampleOk),
    ),
    gate(
      'top1_concentration',
      `Top1 positive-profit share <= ${String(PROMOTION_MAX_TOP1_CONCENTRATION_PCT)}%`,
      concentrationGate(
        input.aggregateSelectedEconomics.netBase?.top1PositiveConcentration ?? null,
        PROMOTION_MAX_TOP1_CONCENTRATION_PCT,
        sufficiency.sampleOk,
      ),
    ),
    gate(
      'top3_concentration',
      `Top3 positive-profit share <= ${String(PROMOTION_MAX_TOP3_CONCENTRATION_PCT)}%`,
      concentrationGate(
        input.aggregateSelectedEconomics.netBase?.top3PositiveConcentration ?? null,
        PROMOTION_MAX_TOP3_CONCENTRATION_PCT,
        sufficiency.sampleOk,
      ),
    ),
    gate('baseline_comparable', 's07+x11 baseline is COMPARABLE on the exact same TEST observation interval', {
      result: !sufficiency.sampleOk
        ? 'NOT_ENOUGH_DATA'
        : baselineComparison.status === 'COMPARABLE'
          ? 'PASS'
          : 'NOT_COMPARABLE',
      detail: `status=${baselineComparison.status}; opened=${String(baselineComparison.aggregateOpened)}; completed=${String(baselineComparison.aggregateCompleted)}; censored=${String(baselineComparison.aggregateCensored)}; censoringBps=${formatCensoringBps(baselineComparison.aggregateCensoringBps)}; perFoldCompleted=[${baselineComparison.perFoldCompleted.join(', ')}]`,
    }),
    gate(
      'model_beats_baseline_base',
      'Model-selected BASE expectancy > s07 baseline BASE expectancy',
      baselineBeat(
        baselineComparison.modelBaseExpectancy,
        baselineComparison.baselineBaseExpectancy,
        '>',
        sufficiency.sampleOk,
        baselineComparison.status === 'COMPARABLE',
      ),
    ),
    gate(
      'model_beats_or_matches_baseline_stress',
      'Model-selected STRESS expectancy >= s07 baseline STRESS expectancy',
      baselineBeat(
        baselineComparison.modelStressExpectancy,
        baselineComparison.baselineStressExpectancy,
        '>=',
        sufficiency.sampleOk,
        baselineComparison.status === 'COMPARABLE',
      ),
    ),
    gate('runtime_integrity', 'Runtime integrity PASS', integrityGate(input.integrity)),
  ];

  if (input.integrity.status === 'FAIL') {
    return { status: 'NO_MODEL_PROMOTION_FAILED_VALIDATION', gates, baselineComparison };
  }
  if (!sufficiency.sampleOk) {
    return { status: 'NO_MODEL_PROMOTION_INSUFFICIENT_DATA', gates, baselineComparison };
  }
  const failed = gates.some((item) => item.result === 'FAIL' || item.result === 'NOT_COMPARABLE');
  if (failed) {
    return { status: 'NO_MODEL_PROMOTION_FAILED_VALIDATION', gates, baselineComparison };
  }
  const unresolved = gates.some((item) => item.result === 'NOT_ENOUGH_DATA' || item.result === 'NOT_EVALUABLE');
  if (unresolved) {
    return { status: 'NO_MODEL_PROMOTION_INSUFFICIENT_DATA', gates, baselineComparison };
  }
  return { status: 'ELIGIBLE_FOR_FORWARD_PAPER_MODEL_VALIDATION', gates, baselineComparison };
}

function dataSufficiency(
  folds: readonly MlFoldResult[],
  aggregate: ClassificationMetrics | null,
  selected: SelectedEconomicSlice,
): { sampleOk: boolean } {
  const allEvaluable = folds.length === 4 && folds.every((fold) => fold.evaluability.evaluable);
  const labeledOk = (aggregate?.labeledSamples ?? 0) >= AGGREGATE_OOS_MIN_LABELED;
  const selectedAggOk = selected.completed >= SELECTED_MIN_AGGREGATE_COMPLETED;
  const selectedFoldOk =
    folds.length === 4 &&
    folds.every((fold) => fold.selectedEconomics.completed >= SELECTED_MIN_COMPLETED_PER_FOLD);
  return { sampleOk: allEvaluable && labeledOk && selectedAggOk && selectedFoldOk };
}

function baselineStatus(
  folds: readonly MlFoldResult[],
  selected: SelectedEconomicSlice,
): BaselineComparison {
  const perFoldOpened = folds.map((fold) => fold.baseline.openedPositions);
  const perFoldCompleted = folds.map((fold) => fold.baseline.completedTrades);
  const perFoldCensored = folds.map((fold) => fold.baseline.censoredTrades);
  const perFoldCensoringBps = folds.map((fold) => fold.baseline.censoringBps);
  const aggregateOpened = perFoldOpened.reduce((sum, value) => sum + value, 0);
  const aggregateCompleted = perFoldCompleted.reduce((sum, value) => sum + value, 0);
  const aggregateCensored = perFoldCensored.reduce((sum, value) => sum + value, 0);
  const aggregateCensoringBps = censoringBps(aggregateCensored, aggregateOpened);
  const completedOk =
    folds.length === 4 &&
    aggregateCompleted >= BASELINE_COMPARABLE_MIN_AGGREGATE_COMPLETED &&
    perFoldCompleted.every((count) => count >= BASELINE_COMPARABLE_MIN_COMPLETED_PER_FOLD);
  const censoringOk =
    !censoringExceedsLimit(aggregateCensoringBps) &&
    aggregateCensoringBps !== null &&
    folds.every((fold) => !censoringExceedsLimit(fold.baseline.censoringBps) && fold.baseline.censoringBps !== null);
  const comparable = completedOk && censoringOk;
  return {
    status: comparable ? 'COMPARABLE' : 'BASELINE_NOT_COMPARABLE',
    aggregateOpened,
    aggregateCompleted,
    aggregateCensored,
    aggregateCensoringBps,
    perFoldOpened,
    perFoldCompleted,
    perFoldCensored,
    perFoldCensoringBps,
    baselineBaseExpectancy: weightedExpectancy(
      folds.map((fold) => ({ n: fold.baseline.completedTrades, value: fold.baseline.netBaseExpectancy })),
    ),
    baselineStressExpectancy: weightedExpectancy(
      folds.map((fold) => ({ n: fold.baseline.completedTrades, value: fold.baseline.netStressExpectancy })),
    ),
    modelBaseExpectancy: selected.netBase?.expectancyUsd ?? null,
    modelStressExpectancy: selected.netStress?.expectancyUsd ?? null,
  };
}

function weightedExpectancy(parts: readonly { n: number; value: number | null }[]): number | null {
  let totalN = 0;
  let total = 0;
  for (const part of parts) {
    if (part.value === null || part.n === 0) {
      continue;
    }
    totalN += part.n;
    total += part.value * part.n;
  }
  if (totalN === 0) {
    return null;
  }
  return total / totalN;
}

function allFoldsEvaluable(
  folds: readonly MlFoldResult[],
  sampleOk: boolean,
): { result: MlGateResult; detail: string } {
  if (folds.length !== 4) {
    return { result: 'NOT_ENOUGH_DATA', detail: `Observed ${String(folds.length)} folds; 4 required.` };
  }
  const missing = folds.filter((fold) => !fold.evaluability.evaluable);
  if (missing.length > 0) {
    return {
      result: 'NOT_ENOUGH_DATA',
      detail: missing
        .map((fold) => `fold${String(fold.fold.foldId)}: ${fold.evaluability.reasons.join('; ')}`)
        .join(' | '),
    };
  }
  return { result: sampleOk ? 'PASS' : 'NOT_ENOUGH_DATA', detail: 'All four folds meet frozen ML sample minima.' };
}

function convergenceGate(
  folds: readonly MlFoldResult[],
  sampleOk: boolean,
): { result: MlGateResult; detail: string } {
  if (!sampleOk) {
    return { result: 'NOT_ENOUGH_DATA', detail: 'Trainer convergence is not evaluated without sufficient data.' };
  }
  const missing = folds.filter((fold) => fold.logistic === null || !fold.logistic.converged);
  if (missing.length > 0) {
    return {
      result: 'FAIL',
      detail: `Non-converged folds: ${missing.map((fold) => String(fold.fold.foldId)).join(', ')}`,
    };
  }
  return { result: 'PASS', detail: 'All four fold trainers converged.' };
}

function numericAtLeast(value: number, min: number): { result: MlGateResult; detail: string } {
  if (value < min) {
    return { result: 'NOT_ENOUGH_DATA', detail: `observed=${String(value)} need=${String(min)}` };
  }
  return { result: 'PASS', detail: `observed=${String(value)}` };
}

function aucGate(
  value: number | null,
  min: number,
  sampleOk: boolean,
): { result: MlGateResult; detail: string } {
  if (!sampleOk || value === null) {
    return { result: sampleOk ? 'NOT_EVALUABLE' : 'NOT_ENOUGH_DATA', detail: 'ROC-AUC unavailable.' };
  }
  return value >= min
    ? { result: 'PASS', detail: `rocAuc=${String(value)}` }
    : { result: 'FAIL', detail: `rocAuc=${String(value)}` };
}

function lowerBetter(
  model: number | null,
  nullModel: number | null,
  sampleOk: boolean,
): { result: MlGateResult; detail: string } {
  if (!sampleOk || model === null || nullModel === null) {
    return { result: 'NOT_ENOUGH_DATA', detail: 'Score comparison unavailable.' };
  }
  return model < nullModel
    ? { result: 'PASS', detail: `model=${String(model)} null=${String(nullModel)}` }
    : { result: 'FAIL', detail: `model=${String(model)} null=${String(nullModel)}` };
}

function foldAucGate(
  folds: readonly MlFoldResult[],
  sampleOk: boolean,
): { result: MlGateResult; detail: string } {
  if (!sampleOk) {
    return { result: 'NOT_ENOUGH_DATA', detail: 'Fold ROC-AUC unavailable.' };
  }
  const above = folds.filter((fold) => (fold.metrics?.rocAuc ?? 0) > 0.5 && fold.metrics?.rocAuc !== null).length;
  const unevaluable = folds.filter((fold) => fold.metrics === null || fold.metrics.rocAuc === null);
  if (unevaluable.length > 0) {
    return {
      result: 'NOT_EVALUABLE',
      detail: `${String(unevaluable.length)} fold(s) have undefined ROC-AUC.`,
    };
  }
  return above >= PROMOTION_MIN_FOLDS_AUC_ABOVE_CHANCE
    ? { result: 'PASS', detail: `foldsWithAucAboveChance=${String(above)}` }
    : { result: 'FAIL', detail: `foldsWithAucAboveChance=${String(above)}` };
}

function selectedCoverageGate(
  folds: readonly MlFoldResult[],
  selected: SelectedEconomicSlice,
): { result: MlGateResult; detail: string } {
  const perFold = folds.map((fold) => fold.selectedEconomics.completed);
  const aggOk = selected.completed >= SELECTED_MIN_AGGREGATE_COMPLETED;
  const foldOk = folds.length === 4 && perFold.every((count) => count >= SELECTED_MIN_COMPLETED_PER_FOLD);
  if (!aggOk || !foldOk) {
    return {
      result: 'NOT_ENOUGH_DATA',
      detail: `selected opened=${String(selected.selectedOpened)} completed=${String(selected.completed)} censored=${String(selected.censored)} censoringBps=${formatCensoringBps(selected.selectedCensoringBps)} perFoldCompleted=[${perFold.join(', ')}]`,
    };
  }
  return {
    result: 'PASS',
    detail: `selected opened=${String(selected.selectedOpened)} completed=${String(selected.completed)} censored=${String(selected.censored)} censoringBps=${formatCensoringBps(selected.selectedCensoringBps)}`,
  };
}

function labelCensoringGate(
  folds: readonly MlFoldResult[],
  sampleOk: boolean,
): { result: MlGateResult; detail: string } {
  if (folds.length !== 4) {
    return { result: 'NOT_ENOUGH_DATA', detail: 'Four folds required for censoring readiness.' };
  }
  const failed = folds.filter(
    (fold) =>
      censoringExceedsLimit(fold.evaluability.trainCensoringBps) ||
      fold.evaluability.trainCensoringBps === null ||
      censoringExceedsLimit(fold.evaluability.testCensoringBps) ||
      fold.evaluability.testCensoringBps === null,
  );
  if (failed.length > 0) {
    return {
      result: 'NOT_ENOUGH_DATA',
      detail: failed
        .map(
          (fold) =>
            `fold${String(fold.fold.foldId)} TRAIN ${formatCensoringBps(fold.evaluability.trainCensoringBps)} TEST ${formatCensoringBps(fold.evaluability.testCensoringBps)}`,
        )
        .join(' | '),
    };
  }
  return { result: sampleOk ? 'PASS' : 'NOT_ENOUGH_DATA', detail: `limit=${String(MAX_CENSORING_BPS)} bps` };
}

function selectedCensoringGate(
  folds: readonly MlFoldResult[],
  selected: SelectedEconomicSlice,
  sampleOk: boolean,
): { result: MlGateResult; detail: string } {
  if (selected.selectedOpened === 0) {
    return { result: 'NOT_ENOUGH_DATA', detail: 'selectedOpened=0' };
  }
  const aggregateFail = censoringExceedsLimit(selected.selectedCensoringBps);
  const foldFails = folds.filter((fold) => {
    const opened = fold.selectedEconomics.selectedOpened;
    if (opened === 0) {
      return fold.selectedEconomics.completed >= SELECTED_MIN_COMPLETED_PER_FOLD;
    }
    if (fold.selectedEconomics.completed >= SELECTED_MIN_COMPLETED_PER_FOLD) {
      return censoringExceedsLimit(fold.selectedEconomics.selectedCensoringBps);
    }
    return false;
  });
  if (aggregateFail || foldFails.length > 0) {
    return {
      result: sampleOk ? 'FAIL' : 'NOT_ENOUGH_DATA',
      detail: `aggregate=${formatCensoringBps(selected.selectedCensoringBps)} opened=${String(selected.selectedOpened)} completed=${String(selected.completed)} censored=${String(selected.censored)}`,
    };
  }
  return {
    result: sampleOk ? 'PASS' : 'NOT_ENOUGH_DATA',
    detail: `aggregate=${formatCensoringBps(selected.selectedCensoringBps)}`,
  };
}

function expectPositive(value: number | null, sampleOk: boolean): { result: MlGateResult; detail: string } {
  if (!sampleOk || value === null) {
    return { result: 'NOT_ENOUGH_DATA', detail: 'Expectancy unavailable.' };
  }
  return value > 0
    ? { result: 'PASS', detail: `expectancy=${String(value)}` }
    : { result: 'FAIL', detail: `expectancy=${String(value)}` };
}

function profitFactorGate(
  selected: SelectedEconomicSlice,
  sampleOk: boolean,
): { result: MlGateResult; detail: string } {
  if (!sampleOk || selected.netBase === null) {
    return { result: 'NOT_ENOUGH_DATA', detail: 'Profit factor unavailable.' };
  }
  const pf = selected.netBase.profitFactor;
  if (pf.kind === 'infinite') {
    return { result: 'PASS', detail: 'profitFactor=infinite' };
  }
  if (pf.kind === 'undefined') {
    return { result: 'FAIL', detail: 'profitFactor undefined' };
  }
  return pf.value >= PROMOTION_MIN_BASE_PROFIT_FACTOR
    ? { result: 'PASS', detail: `profitFactor=${String(pf.value)}` }
    : { result: 'FAIL', detail: `profitFactor=${String(pf.value)}` };
}

function drawdownGate(
  selected: SelectedEconomicSlice,
  sampleOk: boolean,
): { result: MlGateResult; detail: string } {
  if (!sampleOk || selected.netBase === null) {
    return { result: 'NOT_ENOUGH_DATA', detail: 'Drawdown unavailable.' };
  }
  const pct = selected.netBase.maxDrawdownPctOfReferenceBasis;
  if (pct === null) {
    return {
      result: 'FAIL',
      detail: 'Drawdown percent is undefined because peak cumulative completed-trade net PnL is not positive.',
    };
  }
  return pct <= PROMOTION_MAX_DRAWDOWN_PCT
    ? { result: 'PASS', detail: `maxDrawdownPct=${String(pct)}` }
    : { result: 'FAIL', detail: `maxDrawdownPct=${String(pct)}` };
}

function concentrationGate(
  value: number | null,
  maxPct: number,
  sampleOk: boolean,
): { result: MlGateResult; detail: string } {
  if (!sampleOk) {
    return { result: 'NOT_ENOUGH_DATA', detail: 'Concentration unavailable.' };
  }
  if (value === null) {
    return { result: 'FAIL', detail: 'No positive completed PnL; concentration is null.' };
  }
  return value <= maxPct
    ? { result: 'PASS', detail: `concentration=${String(value)}` }
    : { result: 'FAIL', detail: `concentration=${String(value)}` };
}

function baselineBeat(
  model: number | null,
  baseline: number | null,
  op: '>' | '>=',
  sampleOk: boolean,
  comparable: boolean,
): { result: MlGateResult; detail: string } {
  if (!sampleOk) {
    return { result: 'NOT_ENOUGH_DATA', detail: 'Baseline comparison requires sufficient selected-sample data.' };
  }
  if (!comparable || model === null || baseline === null) {
    return {
      result: 'NOT_COMPARABLE',
      detail: 'Baseline is not comparable; missing baseline comparison is not a model win.',
    };
  }
  const ok = op === '>' ? model > baseline : model >= baseline;
  return {
    result: ok ? 'PASS' : 'FAIL',
    detail: `model=${String(model)} baseline=${String(baseline)}`,
  };
}

function integrityGate(integrity: RuntimeIntegrityReport): { result: MlGateResult; detail: string } {
  if (integrity.status === 'PASS') {
    return { result: 'PASS', detail: integrity.checks.map((item) => item.id).join(', ') };
  }
  const failed = integrity.checks.filter((item) => item.result === 'FAIL');
  return { result: 'FAIL', detail: failed.map((item) => `${item.id}: ${item.detail}`).join('; ') };
}

function gate(id: string, title: string, body: { result: MlGateResult; detail: string }): PromotionGate {
  return { id, title, result: body.result, detail: body.detail };
}

export function isBaselineComparable(comparison: BaselineComparison): boolean {
  return comparison.status === 'COMPARABLE';
}
