import { allScenarioMetrics, coverageFromCounts } from './metrics.js';
import { pnlByToken } from './concentration.js';
import { getOptimizationEntryDescriptor, getOptimizationExitDescriptor } from './catalog.js';
import { OPTIMIZATION_SPEC_VERSION } from './constants.js';
import {
  OPTIMIZATION_DEFINITION_FINGERPRINT,
  fingerprintOptimizationRun,
} from './identity.js';
import {
  buildChronologicalSegments,
  buildFoldBoundaries,
  fullHistoryWindow,
  testWindow,
  trainWindow,
} from './folds.js';
import { evaluatePromotion } from './promotion.js';
import {
  ineligibleReason,
  isTrainEligible,
  selectFromTrainingSelectorInputs,
  toTrainingSelectorInput,
  type TrainingSelectorInput,
} from './selector.js';
import { simulateOptimizationPair } from './simulator.js';
import { buildOptimizationIndexes } from './timeline.js';
import { evaluateRuntimeIntegrity } from './integrity.js';
import { evaluateStructuralReadiness } from './readiness.js';
import {
  OPTIMIZATION_ENTRY_CANDIDATE_IDS,
  OPTIMIZATION_EXIT_CANDIDATE_IDS,
  type ChronologicalSegment,
  type DegradationReport,
  type FoldBoundaries,
  type OptimizationDataset,
  type OptimizationEntryCandidateId,
  type OptimizationExitCandidateId,
  type OptimizationPromotionStatus,
  type OptimizationSimulationResult,
  type PaperValidationCandidate,
  type PromotionGate,
  type RuntimeIntegrityReport,
  type StageSelection,
  type StructuralReadiness,
  type TrainingCandidateMetrics,
} from './types.js';

export type FoldWalkForwardResult = {
  fold: FoldBoundaries;
  entrySelection: StageSelection;
  exitSelection: StageSelection;
  selectedEntryId: OptimizationEntryCandidateId | null;
  selectedExitId: OptimizationExitCandidateId | null;
  trainSelected: OptimizationSimulationResult | null;
  oosSelected: OptimizationSimulationResult | null;
  oosBaseline: OptimizationSimulationResult;
  oosQualityControl: OptimizationSimulationResult;
  degradation: DegradationReport;
  entryTrainingTable: readonly TrainingCandidateMetrics[];
  exitTrainingTable: readonly TrainingCandidateMetrics[];
};

export type WalkForwardReport = {
  optimizationDefinitionFingerprint: string;
  optimizationDatasetFingerprint: string;
  optimizationRunFingerprint: string;
  researchDatasetFingerprint: string;
  readiness: StructuralReadiness;
  integrity: RuntimeIntegrityReport;
  paperSelectionInvoked: boolean;
  aggregateSelectedKind: 'none' | 'single_frozen_pair' | 'walk_forward_selection_methodology';
  segments: ChronologicalSegment[] | null;
  folds: FoldWalkForwardResult[];
  selectionFrequency: {
    entry: Record<string, number>;
    exit: Record<string, number>;
    combined: Record<string, number>;
  };
  aggregateSelectedOos: OptimizationSimulationResult | null;
  aggregateBaselineOos: OptimizationSimulationResult | null;
  aggregateQualityControlOos: OptimizationSimulationResult | null;
  promotionStatus: OptimizationPromotionStatus;
  promotionGates: readonly PromotionGate[];
  paperValidationCandidate: PaperValidationCandidate | null;
};

export function runAnchoredWalkForward(dataset: OptimizationDataset): WalkForwardReport {
  const indexes = buildOptimizationIndexes({
    marketSnapshots: dataset.marketSnapshots,
    riskReports: dataset.riskReports,
  });
  const segments = buildChronologicalSegments(dataset);
  const foldBoundaries = segments === null ? null : buildFoldBoundaries(dataset, segments);
  const folds: FoldWalkForwardResult[] = [];
  if (foldBoundaries !== null) {
    for (const fold of foldBoundaries) {
      folds.push(evaluateOneFold(dataset, indexes, fold));
    }
  }

  const selectedOos = folds.flatMap((fold) => (fold.oosSelected === null ? [] : [fold.oosSelected]));
  const aggregateSelectedOos = selectedOos.length === 0 ? null : mergeSimulations(selectedOos);
  const aggregateBaselineOos = folds.length === 0 ? null : mergeSimulations(folds.map((fold) => fold.oosBaseline));
  const aggregateQualityControlOos =
    folds.length === 0 ? null : mergeSimulations(folds.map((fold) => fold.oosQualityControl));
  const integrity = evaluateRuntimeIntegrity({
    dataset,
    segments,
    folds,
  });
  const promotion = evaluatePromotion({
    folds,
    aggregateSelectedOos,
    aggregateBaselineOos,
    integrity,
  });
  const readiness = evaluateStructuralReadiness({
    dataset,
    segments,
    folds: foldBoundaries,
    promotionDataSufficient: promotion.gates.find((item) => item.id === 'data_sufficiency')?.result === 'PASS',
  });
  const eligible = promotion.status === 'ELIGIBLE_FOR_FORWARD_PAPER_VALIDATION';
  const paperValidationCandidate = eligible ? selectFinalPaperCandidate(dataset, indexes) : null;

  return {
    optimizationDefinitionFingerprint: OPTIMIZATION_DEFINITION_FINGERPRINT,
    optimizationDatasetFingerprint: dataset.optimizationDatasetFingerprint,
    optimizationRunFingerprint: fingerprintOptimizationRun({
      optimizationDefinitionFingerprint: OPTIMIZATION_DEFINITION_FINGERPRINT,
      optimizationDatasetFingerprint: dataset.optimizationDatasetFingerprint,
    }),
    researchDatasetFingerprint: dataset.researchDatasetFingerprint,
    readiness,
    integrity,
    paperSelectionInvoked: eligible,
    aggregateSelectedKind: describeAggregateKind(folds),
    segments,
    folds,
    selectionFrequency: summarizeSelectionFrequency(folds),
    aggregateSelectedOos,
    aggregateBaselineOos,
    aggregateQualityControlOos,
    promotionStatus: promotion.status,
    promotionGates: promotion.gates,
    paperValidationCandidate,
  };
}

function evaluateOneFold(
  dataset: OptimizationDataset,
  indexes: ReturnType<typeof buildOptimizationIndexes>,
  fold: FoldBoundaries,
): FoldWalkForwardResult {
  const train = trainWindow(fold);
  const test = testWindow(fold);
  const entryTrainingTable = OPTIMIZATION_ENTRY_CANDIDATE_IDS.map((entryId) => {
    const simulated = simulateOptimizationPair({
      dataset,
      indexes,
      entryCandidateId: entryId,
      exitCandidateId: 'x11_baseline',
      window: train,
    });
    return trainingMetricsFromSimulation(entryId, simulated.entryDefinitionFingerprint, simulated);
  });
  const entrySelection = selectFromTrainingSelectorInputs(entryTrainingTable.map(toTrainingSelectorInput));

  let exitTrainingTable: TrainingCandidateMetrics[] = [];
  let exitSelection: StageSelection = {
    status: 'NO_TRAIN_ENTRY_SELECTION',
    candidateId: null,
    candidateDefinitionFingerprint: null,
    ranked: [],
  };
  let selectedEntryId: OptimizationEntryCandidateId | null = null;
  let selectedExitId: OptimizationExitCandidateId | null = null;
  let trainSelected: OptimizationSimulationResult | null = null;
  let oosSelected: OptimizationSimulationResult | null = null;

  if (entrySelection.status === 'selected' && isEntryId(entrySelection.candidateId)) {
    const entryId = entrySelection.candidateId;
    selectedEntryId = entryId;
    exitTrainingTable = OPTIMIZATION_EXIT_CANDIDATE_IDS.map((exitId) => {
      const simulated = simulateOptimizationPair({
        dataset,
        indexes,
        entryCandidateId: entryId,
        exitCandidateId: exitId,
        window: train,
      });
      return trainingMetricsFromSimulation(exitId, simulated.exitDefinitionFingerprint, simulated);
    });
    exitSelection = selectFromTrainingSelectorInputs(exitTrainingTable.map(toTrainingSelectorInput));
    if (exitSelection.status === 'selected' && isExitId(exitSelection.candidateId)) {
      const exitId = exitSelection.candidateId;
      selectedExitId = exitId;
      trainSelected = simulateOptimizationPair({
        dataset,
        indexes,
        entryCandidateId: entryId,
        exitCandidateId: exitId,
        window: train,
      });
      oosSelected = simulateOptimizationPair({
        dataset,
        indexes,
        entryCandidateId: entryId,
        exitCandidateId: exitId,
        window: test,
      });
    }
  }

  return {
    fold,
    entrySelection,
    exitSelection,
    selectedEntryId,
    selectedExitId,
    trainSelected,
    oosSelected,
    oosBaseline: simulateOptimizationPair({
      dataset,
      indexes,
      entryCandidateId: 's07_baseline',
      exitCandidateId: 'x11_baseline',
      window: test,
    }),
    oosQualityControl: simulateOptimizationPair({
      dataset,
      indexes,
      entryCandidateId: 'quality_control_v1',
      exitCandidateId: 'x11_baseline',
      window: test,
    }),
    degradation: buildDegradation(trainSelected, oosSelected),
    entryTrainingTable,
    exitTrainingTable,
  };
}

function trainingSelectorInputFromSimulation(
  candidateId: string,
  fingerprint: string,
  simulated: OptimizationSimulationResult,
): TrainingSelectorInput {
  return {
    candidateId,
    candidateDefinitionFingerprint: fingerprint,
    eligibility: 'eligible',
    completedTrades: simulated.coverage.completedTrades,
    censoredFraction: simulated.coverage.censoredFraction,
    stressExpectancyUsd: simulated.netStress.expectancyUsd,
    baseProfitFactor: simulated.netBase.profitFactor,
    baseMaxDrawdownUsd: simulated.netBase.maxDrawdownUsd,
    baseMedianTradePnlUsd: simulated.netBase.medianTradePnlUsd,
  };
}

function trainingMetricsFromSimulation(
  candidateId: string,
  fingerprint: string,
  simulated: OptimizationSimulationResult,
): TrainingCandidateMetrics {
  const selectorInput = trainingSelectorInputFromSimulation(candidateId, fingerprint, simulated);
  const eligible = isTrainEligible(selectorInput);
  return {
    candidateId,
    candidateDefinitionFingerprint: fingerprint,
    eligibility: eligible ? 'eligible' : 'TRAIN_INELIGIBLE',
    ineligibleReason: eligible ? null : ineligibleReason(selectorInput),
    coverage: simulated.coverage,
    gross: simulated.gross,
    netLow: simulated.netLow,
    netBase: simulated.netBase,
    netStress: simulated.netStress,
  };
}

function buildDegradation(
  train: OptimizationSimulationResult | null,
  oos: OptimizationSimulationResult | null,
): DegradationReport {
  const base = expectancyDegradation(train?.netBase.expectancyUsd ?? null, oos?.netBase.expectancyUsd ?? null);
  const stress = expectancyDegradation(
    train?.netStress.expectancyUsd ?? null,
    oos?.netStress.expectancyUsd ?? null,
  );
  return {
    trainingBaseExpectancyUsd: train?.netBase.expectancyUsd ?? null,
    oosBaseExpectancyUsd: oos?.netBase.expectancyUsd ?? null,
    trainingStressExpectancyUsd: train?.netStress.expectancyUsd ?? null,
    oosStressExpectancyUsd: oos?.netStress.expectancyUsd ?? null,
    baseDegradationPct: base.pct,
    stressDegradationPct: stress.pct,
    baseDegradationReason: base.reason,
    stressDegradationReason: stress.reason,
  };
}

export function expectancyDegradation(
  train: number | null,
  oos: number | null,
): { pct: number | null; reason: string | null } {
  if (train === null || oos === null) {
    return { pct: null, reason: 'missing train or OOS expectancy' };
  }
  if (!(train > 0)) {
    return { pct: null, reason: 'train expectancy <= 0; degradation not defined' };
  }
  return { pct: ((train - oos) / Math.abs(train)) * 100, reason: null };
}

function summarizeSelectionFrequency(folds: readonly FoldWalkForwardResult[]): WalkForwardReport['selectionFrequency'] {
  const entry: Record<string, number> = {};
  const exit: Record<string, number> = {};
  const combined: Record<string, number> = {};
  for (const fold of folds) {
    if (fold.selectedEntryId !== null) {
      entry[fold.selectedEntryId] = (entry[fold.selectedEntryId] ?? 0) + 1;
    }
    if (fold.selectedExitId !== null) {
      exit[fold.selectedExitId] = (exit[fold.selectedExitId] ?? 0) + 1;
    }
    if (fold.selectedEntryId !== null && fold.selectedExitId !== null) {
      const key = `${fold.selectedEntryId}+${fold.selectedExitId}`;
      combined[key] = (combined[key] ?? 0) + 1;
    }
  }
  return { entry, exit, combined };
}

export function mergeSimulations(results: readonly OptimizationSimulationResult[]): OptimizationSimulationResult {
  const first = results[0];
  if (first === undefined) {
    throw new Error('mergeSimulations requires at least one result.');
  }
  const completedTrades = results.flatMap((item) => item.completedTrades);
  const unresolvedPositions = results.flatMap((item) => item.unresolvedPositions);
  const unresolved = unresolvedPositions.filter((item) => item.unresolvedReason !== 'partially_realized_censored').length;
  const partial = unresolvedPositions.filter((item) => item.unresolvedReason === 'partially_realized_censored').length;
  return {
    entryCandidateId: first.entryCandidateId,
    exitCandidateId: first.exitCandidateId,
    entryDefinitionFingerprint: first.entryDefinitionFingerprint,
    exitDefinitionFingerprint: first.exitDefinitionFingerprint,
    decisions: results.reduce(
      (acc, item) => ({
        evaluatedSnapshotCount: acc.evaluatedSnapshotCount + item.decisions.evaluatedSnapshotCount,
        entryCandidateCount: acc.entryCandidateCount + item.decisions.entryCandidateCount,
        noEntryCount: acc.noEntryCount + item.decisions.noEntryCount,
        insufficientDataCount: acc.insufficientDataCount + item.decisions.insufficientDataCount,
        skippedWhileOpenCount: acc.skippedWhileOpenCount + item.decisions.skippedWhileOpenCount,
      }),
      {
        evaluatedSnapshotCount: 0,
        entryCandidateCount: 0,
        noEntryCount: 0,
        insufficientDataCount: 0,
        skippedWhileOpenCount: 0,
      },
    ),
    coverage: coverageFromCounts({
      snapshots: results.reduce((sum, item) => sum + item.coverage.snapshots, 0),
      uniqueTokenMints: new Set([
        ...completedTrades.map((trade) => trade.tokenMint),
        ...unresolvedPositions.map((item) => item.tokenMint),
      ]).size,
      uniquePairs: new Set([
        ...completedTrades.map((trade) => `${trade.tokenMint}:${trade.pairAddress}`),
        ...unresolvedPositions.map((item) => `${item.tokenMint}:${item.pairAddress}`),
      ]).size,
      openedPositions: completedTrades.length + unresolvedPositions.length,
      completedTrades: completedTrades.length,
      unresolvedTrades: unresolved,
      partiallyCensoredTrades: partial,
    }),
    completedTrades,
    unresolvedPositions,
    ...allScenarioMetrics(completedTrades),
    pnlByToken: pnlByToken(completedTrades),
  };
}

function selectFinalPaperCandidate(
  dataset: OptimizationDataset,
  indexes: ReturnType<typeof buildOptimizationIndexes>,
): PaperValidationCandidate | null {
  const window = fullHistoryWindow(dataset);
  if (window === null) {
    return null;
  }
  const entryTable = OPTIMIZATION_ENTRY_CANDIDATE_IDS.map((entryId) => {
    const simulated = simulateOptimizationPair({
      dataset,
      indexes,
      entryCandidateId: entryId,
      exitCandidateId: 'x11_baseline',
      window,
    });
    return trainingMetricsFromSimulation(entryId, simulated.entryDefinitionFingerprint, simulated);
  });
  const entrySelection = selectFromTrainingSelectorInputs(entryTable.map(toTrainingSelectorInput));
  if (entrySelection.status !== 'selected' || !isEntryId(entrySelection.candidateId)) {
    return null;
  }
  const paperEntryId = entrySelection.candidateId;
  const exitTable = OPTIMIZATION_EXIT_CANDIDATE_IDS.map((exitId) => {
    const simulated = simulateOptimizationPair({
      dataset,
      indexes,
      entryCandidateId: paperEntryId,
      exitCandidateId: exitId,
      window,
    });
    return trainingMetricsFromSimulation(exitId, simulated.exitDefinitionFingerprint, simulated);
  });
  const exitSelection = selectFromTrainingSelectorInputs(exitTable.map(toTrainingSelectorInput));
  if (exitSelection.status !== 'selected' || !isExitId(exitSelection.candidateId)) {
    return null;
  }
  const paperExitId = exitSelection.candidateId;
  return {
    kind: 'PAPER_VALIDATION_CANDIDATE',
    entryCandidateId: paperEntryId,
    entryDefinitionFingerprint: getOptimizationEntryDescriptor(paperEntryId).candidateDefinitionFingerprint,
    exitCandidateId: paperExitId,
    exitDefinitionFingerprint: getOptimizationExitDescriptor(paperExitId).candidateDefinitionFingerprint,
    optimizationSpecVersion: OPTIMIZATION_SPEC_VERSION,
    optimizationDefinitionFingerprint: OPTIMIZATION_DEFINITION_FINGERPRINT,
    optimizationDatasetFingerprint: dataset.optimizationDatasetFingerprint,
    optimizationRunFingerprint: fingerprintOptimizationRun({
      optimizationDefinitionFingerprint: OPTIMIZATION_DEFINITION_FINGERPRINT,
      optimizationDatasetFingerprint: dataset.optimizationDatasetFingerprint,
    }),
  };
}

function describeAggregateKind(
  folds: readonly FoldWalkForwardResult[],
): WalkForwardReport['aggregateSelectedKind'] {
  const pairs = folds.flatMap((fold) => {
    if (fold.selectedEntryId === null || fold.selectedExitId === null) {
      return [];
    }
    return [`${fold.selectedEntryId}+${fold.selectedExitId}`];
  });
  if (pairs.length === 0) {
    return 'none';
  }
  const unique = new Set(pairs);
  return unique.size === 1 ? 'single_frozen_pair' : 'walk_forward_selection_methodology';
}

function isEntryId(value: string): value is OptimizationEntryCandidateId {
  return (OPTIMIZATION_ENTRY_CANDIDATE_IDS as readonly string[]).includes(value);
}

function isExitId(value: string): value is OptimizationExitCandidateId {
  return (OPTIMIZATION_EXIT_CANDIDATE_IDS as readonly string[]).includes(value);
}
