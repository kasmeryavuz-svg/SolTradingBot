import type { DatabaseSync } from 'node:sqlite';
import { dirname, resolve } from 'node:path';
import { RW0_SCREENING_WALL_BUDGET_MS, RW0_WATCH_CADENCE_MS } from './constants.js';
import { createRecoveryClock } from './clock.js';
import { emptyCycleMetrics, runRecoveryScreeningPass, runRecoveryWatchPass } from './cycle.js';
import {
  ensureRecoveryRuntimeDirectory,
  initializeRecoveryDatabase,
  openRecoverySqliteFromConfig,
} from './db/database.js';
import { RecoveryWatcherError } from './errors.js';
import {
  activateRecoveryDatasetRuntime,
  requireRecoveryDatasetManifest,
} from './dataset-manifest.js';
import { systemRecoveryProcessLiveness } from './liveness.js';
import { acquireRecoveryLock, releaseRecoveryLock, type AcquiredRecoveryLock } from './lock.js';
import { currentRecoveryProcessStartedAtMs } from './process-identity.js';
import {
  createRecoveryProviderSet,
  type RecoveryProviderSet,
  type RecoveryFetchLike,
} from './providers.js';
import type {
  RecoveryClock,
  RecoveryCycleMetrics,
  RecoveryProcessLiveness,
  RecoveryWatcherConfig,
} from './types.js';

export type RecoveryCycleMutex = {
  run<T>(work: () => Promise<T>): Promise<T>;
};

export type RecoveryRuntimeOptions = {
  config: RecoveryWatcherConfig;
  clock?: RecoveryClock;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  abort?: AbortSignal;
  once?: boolean;
  providers?: RecoveryProviderSet;
  providerFactory?: (
    options: Parameters<typeof createRecoveryProviderSet>[0],
  ) => RecoveryProviderSet;
  fetchImpl?: RecoveryFetchLike;
  liveness?: RecoveryProcessLiveness;
  pid?: number;
  processStartedAtMs?: number;
  mutex?: RecoveryCycleMutex;
  onCycle?: (metrics: RecoveryCycleMetrics) => void;
  monotonicNow?: () => number;
};

export function createRecoveryCycleMutex(): RecoveryCycleMutex {
  let running = false;
  return {
    async run<T>(work: () => Promise<T>): Promise<T> {
      if (running) {
        throw new RecoveryWatcherError(
          'Recovery Watcher cycle is already running. Overlapping cycles are rejected.',
          {
            code: 'overlapping_cycle',
          },
        );
      }
      running = true;
      try {
        return await work();
      } finally {
        running = false;
      }
    },
  };
}

export async function sleepForCadence(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted || ms <= 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(finish, ms);
    const onAbort = () => {
      finish();
    };
    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve();
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function runRecoveryWatcher(
  options: RecoveryRuntimeOptions,
): Promise<RecoveryCycleMetrics | undefined> {
  assertRuntimeLiveGatesClosed(options.config);
  const clock = options.clock ?? createRecoveryClock();
  const now = clock.now();
  const mutex = options.mutex ?? createRecoveryCycleMutex();
  const abort = options.abort ?? new AbortController().signal;
  const sleep = options.sleep ?? sleepForCadence;
  const monotonicNow = options.monotonicNow ?? defaultMonotonicNow;

  ensureRecoveryRuntimeDirectory(options.config);
  const lock = acquireRuntimeLock(options, now);
  let database: DatabaseSync | undefined;
  try {
    database = openRecoverySqliteFromConfig(options.config);
    initializeRecoveryDatabase(database);
    const manifest = requireRecoveryDatasetManifest(database, options.config.databasePath);
    activateRecoveryDatasetRuntime(database, manifest, now);
    const opened: DatabaseSync = database;
    const providers =
      options.providers ??
      (options.providerFactory ?? createRecoveryProviderSet)({
        timeoutMs: options.config.networkTimeoutMs,
        clock,
        ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      });
    let lastMetrics: RecoveryCycleMetrics | undefined;
    let nextDue = monotonicNow();
    while (!abort.aborted) {
      const waitMs = Math.max(0, nextDue - monotonicNow());
      if (waitMs > 0 && options.once !== true) {
        await sleep(waitMs, abort);
        const abortAfterSleep = abort.aborted as boolean;
        if (abortAfterSleep) {
          break;
        }
      }
      const passStarted = monotonicNow();
      nextDue = passStarted + RW0_WATCH_CADENCE_MS;
      lastMetrics = await mutex.run(async () => {
        const metrics = emptyCycleMetrics(clock.now().toISOString());
        await runRecoveryWatchPass(
          {
            database: opened,
            config: options.config,
            clock,
            profileFeed: providers.profileFeed,
            boostFeed: providers.boostFeed,
            screeningMarket: providers.screeningMarket,
            exactPairMarket: providers.exactPairMarket,
            monotonicNow,
          },
          metrics,
        );
        const remaining = Math.max(0, nextDue - monotonicNow());
        const screeningBudget = Math.min(remaining, RW0_SCREENING_WALL_BUDGET_MS);
        if (screeningBudget > 0 && !abort.aborted) {
          await runRecoveryScreeningPass(
            {
              database: opened,
              config: options.config,
              clock,
              profileFeed: providers.profileFeed,
              boostFeed: providers.boostFeed,
              screeningMarket: providers.screeningMarket,
              exactPairMarket: providers.exactPairMarket,
              monotonicNow,
            },
            metrics,
            { wallBudgetMs: screeningBudget },
          );
        } else {
          metrics.screeningBudgetExhausted = true;
        }
        return metrics;
      });
      options.onCycle?.(lastMetrics);
      if (options.once) {
        break;
      }
      const abortRequested = abort.aborted as boolean;
      if (abortRequested) {
        break;
      }
    }
    return lastMetrics;
  } finally {
    if (database !== undefined) {
      database.close();
    }
    releaseRecoveryLock(lock);
  }
}

function defaultMonotonicNow(): number {
  return performance.now();
}

function acquireRuntimeLock(options: RecoveryRuntimeOptions, now: Date): AcquiredRecoveryLock {
  return acquireRecoveryLock({
    directory: dirname(resolve(options.config.databasePath)),
    pid: options.pid ?? process.pid,
    processStartedAtMs: options.processStartedAtMs ?? currentRecoveryProcessStartedAtMs(),
    runtimeStartedAt: now.toISOString(),
    liveness: options.liveness ?? systemRecoveryProcessLiveness(),
  });
}

function assertRuntimeLiveGatesClosed(config: RecoveryWatcherConfig): void {
  if (config.tradingEnabled) {
    throw new RecoveryWatcherError(
      'Refusing Recovery Watcher because TRADING_ENABLED=true. rw0_v1 is paper/data research only and never executes live transactions.',
      { code: 'trading_enabled' },
    );
  }
  if (config.liveBroadcastEnabled) {
    throw new RecoveryWatcherError(
      'Refusing Recovery Watcher because LIVE_BROADCAST_ENABLED=true. rw0_v1 is paper/data research only. Manual CP16 live remains a separate operator command.',
      { code: 'live_broadcast_enabled' },
    );
  }
}
