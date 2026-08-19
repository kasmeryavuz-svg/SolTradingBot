import type { CoreAppConfig } from '../config/core-types.js';
import type { EnvSource } from '../config/env-source.js';
import { preparePersistenceCommand } from '../persistence/command.js';
import { normalizeCompletedPaperTrade } from './invariants.js';
import { buildPerformanceReport } from './report.js';
import { openSqlitePerformanceDataSource } from './sqlite-source.js';
import { PerformanceError, type PerformanceReport } from './types.js';

export function preparePerformanceCommand(source: EnvSource): CoreAppConfig {
  return preparePersistenceCommand(source);
}

export function assertNoExtraPerformanceArguments(argv: readonly string[], command: string): void {
  const extras = argv.slice(2).filter((value) => value.trim() !== '');
  if (extras.length > 0) {
    throw new PerformanceError(`Unexpected extra arguments. Usage: npm run ${command}`);
  }
}

export type PerformanceIntegrityMode = 'verify' | 'skip';

export function executePerformanceReport(
  config: CoreAppConfig,
  options: { integrity?: PerformanceIntegrityMode } = {},
): PerformanceReport {
  return loadValidatedPerformanceReport(config, options.integrity ?? 'verify');
}

export function executePerformanceTrades(config: CoreAppConfig): PerformanceReport {
  return loadValidatedPerformanceReport(config, 'verify');
}

function loadValidatedPerformanceReport(
  config: CoreAppConfig,
  integrity: PerformanceIntegrityMode,
): PerformanceReport {
  const source = openSqlitePerformanceDataSource(config.database);
  try {
    return source.withReadSnapshot(() => {
      source.verifyCompatibleSchema();
      if (integrity === 'verify') {
        source.verifyIntegrity();
      }
      const evidence = source.loadCompletedTradeEvidence();
      const trades = evidence.map((item) => normalizeCompletedPaperTrade(item));
      return buildPerformanceReport(trades);
    });
  } finally {
    source.close();
  }
}
