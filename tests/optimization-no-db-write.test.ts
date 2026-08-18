import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openReadOnlyResearchDatabase } from '../src/research/sqlite-source.js';
import { createSqlitePersistenceRepository, SqlitePersistenceRepository } from '../src/persistence/index.js';
import { executeLoadOptimizationDataset } from '../src/optimization/dataset.js';
import { prepareOptimizationCommand } from '../src/optimization/command.js';
import { readdirSync } from 'node:fs';

const tempDirs: string[] = [];
const openRepos: SqlitePersistenceRepository[] = [];

afterEach(() => {
  while (openRepos.length > 0) {
    openRepos.pop()?.close();
  }
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory !== undefined) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

function tempDbPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'mtb-o17-'));
  tempDirs.push(directory);
  return join(directory, 'history.sqlite');
}

describe('optimization does not write the production database', () => {
  it('does not contain write SQL or persistence record helpers in src/optimization', () => {
    const files = readdirSync(join(process.cwd(), 'src/optimization'), { recursive: true })
      .filter((name): name is string => typeof name === 'string' && name.endsWith('.ts'))
      .map((name) => readFileSync(join(process.cwd(), 'src/optimization', name), 'utf8'))
      .join('\n');
    expect(files).not.toMatch(/INSERT INTO|UPDATE tokens|DELETE FROM|CREATE TABLE|DROP TABLE|ALTER TABLE/);
    expect(files).not.toMatch(/recordMarketSnapshot|recordRiskReport|recordStrategy|recordPaper|recordExit/);
    expect(files).not.toMatch(/CREATE TABLE optimization_|CREATE TABLE hyperopt_|CREATE TABLE strategy_winners/);
  });

  it('opens query-only and refuses INSERT/UPDATE/DELETE', () => {
    const path = tempDbPath();
    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    repository.initialize();
    openRepos.push(repository);
    repository.close();
    openRepos.pop();
    const config = prepareOptimizationCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path });
    const dataset = executeLoadOptimizationDataset(config);
    expect(dataset.schemaVersion).toBe(9);
    expect(dataset.migration009Present).toBe(true);
    const database = openReadOnlyResearchDatabase({ path, busyTimeoutMs: 1000 });
    expect(String(Object.values(database.prepare('PRAGMA query_only').get() ?? {})[0] ?? '')).toBe('1');
    expect(() => {
      database.exec(
        "INSERT INTO tokens (chain, mint, first_observed_at, last_observed_at, created_at) VALUES ('solana', 'x', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
      );
    }).toThrow();
    expect(() => {
      database.exec('UPDATE tokens SET mint = mint');
    }).toThrow();
    expect(() => {
      database.exec('DELETE FROM tokens');
    }).toThrow();
    database.close();
  });
});
