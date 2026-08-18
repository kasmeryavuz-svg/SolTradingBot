import { MAX_CENSORING_BPS } from './constants.js';

export function censoringBps(censored: number, opened: number): number | null {
  if (opened === 0) {
    return null;
  }
  return Math.floor((censored * 10000) / opened);
}

export function censoringExceedsLimit(bps: number | null): boolean {
  return bps !== null && bps > MAX_CENSORING_BPS;
}

export function formatCensoringBps(bps: number | null): string {
  return bps === null ? 'n/a' : String(bps);
}
