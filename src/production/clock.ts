import type { ProductionClock } from './types.js';

export function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      resolve();
    }, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export function systemProductionClock(): ProductionClock {
  return {
    nowMs: () => Date.now(),
    nowIso: () => new Date().toISOString(),
    sleep: sleepWithSignal,
  };
}
