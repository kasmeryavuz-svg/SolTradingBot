import { loadConfig } from '../config/load-config.js';
import type { AppConfig, EnvSource } from '../config/types.js';
import { assertTradingDisabled } from '../core/safety.js';
import { preparePersistenceCommand } from '../persistence/command.js';
import { listResearchCandidateDescriptors, requireResearchCandidateId } from './catalog.js';
import { buildResearchCandidateReport, buildResearchCompareReport } from './report.js';
import { openSqliteResearchDataSource } from './sqlite-source.js';
import {
  ResearchError,
  type ResearchCandidateDescriptor,
  type ResearchCandidateId,
  type ResearchCandidateReport,
  type ResearchCompareReport,
} from './types.js';

export function prepareResearchCatalogCommand(source: EnvSource): AppConfig {
  const config = loadConfig(source);
  assertTradingDisabled(config);
  return config;
}

export function prepareResearchCommand(source: EnvSource): AppConfig {
  return preparePersistenceCommand(source);
}

export function assertNoExtraResearchArguments(argv: readonly string[], command: string): void {
  const extras = argv.slice(2).filter((value) => value.trim() !== '');
  if (extras.length > 0) {
    throw new ResearchError(
      `Unexpected extra arguments. Usage: npm run ${command}. Research commands do not accept date, token, winner, or threshold filters.`,
    );
  }
}

export function parseResearchTradesArgv(argv: readonly string[]): { candidateId: ResearchCandidateId } {
  const args = argv.slice(2).filter((value) => value.trim() !== '');
  if (args.length === 0) {
    throw new ResearchError(
      'Missing candidate id. Usage: npm run research:trades -- <candidateId>',
    );
  }
  if (args.length > 1) {
    throw new ResearchError(
      'Unexpected extra arguments. Usage: npm run research:trades -- <candidateId>',
    );
  }
  const raw = args[0];
  if (raw === undefined) {
    throw new ResearchError(
      'Missing candidate id. Usage: npm run research:trades -- <candidateId>',
    );
  }
  return { candidateId: requireResearchCandidateId(raw) };
}

export function executeResearchCatalog(): ResearchCandidateDescriptor[] {
  return listResearchCandidateDescriptors();
}

export type ResearchIntegrityMode = 'verify' | 'skip';

export function executeResearchCompare(
  config: AppConfig,
  options: { integrity?: ResearchIntegrityMode } = {},
): ResearchCompareReport {
  const source = openSqliteResearchDataSource(config.database);
  try {
    return source.withReadSnapshot(() => {
      source.verifyCompatibleSchema();
      if ((options.integrity ?? 'verify') === 'verify') {
        source.verifyIntegrity();
      }
      const dataset = source.loadResearchDataset();
      return buildResearchCompareReport(dataset);
    });
  } finally {
    source.close();
  }
}

export function executeResearchTrades(
  config: AppConfig,
  candidateId: ResearchCandidateId,
): ResearchCandidateReport {
  const source = openSqliteResearchDataSource(config.database);
  try {
    return source.withReadSnapshot(() => {
      source.verifyCompatibleSchema();
      source.verifyIntegrity();
      const dataset = source.loadResearchDataset();
      return buildResearchCandidateReport(dataset, candidateId);
    });
  } finally {
    source.close();
  }
}
