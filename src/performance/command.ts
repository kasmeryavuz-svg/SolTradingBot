import type { AppConfig, EnvSource } from '../config/types.js';
import { preparePersistenceCommand } from '../persistence/command.js';
import { normalizeCompletedPaperTrade } from './invariants.js';
import { buildPerformanceReport } from './report.js';
import { openSqlitePerformanceDataSource } from './sqlite-source.js';
import { PerformanceError, type PerformanceReport } from './types.js';

export function preparePerformanceCommand(source: EnvSource): AppConfig {
  return preparePersistenceCommand(source);
}

export function assertNoExtraPerformanceArguments(argv: readonly string[], command: string): void {
  const extras = argv.slice(2).filter((value) => value.trim() !== '');
  if (extras.length > 0) {
    throw new PerformanceError(`Unexpected extra arguments. Usage: npm run ${command}`);
  }
}

export function executePerformanceReport(config: AppConfig): PerformanceReport {
  return loadValidatedPerformanceReport(config);
}

export function executePerformanceTrades(config: AppConfig): PerformanceReport {
  return loadValidatedPerformanceReport(config);
}

function loadValidatedPerformanceReport(config: AppConfig): PerformanceReport {
  const source = openSqlitePerformanceDataSource(config.database);
  try {
    return source.withReadSnapshot(() => {
      source.verifyCompatibleSchema();
      source.verifyIntegrity();
      const evidence = source.loadCompletedTradeEvidence();
      const trades = evidence.map((item) => normalizeCompletedPaperTrade(item));
      return buildPerformanceReport(trades);
    });
  } finally {
    source.close();
  }
}
