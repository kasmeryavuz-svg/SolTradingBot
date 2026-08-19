import type { CoreAppConfig } from '../config/core-types.js';
import type { EnvSource } from '../config/env-source.js';
import { preparePersistenceCommand } from '../persistence/command.js';
import { isPlausibleSolanaMint } from '../utils/solana-mint.js';
import { runBacktest } from './engine.js';
import { openSqliteBacktestDataSource } from './sqlite-source.js';
import { BacktestError, type BacktestResult, type BacktestScope } from './types.js';

export function prepareBacktestCommand(source: EnvSource): CoreAppConfig {
  return preparePersistenceCommand(source);
}

export function parseBacktestArgv(argv: readonly string[]): BacktestScope {
  const extras = argv.slice(3).filter((value) => value.trim() !== '');
  if (extras.length > 0) {
    throw new BacktestError('Unexpected extra arguments. Usage: npm run backtest:run -- [TOKEN_MINT]');
  }

  const mint = argv[2];
  if (mint === undefined || mint.trim() === '') {
    return { kind: 'all' };
  }

  const trimmed = mint.trim();
  if (!isPlausibleSolanaMint(trimmed)) {
    throw new BacktestError('Invalid token mint. Provide a syntactically plausible Solana mint address.');
  }

  return { kind: 'token', tokenMint: trimmed };
}

export function executeHistoricalBacktest(config: CoreAppConfig, argv: readonly string[]): BacktestResult {
  const scope = parseBacktestArgv(argv);
  const source = openSqliteBacktestDataSource(config.database);
  try {
    source.verifyCompatibleSchema();
    source.verifyIntegrity();
    source.verifyStoredStrategyDefinition();
    const dataset = source.loadDataset(scope.kind === 'token' ? scope.tokenMint : undefined);
    return runBacktest(dataset, { scope });
  } finally {
    source.close();
  }
}
