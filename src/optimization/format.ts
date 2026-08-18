import { formatUsd } from '../market-data/format.js';
import { formatCapabilityFooter } from '../persistence/format.js';
import { listOptimizationEntryDescriptors, listOptimizationExitDescriptors } from './catalog.js';
import {
  COMBINED_THEORETICAL_PAIRS,
  COST_SPEC_VERSION,
  ENTRY_CANDIDATE_COUNT,
  EXIT_CANDIDATE_COUNT,
  OPTIMIZATION_CHECKPOINT,
  OPTIMIZATION_SPEC_NAME,
  OPTIMIZATION_SPEC_VERSION,
  REQUIRED_SCHEMA_VERSION,
  WALK_FORWARD_FOLD_COUNT,
} from './constants.js';
import { COST_DEFINITION_FINGERPRINT, listCostScenarios } from './costs.js';
import { OPTIMIZATION_DEFINITION_FINGERPRINT } from './identity.js';
import type { WalkForwardReport } from './walk-forward.js';
import type {
  ChronologicalSegment,
  OptimizationDataset,
  ProfitFactor,
  ScenarioMetrics,
  TrainingCandidateMetrics,
} from './types.js';

export function formatOptimizationStatusLines(): string[] {
  return [
    'STRATEGY OPTIMIZATION LAB',
    `Checkpoint ${OPTIMIZATION_CHECKPOINT}`,
    `Spec: ${OPTIMIZATION_SPEC_VERSION}`,
    `Name: ${OPTIMIZATION_SPEC_NAME}`,
    `Optimization definition fingerprint: ${OPTIMIZATION_DEFINITION_FINGERPRINT}`,
    `Cost spec: ${COST_SPEC_VERSION}`,
    `Cost definition fingerprint: ${COST_DEFINITION_FINGERPRINT}`,
    '',
    `Entry candidates: ${String(ENTRY_CANDIDATE_COUNT)}`,
    `Exit candidates: ${String(EXIT_CANDIDATE_COUNT)}`,
    `Combined theoretical pairs: ${String(COMBINED_THEORETICAL_PAIRS)}`,
    'Stage-wise selection is used. This is not a blind 40-way optimization.',
    `Walk-forward folds: ${String(WALK_FORWARD_FOLD_COUNT)}`,
    'Cost scenarios: LOW / BASE / STRESS (research assumptions, not measured execution cost)',
    `Schema: ${String(REQUIRED_SCHEMA_VERSION)}`,
    'Migration 009: unused by o17',
    'Live integration: NONE',
    'No wallet. No signing. No send. No Jupiter. No Solana RPC. No DB writes.',
    '',
    ...formatCapabilityFooter(),
  ];
}

export function formatOptimizationCatalogLines(): string[] {
  const lines = [
    'STRATEGY OPTIMIZATION CATALOG',
    'STABLE ORDER — NOT RANKED — NO PERFORMANCE',
    '',
    'Entry candidates',
  ];
  for (const entry of listOptimizationEntryDescriptors()) {
    lines.push(
      `${entry.candidateId} | ${entry.frozenR125 ? 'frozen r125' : 'cp17'} | ${entry.candidateDefinitionFingerprint}`,
    );
    lines.push(`  ${entry.description}`);
  }
  lines.push('');
  lines.push('Exit candidates');
  for (const exit of listOptimizationExitDescriptors()) {
    lines.push(
      `${exit.candidateId} | ${exit.usesFrozenX11Evaluator ? 'frozen x11 evaluator' : 'o17 observation model'} | ${exit.candidateDefinitionFingerprint}`,
    );
    lines.push(`  ${exit.description}`);
  }
  lines.push('');
  lines.push('Cost scenarios (all-in research friction assumptions)');
  for (const cost of listCostScenarios()) {
    lines.push(
      `${cost.scenarioId} | entry ${String(cost.entryBps)} bps | exit ${String(cost.exitBps)} bps`,
    );
    lines.push(`  ${cost.description}`);
  }
  lines.push('');
  lines.push(...formatCapabilityFooter());
  return lines;
}

export function formatOptimizationDataLines(input: {
  dataset: OptimizationDataset;
  segments: readonly ChronologicalSegment[] | null;
  readiness: {
    timePartitionsConstructible: boolean;
    walkForwardEvaluable: boolean;
    promotionDataSufficient: boolean;
  };
}): string[] {
  const { dataset, segments, readiness } = input;
  const lines = [
    'STRATEGY OPTIMIZATION DATASET',
    'READ-ONLY / QUERY-ONLY / NO NETWORK',
    '',
    `rawMarketSnapshotCount: ${String(dataset.rawMarketSnapshotCount)}`,
    `runtimeExitReferencedSnapshotCountExcluded: ${String(dataset.runtimeExitReferencedSnapshotCountExcluded)}`,
    `researchMarketSnapshotCount: ${String(dataset.researchMarketSnapshotCount)}`,
    `Unique tokens: ${String(dataset.uniqueTokenCount)}`,
    `Unique pairs: ${String(dataset.uniquePairCount)}`,
    `Risk scans: ${String(dataset.riskScanCount)}`,
    `Tokens with risk scans: ${String(dataset.uniqueTokensWithRiskScan)}`,
    `First snapshot: ${dataset.firstSnapshotAt ?? 'n/a'}`,
    `Last snapshot: ${dataset.lastSnapshotAt ?? 'n/a'}`,
    `Dataset span ms: ${dataset.datasetSpanMs === null ? 'n/a' : String(dataset.datasetSpanMs)}`,
    `Dataset fingerprint: ${dataset.optimizationDatasetFingerprint}`,
    `Research dataset fingerprint: ${dataset.researchDatasetFingerprint}`,
    `Schema: ${String(dataset.schemaVersion)}`,
    `Migration 009: ${dataset.migration009Present ? 'present (wallet intelligence; unused by o17)' : 'absent'}`,
    '',
    'Segment snapshot / token counts',
  ];
  if (segments === null) {
    lines.push('Segments: unavailable (need first/last snapshot timestamps).');
  } else {
    for (const segment of segments) {
      lines.push(
        `${segment.segmentId}: snapshots ${String(segment.snapshotCount)} | tokens ${String(segment.uniqueTokenCount)} | startMs ${String(segment.startInclusiveMs)} | end ${segment.endExclusiveMs === null ? `inclusive ${String(segment.endInclusiveMs)}` : `exclusive ${String(segment.endExclusiveMs)}`}`,
      );
    }
  }
  lines.push('');
  lines.push(`Time partitions constructible: ${readiness.timePartitionsConstructible ? 'YES' : 'NO'}`);
  lines.push(`Walk-forward evaluable: ${readiness.walkForwardEvaluable ? 'YES' : 'NO'}`);
  lines.push(`Promotion data sufficient: ${readiness.promotionDataSufficient ? 'YES' : 'NO'}`);
  lines.push(
    'Walk-forward evaluable requires a 24h-eligible TRAIN entry window and TEST observations/entries in every fold. Time partitions can exist while evaluation is impossible.',
  );
  lines.push('The 24h cutoff provides the maximum configured clock-time window inside the fold; it does not guarantee a closing observation.');
  lines.push('Do not loosen cutoffs, costs, or catalogs if this is NO.');
  lines.push('');
  lines.push(...formatCapabilityFooter());
  return lines;
}

export function formatOptimizationRunLines(report: WalkForwardReport): string[] {
  const lines = [
    ...formatResearchDisclaimer(),
    '',
    'Optimization identity',
    `Spec: ${OPTIMIZATION_SPEC_VERSION}`,
    `Definition fingerprint: ${report.optimizationDefinitionFingerprint}`,
    `Dataset fingerprint: ${report.optimizationDatasetFingerprint}`,
    `Run fingerprint: ${report.optimizationRunFingerprint}`,
    `Research dataset fingerprint: ${report.researchDatasetFingerprint}`,
    `Time partitions constructible: ${report.readiness.timePartitionsConstructible ? 'YES' : 'NO'}`,
    `Walk-forward evaluable: ${report.readiness.walkForwardEvaluable ? 'YES' : 'NO'}`,
    `Promotion data sufficient: ${report.readiness.promotionDataSufficient ? 'YES' : 'NO'}`,
    `Runtime integrity: ${report.integrity.status}`,
    '',
    'Fold boundaries',
  ];
  if (report.segments === null) {
    lines.push('Segments unavailable.');
  } else {
    for (const segment of report.segments) {
      lines.push(
        `${segment.segmentId}: startInclusiveMs=${String(segment.startInclusiveMs)} snapshots=${String(segment.snapshotCount)} tokens=${String(segment.uniqueTokenCount)}`,
      );
    }
  }
  for (const fold of report.folds) {
    lines.push('');
    lines.push(`FOLD ${String(fold.fold.foldId)}`);
    lines.push(
      `Train ${fold.fold.trainSegmentIds.join('+')} | test ${fold.fold.testSegmentId} | fingerprint ${fold.fold.optimizationFoldFingerprint}`,
    );
    lines.push(
      `Train window ms [${String(fold.fold.trainStartInclusiveMs)}, ${String(fold.fold.trainEndExclusiveMs)}) latestEntryInclusive ${String(fold.fold.trainLatestEntryInclusiveMs)}`,
    );
    lines.push(
      `Test window ms [${String(fold.fold.testStartInclusiveMs)}, ${fold.fold.testEndExclusiveMs === null ? `${String(fold.fold.testEndInclusiveMs)}] inclusive` : `${String(fold.fold.testEndExclusiveMs)})`} latestEntryInclusive ${String(fold.fold.testLatestEntryInclusiveMs)}`,
    );
    lines.push('Stage A entry selection (x11_baseline, TRAIN only)');
    lines.push(...formatSelectionTable(fold.entryTrainingTable));
    lines.push(
      `Selected entry: ${fold.selectedEntryId ?? 'NO_TRAIN_ENTRY_SELECTION'}`,
    );
    lines.push('Stage B exit selection (TRAIN only)');
    lines.push(...formatSelectionTable(fold.exitTrainingTable));
    lines.push(`Selected exit: ${fold.selectedExitId ?? 'NO_TRAIN_ENTRY_SELECTION'}`);
    lines.push('OOS selected');
    lines.push(...formatSimulationSummary(fold.oosSelected));
    lines.push('OOS control s07_baseline + x11_baseline');
    lines.push(...formatSimulationSummary(fold.oosBaseline));
    lines.push('OOS control quality_control_v1 + x11_baseline');
    lines.push(...formatSimulationSummary(fold.oosQualityControl));
    lines.push(
      `Degradation BASE: ${formatDegradation(fold.degradation.baseDegradationPct, fold.degradation.baseDegradationReason)}`,
    );
    lines.push(
      `Degradation STRESS: ${formatDegradation(fold.degradation.stressDegradationPct, fold.degradation.stressDegradationReason)}`,
    );
  }

  lines.push('');
  lines.push('Selection frequency');
  lines.push(`entrySelectionFrequency: ${formatFrequency(report.selectionFrequency.entry)}`);
  lines.push(`exitSelectionFrequency: ${formatFrequency(report.selectionFrequency.exit)}`);
  lines.push(`combinedSelectionFrequency: ${formatFrequency(report.selectionFrequency.combined)}`);
  lines.push('');
  lines.push(
    `Aggregate selected OOS measures the walk-forward selection methodology (${report.aggregateSelectedKind}), not a single fixed strategy unless every fold selected the same pair.`,
  );
  lines.push('Aggregate selected-strategy OOS');
  lines.push(...formatSimulationSummary(report.aggregateSelectedOos));
  lines.push('Aggregate s07+x11 OOS');
  lines.push(...formatSimulationSummary(report.aggregateBaselineOos));
  lines.push('');
  lines.push('Promotion gates');
  for (const item of report.promotionGates) {
    lines.push(`${item.result} | ${item.id} | ${item.title} | ${item.detail}`);
  }
  lines.push('');
  lines.push(`Final optimization status: ${report.promotionStatus}`);
  if (report.paperValidationCandidate !== null) {
    const candidate = report.paperValidationCandidate;
    lines.push('PAPER_VALIDATION_CANDIDATE (not live approval; not a fresh OOS proof; selected on all history for FUTURE paper testing)');
    lines.push(`Entry: ${candidate.entryCandidateId} ${candidate.entryDefinitionFingerprint}`);
    lines.push(`Exit: ${candidate.exitCandidateId} ${candidate.exitDefinitionFingerprint}`);
    lines.push(`Optimization fingerprint: ${candidate.optimizationDefinitionFingerprint}`);
    lines.push(`Dataset fingerprint: ${candidate.optimizationDatasetFingerprint}`);
    lines.push(`Run fingerprint: ${candidate.optimizationRunFingerprint}`);
  }
  lines.push('');
  lines.push(...formatCapabilityFooter());
  return lines;
}

export function formatOptimizationFoldLines(report: WalkForwardReport): string[] {
  const lines = [
    ...formatResearchDisclaimer(),
    '',
    'COMPACT FOLD REPORT',
    'Same engine and rules as optimization:run. No alternate methodology.',
    `Run fingerprint: ${report.optimizationRunFingerprint}`,
    '',
  ];
  for (const fold of report.folds) {
    lines.push(
      `F${String(fold.fold.foldId)} train=${fold.fold.trainSegmentIds.join('+')} test=${fold.fold.testSegmentId} entry=${fold.selectedEntryId ?? 'none'} exit=${fold.selectedExitId ?? 'none'} oosCompleted=${String(fold.oosSelected?.coverage.completedTrades ?? 0)} oosBaseExp=${formatNullable(fold.oosSelected?.netBase.expectancyUsd ?? null)} oosStressExp=${formatNullable(fold.oosSelected?.netStress.expectancyUsd ?? null)}`,
    );
  }
  lines.push('');
  lines.push(`Status: ${report.promotionStatus}`);
  lines.push('');
  lines.push(...formatCapabilityFooter());
  return lines;
}

function formatSelectionTable(rows: readonly TrainingCandidateMetrics[]): string[] {
  if (rows.length === 0) {
    return ['  (no rows)'];
  }
  return rows.map((row) => {
    return `  ${row.candidateId} | ${row.eligibility} | completed ${String(row.coverage.completedTrades)} | censored ${formatNullable(row.coverage.censoredFraction)} | stressExp ${formatNullable(row.netStress.expectancyUsd)} | basePF ${formatProfitFactor(row.netBase.profitFactor)} | baseDD ${formatNullable(row.netBase.maxDrawdownUsd)} | baseMedian ${formatNullable(row.netBase.medianTradePnlUsd)}${row.ineligibleReason === null ? '' : ` | ${row.ineligibleReason}`}`;
  });
}

function formatSimulationSummary(
  result: WalkForwardReport['aggregateSelectedOos'],
): string[] {
  if (result === null) {
    return ['  n/a'];
  }
  return [
    `  opened ${String(result.coverage.openedPositions)} completed ${String(result.coverage.completedTrades)} unresolved ${String(result.coverage.unresolvedTrades)} partialCensored ${String(result.coverage.partiallyCensoredTrades)}`,
    `  GROSS ${formatScenario(result.gross)}`,
    `  LOW ${formatScenario(result.netLow)}`,
    `  BASE ${formatScenario(result.netBase)}`,
    `  STRESS ${formatScenario(result.netStress)}`,
  ];
}

function formatScenario(metrics: ScenarioMetrics): string {
  return `pnl ${formatSignedUsd(metrics.totalPnlUsd)} exp ${formatNullable(metrics.expectancyUsd)} pf ${formatProfitFactor(metrics.profitFactor)} dd ${formatNullable(metrics.maxDrawdownUsd)} top1 ${formatNullable(metrics.top1PositiveConcentration)} top3 ${formatNullable(metrics.top3PositiveConcentration)}`;
}

function formatProfitFactor(value: ProfitFactor): string {
  if (value.kind === 'infinite') {
    return 'infinite';
  }
  if (value.kind === 'undefined') {
    return 'undefined';
  }
  return String(value.value);
}

function formatFrequency(record: Record<string, number>): string {
  const keys = Object.keys(record).sort();
  if (keys.length === 0) {
    return 'none';
  }
  return keys.map((key) => `${key}=${String(record[key] ?? 0)}`).join(', ');
}

function formatDegradation(pct: number | null, reason: string | null): string {
  if (pct === null) {
    return reason ?? 'n/a';
  }
  return `${String(pct)}%`;
}

function formatNullable(value: number | null): string {
  return value === null ? 'n/a' : String(value);
}

function formatSignedUsd(value: number): string {
  if (value > 0) {
    return `+${formatUsd(value)}`;
  }
  return formatUsd(value);
}

function formatResearchDisclaimer(): string[] {
  return [
    'STRATEGY OPTIMIZATION RESEARCH',
    'TRAIN: candidate selection allowed. TEST/OOS: measurement only.',
    'Cost scenarios are assumptions, not historical exact execution cost.',
    'Quantity = $100 / gross reference entry price. Effective cash outlay under friction may exceed $100.',
    'Triggers use the GROSS reference path. LOW/BASE/STRESS change PnL only after a gross leg exists.',
    'Frozen x11_baseline is a historical control and keeps x11 observed-take fills. New o17 exits use target-take fills. Stage B is not a perfectly normalized execution comparison.',
    'The 24h fold cutoff provides the maximum configured clock-time window inside the fold. It does not guarantee a closing observation; sparse data stays censored.',
    'A good backtest is not live profitability.',
    'Allowed statuses: NO_PROMOTION_INSUFFICIENT_DATA, NO_PROMOTION_FAILED_ROBUSTNESS, ELIGIBLE_FOR_FORWARD_PAPER_VALIDATION.',
    'ELIGIBLE_FOR_FORWARD_PAPER_VALIDATION is not live approval.',
  ];
}
