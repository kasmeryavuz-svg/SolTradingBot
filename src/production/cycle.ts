import { PROD20_SPEC_VERSION } from './constants.js';
import { ProductionError } from './errors.js';
import {
  isFatalProductionFailure,
  toFatalProductionError,
} from './failure.js';
import { sanitizeProductionErrorMessage } from './sanitizer.js';
import type {
  OpenPositionLookup,
  ProductionClock,
  ProductionCycleResult,
  ProductionLogger,
  ProductionMintResult,
  ProductionRuntimeConfig,
} from './types.js';

export type ProductionCycleDependencies = {
  clock: ProductionClock;
  logger: ProductionLogger;
  runCollectorCycle?: () => Promise<void>;
  lookupOpenPosition: OpenPositionLookup['hasOpenPaperPosition'];
  executePositionStep: (tokenMint: string) => Promise<void>;
  executeExitStep: (tokenMint: string) => Promise<void>;
};

export async function runProductionCycle(options: {
  cycleNumber: number;
  config: ProductionRuntimeConfig;
  consecutiveFailedCycles: number;
  dependencies: ProductionCycleDependencies;
}): Promise<ProductionCycleResult> {
  const startedMs = options.dependencies.clock.nowMs();
  let collectorOk: boolean | null = null;
  const mintResults: ProductionMintResult[] = [];
  let failed = false;

  if (options.config.collectorEnabled) {
    const collector = options.dependencies.runCollectorCycle;
    if (collector === undefined) {
      throw new ProductionError('configuration', 'Collector work is enabled but no collector primitive was provided.');
    }
    try {
      await collector();
      collectorOk = true;
      options.dependencies.logger.write({
        timestamp: options.dependencies.clock.nowIso(),
        level: 'info',
        event: 'collector_cycle',
        specVersion: PROD20_SPEC_VERSION,
        cycleNumber: options.cycleNumber,
        component: 'collector',
        result: 'ok',
      });
    } catch (error: unknown) {
      if (isFatalProductionFailure(error)) {
        throw toFatalProductionError(error);
      }
      failed = true;
      collectorOk = false;
      options.dependencies.logger.write({
        timestamp: options.dependencies.clock.nowIso(),
        level: 'error',
        event: 'collector_cycle',
        specVersion: PROD20_SPEC_VERSION,
        cycleNumber: options.cycleNumber,
        component: 'collector',
        result: 'failed',
        message: sanitizeProductionErrorMessage(error),
      });
    }
  }

  if (options.config.paperEnabled) {
    for (const tokenMint of options.config.paperMints) {
      const mintResult = await runMintOperation({
        tokenMint,
        cycleNumber: options.cycleNumber,
        dependencies: options.dependencies,
      });
      mintResults.push(mintResult);
      if (!mintResult.ok) {
        failed = true;
      }
    }
  }

  const durationMs = options.dependencies.clock.nowMs() - startedMs;
  const consecutiveFailedCycles = failed ? options.consecutiveFailedCycles + 1 : 0;
  options.dependencies.logger.write({
    timestamp: options.dependencies.clock.nowIso(),
    level: failed ? 'warn' : 'info',
    event: 'cycle_summary',
    specVersion: PROD20_SPEC_VERSION,
    cycleNumber: options.cycleNumber,
    component: 'supervisor',
    result: failed ? 'failed' : 'ok',
    durationMs,
    consecutiveFailedCycles,
  });

  return {
    cycleNumber: options.cycleNumber,
    ok: !failed,
    collectorOk,
    mintResults,
    durationMs,
    consecutiveFailedCycles,
  };
}

async function runMintOperation(options: {
  tokenMint: string;
  cycleNumber: number;
  dependencies: ProductionCycleDependencies;
}): Promise<ProductionMintResult> {
  let openAtStart: boolean;
  try {
    openAtStart = await options.dependencies.lookupOpenPosition(options.tokenMint);
  } catch (error: unknown) {
    throw toFatalProductionError(error);
  }
  const operation = openAtStart ? 'EXIT' : 'POSITION';
  const startedMs = options.dependencies.clock.nowMs();
  try {
    if (openAtStart) {
      await options.dependencies.executeExitStep(options.tokenMint);
    } else {
      await options.dependencies.executePositionStep(options.tokenMint);
    }
    options.dependencies.logger.write({
      timestamp: options.dependencies.clock.nowIso(),
      level: 'info',
      event: 'mint_operation',
      specVersion: PROD20_SPEC_VERSION,
      cycleNumber: options.cycleNumber,
      component: operation === 'EXIT' ? 'exit' : 'position',
      mint: options.tokenMint,
      result: 'ok',
      durationMs: options.dependencies.clock.nowMs() - startedMs,
    });
    return { tokenMint: options.tokenMint, operation, ok: true };
  } catch (error: unknown) {
    if (isFatalProductionFailure(error)) {
      throw toFatalProductionError(error);
    }
    options.dependencies.logger.write({
      timestamp: options.dependencies.clock.nowIso(),
      level: 'error',
      event: 'mint_operation',
      specVersion: PROD20_SPEC_VERSION,
      cycleNumber: options.cycleNumber,
      component: operation === 'EXIT' ? 'exit' : 'position',
      mint: options.tokenMint,
      result: 'failed',
      durationMs: options.dependencies.clock.nowMs() - startedMs,
      message: sanitizeProductionErrorMessage(error),
    });
    return { tokenMint: options.tokenMint, operation, ok: false };
  }
}
