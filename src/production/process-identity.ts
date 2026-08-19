import { performance } from 'node:perf_hooks';

export function currentProcessStartedAtMs(): number {
  return Math.trunc(performance.timeOrigin);
}
