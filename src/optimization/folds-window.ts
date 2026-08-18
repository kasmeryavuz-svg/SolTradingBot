import type { SimulationWindow } from './types.js';

export function snapshotBelongsToSegment(
  collectedAtMs: number,
  segment: {
    startInclusiveMs: number;
    endExclusiveMs: number | null;
    lastMs: number;
  },
): boolean {
  if (collectedAtMs < segment.startInclusiveMs) {
    return false;
  }
  if (segment.endExclusiveMs === null) {
    return collectedAtMs <= segment.lastMs;
  }
  return collectedAtMs < segment.endExclusiveMs;
}

export function isObservationInWindow(collectedAtMs: number, window: SimulationWindow): boolean {
  if (collectedAtMs < window.startInclusiveMs) {
    return false;
  }
  if (window.observationEndExclusiveMs === null) {
    return collectedAtMs <= window.observationEndInclusiveMs;
  }
  return collectedAtMs < window.observationEndExclusiveMs;
}

export function isEntryEligible(collectedAtMs: number, window: SimulationWindow): boolean {
  if (!isObservationInWindow(collectedAtMs, window)) {
    return false;
  }
  return collectedAtMs <= window.latestEntryInclusiveMs;
}
