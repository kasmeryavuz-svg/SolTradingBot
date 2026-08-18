import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSqlitePersistenceRepository, SqlitePersistenceRepository } from '../src/persistence/index.js';
import { executeMlData, prepareMlCommand } from '../src/ml/command.js';
import { executeMlCandidate, executeMlFolds, executeMlRun } from '../src/ml/pipeline.js';
import { openReadOnlyResearchDatabase } from '../src/research/sqlite-source.js';
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
  const directory = mkdtempSync(join(tmpdir(), 'mtb-ml19-'));
  tempDirs.push(directory);
  return join(directory, 'history.sqlite');
}

describe('ml does not write the production database', () => {
  it('contains no write SQL in src/ml', () => {
    const files = readdirSync(join(process.cwd(), 'src/ml'), { recursive: true })
      .filter((name): name is string => typeof name === 'string' && name.endsWith('.ts'))
      .map((name) => readFileSync(join(process.cwd(), 'src/ml', name), 'utf8'))
      .join('\n');
    expect(files).not.toMatch(/INSERT INTO|UPDATE tokens|DELETE FROM|CREATE TABLE|DROP TABLE|ALTER TABLE/);
    expect(files).not.toMatch(/recordMarketSnapshot|recordRiskReport|persistWalletIntelligenceScan/);
  });

  it('keeps the sqlite file hash identical across ml:data/run/folds/candidate', () => {
    const path = tempDbPath();
    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    repository.initialize();
    openRepos.push(repository);
    repository.close();
    openRepos.pop();
    const before = createHash('sha256').update(readFileSync(path)).digest('hex');
    const config = prepareMlCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path });
    executeMlData(config);
    executeMlRun(config);
    executeMlFolds(config);
    const candidate = executeMlCandidate(config);
    expect(candidate.candidateTrainingInvoked).toBe(false);
    const after = createHash('sha256').update(readFileSync(path)).digest('hex');
    expect(after).toBe(before);
    const database = openReadOnlyResearchDatabase({ path, busyTimeoutMs: 1000 });
    expect(String(Object.values(database.prepare('PRAGMA query_only').get() ?? {})[0] ?? '')).toBe('1');
    expect(() => {
      database.exec('UPDATE tokens SET mint = mint');
    }).toThrow();
    database.close();
  });
});
