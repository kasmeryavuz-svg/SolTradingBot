import { loadConfig } from '../config/load-config.js';
import type { CoreAppConfig } from '../config/core-types.js';
import type { AppConfig, EnvSource } from '../config/types.js';
import { assertTradingDisabled } from '../core/safety.js';
import { preparePersistenceCommand } from '../persistence/command.js';
import { executeLoadOptimizationDataset } from './dataset.js';
import { buildChronologicalSegments, buildFoldBoundaries } from './folds.js';
import { evaluateStructuralReadiness } from './readiness.js';
import { listOptimizationEntryDescriptors, listOptimizationExitDescriptors } from './catalog.js';
import { listCostScenarios } from './costs.js';
import { runAnchoredWalkForward, type WalkForwardReport } from './walk-forward.js';
import { OptimizationError } from './types.js';
import type { OptimizationDataset } from './types.js';

export function prepareOptimizationCatalogCommand(source: EnvSource): AppConfig {
  const config = loadConfig(source);
  assertTradingDisabled(config);
  return config;
}

export function prepareOptimizationCommand(source: EnvSource): CoreAppConfig {
  return preparePersistenceCommand(source);
}

export function assertNoExtraOptimizationArguments(argv: readonly string[], command: string): void {
  const extras = argv.slice(2).filter((value) => value.trim() !== '');
  if (extras.length > 0) {
    throw new OptimizationError(
      `Unexpected extra arguments. Usage: npm run ${command}. Optimization commands do not accept date, token, winner, or threshold filters.`,
    );
  }
}

export function executeOptimizationCatalog(): {
  entries: ReturnType<typeof listOptimizationEntryDescriptors>;
  exits: ReturnType<typeof listOptimizationExitDescriptors>;
  costs: ReturnType<typeof listCostScenarios>;
} {
  return {
    entries: listOptimizationEntryDescriptors(),
    exits: listOptimizationExitDescriptors(),
    costs: listCostScenarios(),
  };
}

export function executeOptimizationData(config: CoreAppConfig): {
  dataset: OptimizationDataset;
  segments: ReturnType<typeof buildChronologicalSegments>;
  readiness: ReturnType<typeof evaluateStructuralReadiness>;
} {
  const dataset = executeLoadOptimizationDataset(config);
  const segments = buildChronologicalSegments(dataset);
  const folds = segments === null ? null : buildFoldBoundaries(dataset, segments);
  return {
    dataset,
    segments,
    readiness: evaluateStructuralReadiness({
      dataset,
      segments,
      folds,
      promotionDataSufficient: false,
    }),
  };
}

export function executeOptimizationRun(config: CoreAppConfig): WalkForwardReport {
  const dataset = executeLoadOptimizationDataset(config);
  return runAnchoredWalkForward(dataset);
}

export function executeOptimizationFolds(config: CoreAppConfig): WalkForwardReport {
  return executeOptimizationRun(config);
}
