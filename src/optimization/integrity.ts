import { requireUtcTimestamp } from '../features/numbers.js';
import {
  OPTIMIZATION_ENTRY_CANDIDATE_IDS,
  OPTIMIZATION_EXIT_CANDIDATE_IDS,
  type ChronologicalSegment,
  type FoldBoundaries,
  type OptimizationDataset,
  type OptimizationSimulationResult,
  type RuntimeIntegrityReport,
  type SimulationWindow,
} from './types.js';
import { assertExactSegmentPartition } from './partition.js';
import { isObservationInWindow, testWindow, trainWindow } from './folds.js';
import { OPTIMIZATION_DEFINITION_FINGERPRINT } from './identity.js';

export type IntegrityFoldView = {
  fold: FoldBoundaries;
  selectedEntryId: string | null;
  selectedExitId: string | null;
  oosSelected: OptimizationSimulationResult | null;
  trainSelected: OptimizationSimulationResult | null;
};

export function evaluateRuntimeIntegrity(input: {
  dataset: OptimizationDataset;
  segments: readonly ChronologicalSegment[] | null;
  folds: readonly IntegrityFoldView[];
}): RuntimeIntegrityReport {
  const checks = [
    check('definition_fingerprint', () => {
      if (input.dataset.optimizationDefinitionFingerprint !== OPTIMIZATION_DEFINITION_FINGERPRINT) {
        return 'Dataset o17 fingerprint does not match the process definition fingerprint.';
      }
      return null;
    }),
    check('integer_partition', () => {
      if (input.segments === null || input.dataset.firstSnapshotAt === null || input.dataset.lastSnapshotAt === null) {
        return null;
      }
      const lastMs = requireUtcTimestamp(input.dataset.lastSnapshotAt, 'lastSnapshotAt');
      assertExactSegmentPartition(input.dataset.marketSnapshots, input.segments, lastMs);
      for (const segment of input.segments) {
        if (!Number.isInteger(segment.startInclusiveMs)) {
          return 'Segment start is not an integer millisecond.';
        }
      }
      return null;
    }),
    check('disjoint_train_test', () => {
      for (const fold of input.folds) {
        const train = trainWindow(fold.fold);
        const test = testWindow(fold.fold);
        if (fold.fold.testStartInclusiveMs < fold.fold.trainEndExclusiveMs) {
          return `Fold ${String(fold.fold.foldId)} test starts before train ends.`;
        }
        for (const snapshot of input.dataset.marketSnapshots) {
          const collectedMs = requireUtcTimestamp(snapshot.collectedAt, 'collectedAt');
          if (isObservationInWindow(collectedMs, train) && isObservationInWindow(collectedMs, test)) {
            return `Fold ${String(fold.fold.foldId)} has an observation in both TRAIN and TEST.`;
          }
        }
      }
      return null;
    }),
    check('no_outcome_beyond_observation_end', () => {
      for (const fold of input.folds) {
        if (fold.oosSelected === null) {
          continue;
        }
        const test = testWindow(fold.fold);
        for (const trade of fold.oosSelected.completedTrades) {
          const exitMs = requireUtcTimestamp(trade.exitedAt, 'exitedAt');
          if (!isObservationInWindow(exitMs, test)) {
            return `Fold ${String(fold.fold.foldId)} completed an OOS trade after the test observation end.`;
          }
          const entryMs = requireUtcTimestamp(trade.openedAt, 'openedAt');
          if (entryMs < test.startInclusiveMs) {
            return `Fold ${String(fold.fold.foldId)} OOS completed trade inherited a TRAIN entry.`;
          }
        }
        for (const open of fold.oosSelected.unresolvedPositions) {
          const entryMs = requireUtcTimestamp(open.openedAt, 'openedAt');
          if (entryMs < test.startInclusiveMs) {
            return `Fold ${String(fold.fold.foldId)} OOS unresolved position inherited a TRAIN entry.`;
          }
        }
      }
      return null;
    }),
    check('selected_ids_frozen', () => {
      for (const fold of input.folds) {
        if (fold.selectedEntryId !== null && !isEntryId(fold.selectedEntryId)) {
          return `Selected entry ${fold.selectedEntryId} is not in the frozen catalog.`;
        }
        if (fold.selectedExitId !== null && !isExitId(fold.selectedExitId)) {
          return `Selected exit ${fold.selectedExitId} is not in the frozen catalog.`;
        }
        if (fold.oosSelected !== null) {
          if (fold.oosSelected.entryCandidateId !== fold.selectedEntryId) {
            return 'OOS selected result does not use the frozen training-selected entry.';
          }
          if (fold.oosSelected.exitCandidateId !== fold.selectedExitId) {
            return 'OOS selected result does not use the frozen training-selected exit.';
          }
        }
      }
      return null;
    }),
    check('coverage_accounting', () => {
      const results: OptimizationSimulationResult[] = [];
      for (const fold of input.folds) {
        if (fold.oosSelected !== null) {
          results.push(fold.oosSelected);
        }
        if (fold.trainSelected !== null) {
          results.push(fold.trainSelected);
        }
      }
      for (const result of results) {
        const accounted =
          result.coverage.completedTrades +
          result.coverage.unresolvedTrades +
          result.coverage.partiallyCensoredTrades;
        if (accounted !== result.coverage.openedPositions) {
          return 'opened positions do not equal completed + unresolved + partially_realized_censored.';
        }
      }
      return null;
    }),
    check('fold_fingerprint_present', () => {
      for (const fold of input.folds) {
        if (!/^[0-9a-f]{64}$/.test(fold.fold.optimizationFoldFingerprint)) {
          return `Fold ${String(fold.fold.foldId)} fingerprint missing.`;
        }
      }
      return null;
    }),
  ];

  const failed = checks.filter((item) => item.result === 'FAIL');
  return {
    status: failed.length === 0 ? 'PASS' : 'FAIL',
    checks,
  };
}

export function assertWindowDoesNotUseFutureExit(window: SimulationWindow, exitedAt: string): boolean {
  const exitMs = requireUtcTimestamp(exitedAt, 'exitedAt');
  return isObservationInWindow(exitMs, window);
}

function check(id: string, run: () => string | null): RuntimeIntegrityReport['checks'][number] {
  try {
    const detail = run();
    if (detail === null) {
      return { id, result: 'PASS', detail: 'ok' };
    }
    return { id, result: 'FAIL', detail };
  } catch (error: unknown) {
    return {
      id,
      result: 'FAIL',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function isEntryId(value: string): boolean {
  return (OPTIMIZATION_ENTRY_CANDIDATE_IDS as readonly string[]).includes(value);
}

function isExitId(value: string): boolean {
  return (OPTIMIZATION_EXIT_CANDIDATE_IDS as readonly string[]).includes(value);
}
