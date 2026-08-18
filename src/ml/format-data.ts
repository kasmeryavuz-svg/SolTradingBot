import { formatCapabilityFooter } from '../persistence/format.js';
import { mlSegmentsAndFolds, partitionFoldSamples } from './folds.js';
import type { MlDataset } from './types.js';

export function formatMlDataLines(dataset: MlDataset): string[] {
  const { segments, folds } = mlSegmentsAndFolds(dataset);
  const readiness = dataset.walletIntelligenceReadiness;
  const lines = [
    'ML19 DATASET',
    'READ-ONLY / QUERY-ONLY / NO NETWORK / NO TRAINING',
    '',
    `historical snapshots (research universe): ${String(dataset.researchMarketSnapshotCount)}`,
    `raw snapshots before exclusion: ${String(dataset.rawMarketSnapshotCount)}`,
    `decision samples: ${String(dataset.decisionSampleCount)}`,
    `labeled: ${String(dataset.labeledCount)}`,
    `positive: ${String(dataset.positiveCount)}`,
    `non-positive: ${String(dataset.nonPositiveCount)}`,
    `censored: ${String(dataset.censoredCount)}`,
    `firstSnapshotAt: ${dataset.firstSnapshotAt ?? 'n/a'}`,
    `lastSnapshotAt: ${dataset.lastSnapshotAt ?? 'n/a'}`,
    `dataset fingerprint: ${dataset.mlDatasetFingerprint}`,
    `schema: ${String(dataset.schemaVersion)}`,
    'migration 010: ABSENT',
    '',
    'Wallet-intelligence readiness (NOT model inputs)',
    `  scans: ${String(readiness.scanCount)}`,
    `  earliest scan: ${readiness.earliestScanStartedAtMs === null ? 'n/a' : String(readiness.earliestScanStartedAtMs)}`,
    `  latest scan: ${readiness.latestScanStartedAtMs === null ? 'n/a' : String(readiness.latestScanStartedAtMs)}`,
    `  market samples safely point-in-time alignable: ${String(readiness.marketSamplesSafelyPointInTimeAlignable)}`,
    `  usedAsModelInput: ${String(readiness.usedAsModelInput)}`,
    `  reason: ${readiness.reason}`,
    '',
    'Six chronological integer-ms segments (o17)',
  ];
  if (segments === null) {
    lines.push('  not constructible');
  } else {
    for (const segment of segments) {
      lines.push(
        `  ${segment.segmentId}: start=${String(segment.startInclusiveMs)} endInclusive=${String(segment.endInclusiveMs)} snapshots=${String(segment.snapshotCount)}`,
      );
    }
  }
  lines.push('');
  lines.push('Per-fold TRAIN/TEST sample counts');
  if (folds === null) {
    lines.push('  folds not constructible');
  } else {
    for (const fold of folds) {
      const partition = partitionFoldSamples(dataset, fold);
      lines.push(
        `  fold ${String(fold.foldId)} TEST=${fold.testSegmentId} TRAIN decision/labeled/censored=${String(partition.purge.trainDecisionSamples)}/${String(partition.purge.trainSamplesAfterPurge)}/${String(partition.purge.trainCensoredCount)} censoringBps=${partition.purge.trainCensoringBps === null ? 'n/a' : String(partition.purge.trainCensoringBps)} before/purged/after=${String(partition.purge.trainSamplesBeforePurge)}/${String(partition.purge.trainSamplesPurged)}/${String(partition.purge.trainSamplesAfterPurge)} TEST decision/labeled/censored=${String(partition.purge.testDecisionSamples)}/${String(partition.purge.testLabeledCount)}/${String(partition.purge.testCensoredCount)} censoringBps=${partition.purge.testCensoringBps === null ? 'n/a' : String(partition.purge.testCensoringBps)} pos/neg=${String(partition.purge.testPositiveCount)}/${String(partition.purge.testNegativeCount)}`,
      );
    }
  }
  lines.push('');
  lines.push('No training was performed.');
  lines.push('');
  lines.push(...formatCapabilityFooter());
  return lines;
}
