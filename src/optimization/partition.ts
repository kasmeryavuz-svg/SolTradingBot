import { requireUtcTimestamp } from '../features/numbers.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { CHRONOLOGICAL_SEGMENT_COUNT } from './constants.js';
import { snapshotBelongsToSegment } from './folds-window.js';
import { OptimizationError, type ChronologicalSegment } from './types.js';

const SEGMENT_IDS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] as const;

export function requireIntegerMillisecond(value: number, label: string): number {
  if (!Number.isInteger(value)) {
    throw new OptimizationError(`${label} must be an integer millisecond timestamp.`);
  }
  return value;
}

/**
 * Split [firstMs, lastMs] into six integer-ms duration bins.
 *
 * widths: the first (span % 6) segments receive floor(span/6)+1 ms;
 * the rest receive floor(span/6) ms. Widths sum to span exactly.
 *
 * S1–S5 are [start, next) exclusive. S6 is [start, lastMs] inclusive.
 * Empty bins are allowed (span < 6). Every integer timestamp in the
 * closed range belongs to exactly one bin.
 */
export function chronologicalCutMs(firstMs: number, lastMs: number): readonly number[] {
  const first = requireIntegerMillisecond(firstMs, 'firstSnapshotAt');
  const last = requireIntegerMillisecond(lastMs, 'lastSnapshotAt');
  if (last < first) {
    throw new OptimizationError('lastSnapshotAt must be >= firstSnapshotAt.');
  }
  const span = last - first;
  const quotient = Math.trunc(span / CHRONOLOGICAL_SEGMENT_COUNT);
  const remainder = span % CHRONOLOGICAL_SEGMENT_COUNT;
  const cuts = [first];
  for (let index = 0; index < CHRONOLOGICAL_SEGMENT_COUNT; index += 1) {
    const previous = cuts[index];
    if (previous === undefined) {
      throw new OptimizationError('Failed to construct chronological cuts.');
    }
    const width = quotient + (index < remainder ? 1 : 0);
    cuts.push(previous + width);
  }
  if (cuts[CHRONOLOGICAL_SEGMENT_COUNT] !== last) {
    throw new OptimizationError('Integer chronological cuts must end at lastSnapshotAt.');
  }
  return cuts;
}

export function buildIntegerChronologicalSegments(input: {
  firstSnapshotAt: string;
  lastSnapshotAt: string;
  marketSnapshots: readonly MarketSnapshot[];
}): ChronologicalSegment[] {
  const firstMs = requireIntegerMillisecond(
    requireUtcTimestamp(input.firstSnapshotAt, 'firstSnapshotAt'),
    'firstSnapshotAt',
  );
  const lastMs = requireIntegerMillisecond(
    requireUtcTimestamp(input.lastSnapshotAt, 'lastSnapshotAt'),
    'lastSnapshotAt',
  );
  const cuts = chronologicalCutMs(firstMs, lastMs);
  const segments: ChronologicalSegment[] = [];
  for (let index = 1; index <= CHRONOLOGICAL_SEGMENT_COUNT; index += 1) {
    const startInclusiveMs = cuts[index - 1];
    const nextCut = cuts[index];
    if (startInclusiveMs === undefined || nextCut === undefined) {
      throw new OptimizationError('Failed to derive integer segment boundaries.');
    }
    const endExclusiveMs = index === CHRONOLOGICAL_SEGMENT_COUNT ? null : nextCut;
    const endInclusiveMs = index === CHRONOLOGICAL_SEGMENT_COUNT ? lastMs : nextCut - 1;
    const members = input.marketSnapshots.filter((snapshot) =>
      snapshotBelongsToSegment(requireUtcTimestamp(snapshot.collectedAt, 'collectedAt'), {
        startInclusiveMs,
        endExclusiveMs,
        lastMs,
      }),
    );
    const segmentId = SEGMENT_IDS[index - 1];
    if (segmentId === undefined) {
      throw new OptimizationError('Invalid segment id.');
    }
    segments.push({
      segmentId,
      index: index as 1 | 2 | 3 | 4 | 5 | 6,
      startInclusiveMs,
      endExclusiveMs,
      endInclusiveMs,
      snapshotCount: members.length,
      uniqueTokenCount: new Set(members.map((item) => item.tokenMint)).size,
    });
  }
  assertExactSegmentPartition(input.marketSnapshots, segments, lastMs);
  return segments;
}

export function assertExactSegmentPartition(
  snapshots: readonly MarketSnapshot[],
  segments: readonly ChronologicalSegment[],
  lastMs: number,
): void {
  if (segments.length !== CHRONOLOGICAL_SEGMENT_COUNT) {
    throw new OptimizationError('Partition requires exactly six chronological segments.');
  }
  const assigned = new Map<string, string>();
  for (const snapshot of snapshots) {
    const collectedMs = requireUtcTimestamp(snapshot.collectedAt, 'collectedAt');
    const owners = segments.filter((segment) =>
      snapshotBelongsToSegment(collectedMs, {
        startInclusiveMs: segment.startInclusiveMs,
        endExclusiveMs: segment.endExclusiveMs,
        lastMs,
      }),
    );
    if (owners.length !== 1) {
      throw new OptimizationError(
        `Snapshot at ${snapshot.collectedAt} belongs to ${String(owners.length)} segments; expected exactly 1.`,
      );
    }
    const owner = owners[0];
    if (owner === undefined) {
      throw new OptimizationError('Partition owner missing.');
    }
    assigned.set(`${snapshot.tokenMint}\0${snapshot.pairAddress}\0${snapshot.collectedAt}`, owner.segmentId);
  }
  const counted = segments.reduce((sum, segment) => sum + segment.snapshotCount, 0);
  if (counted !== snapshots.length || assigned.size !== snapshots.length) {
    throw new OptimizationError('Union of S1..S6 must equal the included research snapshot set.');
  }
}
