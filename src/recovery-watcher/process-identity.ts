import { performance } from 'node:perf_hooks';

export function currentRecoveryProcessStartedAtMs(): number {
  return Math.trunc(performance.timeOrigin);
}
