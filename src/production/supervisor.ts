import { dirname, resolve } from 'node:path';
import type { EnvSource } from '../config/env-source.js';
import {
  createExitStepRunner,
  createOpenPositionLookup,
  createPositionStepRunner,
  createProductionCollectorRunner,
} from './adapters.js';
import { systemProductionClock } from './clock.js';
import { loadProductionConfig } from './config.js';
import {
  DEFAULT_PROD20_HEALTH_PORT,
  PROD20_HEALTH_HOST,
  PROD20_MAX_CONSECUTIVE_FAILED_CYCLES,
  PROD20_SPEC_VERSION,
} from './constants.js';
import { runProductionCycle } from './cycle.js';
import { ProductionError } from './errors.js';
import { isFatalProductionFailure, toFatalProductionError } from './failure.js';
import { isProductionReady, ProductionHealthServer } from './health.js';
import { assertProductionDefinitionFingerprint, PROD20_DEFINITION_FINGERPRINT } from './identity.js';
import { systemProcessLiveness } from './liveness.js';
import { assertProductionLiveGatesClosed } from './live-gates.js';
import { acquireProductionLock, releaseProductionLock, type AcquiredProductionLock } from './lock.js';
import { createStdoutProductionLogger } from './logger.js';
import { currentProcessStartedAtMs } from './process-identity.js';
import { runProductionPreflight } from './preflight.js';
import { sanitizeProductionErrorMessage } from './sanitizer.js';
import type {
  ProductionClock,
  ProductionHealthRuntime,
  ProductionHealthSnapshot,
  ProductionLogger,
  ProcessLiveness,
} from './types.js';

export type ProductionSupervisorControl = {
  requestShutdown: () => void;
  snapshot: () => ProductionHealthSnapshot;
};

export type ProductionSupervisorDependencies = {
  clock?: ProductionClock;
  liveness?: ProcessLiveness;
  logger?: ProductionLogger;
  pid?: number;
  processStartedAtMs?: number;
  lockDirectory?: string;
  runCollectorCycle?: () => Promise<void>;
  lookupOpenPosition?: (tokenMint: string) => boolean | Promise<boolean>;
  executePositionStep?: (tokenMint: string) => Promise<void>;
  executeExitStep?: (tokenMint: string) => Promise<void>;
  createHealthServer?: (state: { snapshot: () => ProductionHealthSnapshot }, port: number) => ProductionHealthRuntime;
  stopAfterCycles?: number;
  skipPreflight?: boolean;
  skipLock?: boolean;
  skipHealth?: boolean;
  installSignals?: boolean;
  onStarted?: (control: ProductionSupervisorControl) => void;
};

export async function runProductionSupervisor(
  source: EnvSource,
  dependencies: ProductionSupervisorDependencies = {},
): Promise<number> {
  assertProductionLiveGatesClosed(source);
  assertProductionDefinitionFingerprint();
  const config = loadProductionConfig(source, { requireEnabled: true, requireWork: true });
  if (config.collectorEnabled && !config.discoveryEnabled) {
    throw new ProductionError(
      'configuration',
      'PROD20_COLLECTOR_ENABLED=true requires DISCOVERY_ENABLED=true.',
    );
  }
  if (!config.databaseEnabled) {
    throw new ProductionError(
      'configuration',
      'prod:run requires DATABASE_ENABLED=true.',
    );
  }

  const clock = dependencies.clock ?? systemProductionClock();
  const logger = dependencies.logger ?? createStdoutProductionLogger();
  const liveness = dependencies.liveness ?? systemProcessLiveness();
  const lockDirectory = dependencies.lockDirectory ?? dirname(resolve(config.databasePath));
  const runtimeStartedAt = clock.nowIso();
  const startedMs = clock.nowMs();
  const pid = dependencies.pid ?? process.pid;
  const processStartedAtMs = dependencies.processStartedAtMs ?? currentProcessStartedAtMs();
  const shutdown = new AbortController();
  let shuttingDown = false;
  let exitCode = 0;
  let lockHeld = false;
  let lockWasAcquired = false;
  let startupPassed = false;
  let completedSuccessfulCycle = false;
  let consecutiveFailedCycles = 0;
  let acquired: AcquiredProductionLock | null = null;
  let health: ProductionHealthRuntime | null = null;
  const snapshot = (): ProductionHealthSnapshot => {
    const current: ProductionHealthSnapshot = {
      alive: true,
      ready: false,
      shuttingDown,
      consecutiveFailedCycles,
      completedSuccessfulCycle,
      startupPassed,
      lockHeld,
      uptimeMs: clock.nowMs() - startedMs,
      specVersion: PROD20_SPEC_VERSION,
      specFingerprint: PROD20_DEFINITION_FINGERPRINT,
    };
    return { ...current, ready: isProductionReady(current) };
  };

  const requestShutdown = (): void => {
    shuttingDown = true;
    if (!shutdown.signal.aborted) {
      shutdown.abort();
    }
  };

  const requestFatalShutdown = (error?: unknown): void => {
    exitCode = 1;
    if (error !== undefined) {
      logger.write({
        timestamp: clock.nowIso(),
        level: 'error',
        event: 'fatal_shutdown',
        specVersion: PROD20_SPEC_VERSION,
        component: 'supervisor',
        result: 'failed',
        message: sanitizeProductionErrorMessage(error),
      });
    }
    requestShutdown();
  };

  const onSignal = (): void => {
    requestShutdown();
  };

  if (dependencies.installSignals !== false) {
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  }

  try {
    if (dependencies.skipPreflight !== true) {
      runProductionPreflight(source, {
        liveness,
        pid,
        processStartedAtMs,
      });
    }

    if (dependencies.skipLock !== true) {
      acquired = acquireProductionLock({
        directory: lockDirectory,
        pid,
        processStartedAtMs,
        runtimeStartedAt,
        liveness,
      });
      lockHeld = true;
      lockWasAcquired = true;
    } else {
      lockHeld = true;
    }

    const healthState = { snapshot };
    if (dependencies.skipHealth !== true) {
      health =
        dependencies.createHealthServer === undefined
          ? new ProductionHealthServer({ port: config.healthPort, state: healthState })
          : dependencies.createHealthServer(healthState, config.healthPort);
      health.setRuntimeErrorHandler?.((error) => {
        requestFatalShutdown(
          new ProductionError(
            'health_server',
            'Production health server failed after listen. Refusing to continue without a health endpoint.',
            { cause: error },
          ),
        );
      });
      try {
        await health.listen();
      } catch (error: unknown) {
        throw new ProductionError(
          'health_bind',
          'Production health server could not bind 127.0.0.1. Refusing to start cycles without a health endpoint.',
          { cause: error },
        );
      }
    }
    startupPassed = true;
    dependencies.onStarted?.({ requestShutdown, snapshot });

    let cycleNumber = 0;
    while (!shutdown.signal.aborted) {
      cycleNumber += 1;
      try {
        const result = await runProductionCycle({
          cycleNumber,
          config,
          consecutiveFailedCycles,
          dependencies: {
            clock,
            logger,
            lookupOpenPosition:
              dependencies.lookupOpenPosition ?? createOpenPositionLookup(source),
            executePositionStep:
              dependencies.executePositionStep ?? createPositionStepRunner(source),
            executeExitStep: dependencies.executeExitStep ?? createExitStepRunner(source),
            ...(config.collectorEnabled
              ? {
                  runCollectorCycle:
                    dependencies.runCollectorCycle ?? createProductionCollectorRunner(source),
                }
              : {}),
          },
        });
        consecutiveFailedCycles = result.consecutiveFailedCycles;
        completedSuccessfulCycle = result.ok ? true : false;
        if (!result.ok && consecutiveFailedCycles >= PROD20_MAX_CONSECUTIVE_FAILED_CYCLES) {
          logger.write({
            timestamp: clock.nowIso(),
            level: 'error',
            event: 'circuit_open',
            specVersion: PROD20_SPEC_VERSION,
            cycleNumber,
            component: 'supervisor',
            result: 'failed',
            consecutiveFailedCycles,
          });
          requestFatalShutdown();
          await cleanup();
          return 1;
        }
      } catch (error: unknown) {
        if (isFatalProductionFailure(error) || error instanceof ProductionError) {
          requestFatalShutdown(toFatalProductionError(error));
          await cleanup();
          return 1;
        }
        throw error;
      }
      if (dependencies.stopAfterCycles !== undefined && cycleNumber >= dependencies.stopAfterCycles) {
        requestShutdown();
        break;
      }
      await clock.sleep(config.intervalMs, shutdown.signal);
    }

    await cleanup();
    return exitCode;
  } catch (error: unknown) {
    await cleanup();
    if (
      lockWasAcquired ||
      (error instanceof ProductionError && (error.code === 'health_bind' || error.code === 'health_server'))
    ) {
      return 1;
    }
    throw error;
  } finally {
    if (dependencies.installSignals !== false) {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    }
  }

  async function cleanup(): Promise<void> {
    shuttingDown = true;
    lockHeld = false;
    if (health !== null) {
      const current = health;
      health = null;
      try {
        await current.close();
      } catch {
        // close is idempotent; a second cleanup must not escape
      }
    }
    if (acquired !== null) {
      const current = acquired;
      acquired = null;
      try {
        releaseProductionLock(current);
      } catch {
        // release is ownership-safe; a second cleanup must not escape
      }
    }
  }
}

export function productionBindHost(): string {
  return PROD20_HEALTH_HOST;
}

export function productionDefaultHealthPort(): number {
  return DEFAULT_PROD20_HEALTH_PORT;
}
