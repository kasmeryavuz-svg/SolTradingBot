import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { OTHER_PAIR } from './feature-fixtures.js';
import { nextRepresentableNumber } from './paper-fixtures.js';
import {
  executePerformanceReport,
  executePerformanceTrades,
  formatPerformanceTradeLines,
  openSqlitePerformanceDataSource,
  preparePerformanceCommand,
} from '../src/performance/index.js';
import { PerformanceError } from '../src/performance/types.js';
import { requireUtcMillis } from '../src/performance/numbers.js';
import {
  createSqlitePersistenceRepository,
  SqlitePersistenceRepository,
} from '../src/persistence/index.js';
import {
  applyMigrations,
  openSqliteDatabase,
} from '../src/persistence/sqlite/index.js';
import { positionBundleAt } from './exit-fixtures.js';
import {
  BONK_MINT,
  seedClosedPaperTrade,
  T_10_00,
  USDC_MINT,
  WRAPPED_SOL_MINT,
  addMs,
} from './performance-fixtures.js';

const tempDirs: string[] = [];
const openRepos: SqlitePersistenceRepository[] = [];
const openSources: Array<{ close(): void }> = [];

afterEach(() => {
  while (openSources.length > 0) {
    openSources.pop()?.close();
  }
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
  const directory = mkdtempSync(join(tmpdir(), 'mtb-perf-hostile-'));
  tempDirs.push(directory);
  return join(directory, 'history.sqlite');
}

function openWriteRepo(path: string): SqlitePersistenceRepository {
  const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
  repository.initialize();
  openRepos.push(repository);
  return repository;
}

function mutate(path: string, sql: string, params: readonly (string | number)[] = []): void {
  const database = new DatabaseSync(path);
  database.prepare(sql).run(...params);
  database.close();
}

describe('hostile completed-trade loading', () => {
  it('fails the whole report on a mixed winner/loser/corrupt dataset instead of dropping the bad row', () => {
    const path = tempDbPath();
    const repository = openWriteRepo(path);
    seedClosedPaperTrade(repository, {
      tokenMint: WRAPPED_SOL_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 60_000),
      entryPriceUsd: 100,
      exitPriceUsd: 120,
    });
    seedClosedPaperTrade(repository, {
      tokenMint: USDC_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 120_000),
      entryPriceUsd: 100,
      exitPriceUsd: 90,
    });
    seedClosedPaperTrade(repository, {
      tokenMint: BONK_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 180_000),
      entryPriceUsd: 100,
      exitPriceUsd: 80,
    });
    repository.close();
    openRepos.pop();

    mutate(
      path,
      "UPDATE paper_position_exits SET exit_definition_fingerprint = ? WHERE token_id = (SELECT id FROM tokens WHERE mint = ?)",
      ['0'.repeat(64), BONK_MINT],
    );

    const config = preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path });
    expect(() => executePerformanceReport(config)).toThrow(PerformanceError);
  });

  it('fails when a winner is corrupt instead of returning the remaining loser-only sample', () => {
    const path = tempDbPath();
    const repository = openWriteRepo(path);
    seedClosedPaperTrade(repository, {
      tokenMint: WRAPPED_SOL_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 60_000),
      entryPriceUsd: 100,
      exitPriceUsd: 200,
    });
    seedClosedPaperTrade(repository, {
      tokenMint: USDC_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 120_000),
      entryPriceUsd: 100,
      exitPriceUsd: 50,
    });
    repository.close();
    openRepos.pop();
    mutate(
      path,
      "UPDATE paper_positions SET position_definition_fingerprint = ? WHERE token_id = (SELECT id FROM tokens WHERE mint = ?)",
      ['0'.repeat(64), WRAPPED_SOL_MINT],
    );
    const config = preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path });
    expect(() => executePerformanceReport(config)).toThrow(PerformanceError);
  });

  it('does not silently filter incompatible completed evidence in SQL', () => {
    const source = readFileSync(
      new URL('../src/performance/sqlite-source.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain('FROM paper_position_exits');
    expect(source).toContain('LEFT JOIN');
    expect(source).not.toMatch(/INNER JOIN/);
    expect(source).not.toMatch(/WHERE\s+exit_spec_version/);
    expect(source).not.toMatch(/WHERE\s+strategy_version/);
    expect(source).not.toMatch(/WHERE\s+fingerprint/);
    expect(source).not.toMatch(/WHERE\s+exit_action/);
    expect(source).not.toMatch(/BEGIN IMMEDIATE/);
  });
});

describe('source identities bind stored facts', () => {
  function seedOne(path: string): void {
    const repository = openWriteRepo(path);
    seedClosedPaperTrade(repository, {
      tokenMint: WRAPPED_SOL_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 60_000),
      entryPriceUsd: 100,
      exitPriceUsd: 120,
    });
    repository.close();
    openRepos.pop();
  }

  it('fails after mutating entry price while leaving source identities unchanged', () => {
    const path = tempDbPath();
    seedOne(path);
    mutate(path, 'UPDATE paper_positions SET entry_price_usd = 50');
    expect(() =>
      executePerformanceReport(
        preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path }),
      ),
    ).toThrow(PerformanceError);
  });

  it('fails after mutating quantity while leaving source identities unchanged', () => {
    const path = tempDbPath();
    seedOne(path);
    mutate(path, 'UPDATE paper_positions SET quantity_tokens = 3');
    mutate(path, 'UPDATE paper_position_exits SET quantity_tokens = 3');
    mutate(path, 'UPDATE exit_evaluations SET closed_quantity_tokens = 3');
    mutate(path, 'UPDATE position_evaluations SET quantity_tokens = 3');
    expect(() =>
      executePerformanceReport(
        preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path }),
      ),
    ).toThrow(/frozen pm10_v1 quantity/);
  });

  it('fails after mutating exit price while leaving source identities unchanged', () => {
    const path = tempDbPath();
    seedOne(path);
    mutate(path, 'UPDATE paper_position_exits SET exit_price_usd = 150');
    expect(() =>
      executePerformanceReport(
        preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path }),
      ),
    ).toThrow(PerformanceError);
  });

  it('fails after mutating exited_at while leaving source identities unchanged', () => {
    const path = tempDbPath();
    seedOne(path);
    mutate(path, 'UPDATE paper_position_exits SET exited_at = ?', [addMs(T_10_00, 90_000)]);
    expect(() =>
      executePerformanceReport(
        preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path }),
      ),
    ).toThrow(PerformanceError);
  });

  it('fails after mutating pair address while leaving source identities unchanged', () => {
    const path = tempDbPath();
    seedOne(path);
    mutate(path, 'UPDATE paper_positions SET pair_address = ?', [OTHER_PAIR]);
    expect(() =>
      executePerformanceReport(
        preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path }),
      ),
    ).toThrow(PerformanceError);
  });
});

describe('pm10 stored quantity formula', () => {
  it('rejects entry 50 with stored quantity 3 even when the exit quantity also says 3', () => {
    const path = tempDbPath();
    const repository = openWriteRepo(path);
    seedClosedPaperTrade(repository, {
      tokenMint: BONK_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 60_000),
      entryPriceUsd: 50,
      exitPriceUsd: 100,
    });
    repository.close();
    openRepos.pop();
    mutate(path, 'UPDATE paper_positions SET quantity_tokens = 3');
    mutate(path, 'UPDATE paper_position_exits SET quantity_tokens = 3');
    mutate(path, 'UPDATE exit_evaluations SET closed_quantity_tokens = 3');
    mutate(path, 'UPDATE position_evaluations SET quantity_tokens = 3');
    expect(() =>
      executePerformanceReport(
        preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path }),
      ),
    ).toThrow(/frozen pm10_v1 quantity/);
  });

  it('rejects a one-ULP stored quantity difference from 100 / entryPriceUsd', () => {
    const path = tempDbPath();
    const repository = openWriteRepo(path);
    seedClosedPaperTrade(repository, {
      tokenMint: BONK_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 60_000),
      entryPriceUsd: 50,
      exitPriceUsd: 100,
    });
    repository.close();
    openRepos.pop();
    const ulp = nextRepresentableNumber(2);
    mutate(path, 'UPDATE paper_positions SET quantity_tokens = ?', [ulp]);
    mutate(path, 'UPDATE paper_position_exits SET quantity_tokens = ?', [ulp]);
    mutate(path, 'UPDATE exit_evaluations SET closed_quantity_tokens = ?', [ulp]);
    mutate(path, 'UPDATE position_evaluations SET quantity_tokens = ?', [ulp]);
    expect(() =>
      executePerformanceReport(
        preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path }),
      ),
    ).toThrow(/frozen pm10_v1 quantity/);
  });
});

describe('current-open contradiction', () => {
  it('keeps a closed trade valid when a later same-token position is current-open', () => {
    const path = tempDbPath();
    const repository = openWriteRepo(path);
    seedClosedPaperTrade(repository, {
      tokenMint: WRAPPED_SOL_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 60_000),
      entryPriceUsd: 100,
      exitPriceUsd: 120,
    });
    repository.recordPositionBundle(
      positionBundleAt(addMs(T_10_00, 300_000), {
        tokenMint: WRAPPED_SOL_MINT,
        priceUsd: 100,
      }),
    );
    expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)).not.toBeNull();
    repository.close();
    openRepos.pop();

    const report = executePerformanceReport(
      preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path }),
    );
    expect(report.dataset.closedTradeCount).toBe(1);
    expect(report.trades[0]?.tokenMint).toBe(WRAPPED_SOL_MINT);
    expect(report.trades[0]?.grossPnlUsd).toBe(20);
  });

  it('fails when paper_open_positions points at the closed position with a mismatched token', () => {
    const path = tempDbPath();
    const repository = openWriteRepo(path);
    seedClosedPaperTrade(repository, {
      tokenMint: WRAPPED_SOL_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 60_000),
      entryPriceUsd: 100,
      exitPriceUsd: 120,
    });
    seedClosedPaperTrade(repository, {
      tokenMint: USDC_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 120_000),
      entryPriceUsd: 100,
      exitPriceUsd: 90,
    });
    repository.close();
    openRepos.pop();

    const writable = new DatabaseSync(path);
    writable.exec('PRAGMA foreign_keys = OFF');
    const solTokenId = writable.prepare('SELECT id FROM tokens WHERE mint = ?').get(WRAPPED_SOL_MINT)?.[
      'id'
    ];
    const usdcTokenId = writable.prepare('SELECT id FROM tokens WHERE mint = ?').get(USDC_MINT)?.['id'];
    if (typeof solTokenId !== 'number' || typeof usdcTokenId !== 'number') {
      writable.close();
      throw new Error('expected numeric token ids for open-pointer corruption');
    }
    const solPositionId = writable
      .prepare('SELECT id FROM paper_positions WHERE token_id = ?')
      .get(solTokenId)?.['id'];
    if (typeof solPositionId !== 'number') {
      writable.close();
      throw new Error('expected a closed SOL paper position id');
    }
    writable
      .prepare('INSERT INTO paper_open_positions (token_id, position_id) VALUES (?, ?)')
      .run(usdcTokenId, solPositionId);
    writable.close();

    expect(() =>
      executePerformanceReport(
        preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path }),
      ),
    ).toThrow(PerformanceError);
  });
});

describe('dataset fingerprint tamper resistance', () => {
  it('is stable under close-order permutation, and changes when a trade is added, removed, or semantically replaced', () => {
    const firstPath = tempDbPath();
    const firstRepo = openWriteRepo(firstPath);
    seedClosedPaperTrade(firstRepo, {
      tokenMint: WRAPPED_SOL_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 120_000),
      entryPriceUsd: 100,
      exitPriceUsd: 120,
    });
    seedClosedPaperTrade(firstRepo, {
      tokenMint: USDC_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 60_000),
      entryPriceUsd: 100,
      exitPriceUsd: 90,
    });
    firstRepo.close();
    openRepos.pop();

    const reversedPath = tempDbPath();
    const reversedRepo = openWriteRepo(reversedPath);
    seedClosedPaperTrade(reversedRepo, {
      tokenMint: USDC_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 60_000),
      entryPriceUsd: 100,
      exitPriceUsd: 90,
    });
    seedClosedPaperTrade(reversedRepo, {
      tokenMint: WRAPPED_SOL_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 120_000),
      entryPriceUsd: 100,
      exitPriceUsd: 120,
    });
    reversedRepo.close();
    openRepos.pop();

    const first = executePerformanceReport(
      preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: firstPath }),
    );
    const reversed = executePerformanceReport(
      preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: reversedPath }),
    );
    expect(first.dataset.datasetFingerprint).toBe(reversed.dataset.datasetFingerprint);

    const addedPath = tempDbPath();
    const addedRepo = openWriteRepo(addedPath);
    seedClosedPaperTrade(addedRepo, {
      tokenMint: WRAPPED_SOL_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 120_000),
      entryPriceUsd: 100,
      exitPriceUsd: 120,
    });
    seedClosedPaperTrade(addedRepo, {
      tokenMint: USDC_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 60_000),
      entryPriceUsd: 100,
      exitPriceUsd: 90,
    });
    seedClosedPaperTrade(addedRepo, {
      tokenMint: BONK_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 180_000),
      entryPriceUsd: 50,
      exitPriceUsd: 100,
    });
    addedRepo.close();
    openRepos.pop();
    const added = executePerformanceReport(
      preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: addedPath }),
    );
    expect(added.dataset.datasetFingerprint).not.toBe(first.dataset.datasetFingerprint);

    const onePath = tempDbPath();
    const oneRepo = openWriteRepo(onePath);
    seedClosedPaperTrade(oneRepo, {
      tokenMint: WRAPPED_SOL_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 120_000),
      entryPriceUsd: 100,
      exitPriceUsd: 120,
    });
    oneRepo.close();
    openRepos.pop();
    const removed = executePerformanceReport(
      preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: onePath }),
    );
    expect(removed.dataset.datasetFingerprint).not.toBe(first.dataset.datasetFingerprint);
  });
});

describe('timestamps', () => {
  it('rejects offset timestamps even when they name a known UTC instant', () => {
    expect(() => requireUtcMillis('2026-08-17T12:00:00.000+02:00', 'exitedAt')).toThrow(
      /canonical UTC ISO-8601/,
    );
    expect(requireUtcMillis('2026-08-17T10:00:00.000Z', 'exitedAt')).toBe(
      Date.parse('2026-08-17T12:00:00.000+02:00'),
    );
    expect(() => requireUtcMillis('not-a-date', 'exitedAt')).toThrow(PerformanceError);
  });
});

describe('PERFORMANCE_TRADE_LIMIT is display-only', () => {
  it('keeps report fingerprint and metrics identical for limits 1, 20, and 100', () => {
    const path = tempDbPath();
    const repository = openWriteRepo(path);
    seedClosedPaperTrade(repository, {
      tokenMint: WRAPPED_SOL_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 60_000),
      entryPriceUsd: 100,
      exitPriceUsd: 120,
    });
    seedClosedPaperTrade(repository, {
      tokenMint: USDC_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 120_000),
      entryPriceUsd: 100,
      exitPriceUsd: 90,
    });
    seedClosedPaperTrade(repository, {
      tokenMint: BONK_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 180_000),
      entryPriceUsd: 50,
      exitPriceUsd: 100,
    });
    repository.close();
    openRepos.pop();

    const reports = (['1', '20', '100'] as const).map((limit) => {
      const config = preparePerformanceCommand({
        DATABASE_ENABLED: 'true',
        DATABASE_PATH: path,
        PERFORMANCE_TRADE_LIMIT: limit,
      });
      const report = executePerformanceReport(config);
      const trades = executePerformanceTrades(config);
      return { limit, config, report, trades };
    });

    for (const item of reports) {
      expect(item.report.dataset.datasetFingerprint).toBe(reports[0]?.report.dataset.datasetFingerprint);
      expect(item.report.capitalReferenceTotals).toEqual(reports[0]?.report.capitalReferenceTotals);
      expect(item.trades.dataset.closedTradeCount).toBe(3);
      expect(item.trades.trades).toHaveLength(3);
    }

    const firstReport = reports[0]?.report;
    expect(firstReport).toBeDefined();
    if (firstReport === undefined) {
      throw new Error('expected a display-limit report');
    }
    expect(formatPerformanceTradeLines(firstReport, 1).join('\n')).toContain(
      'Displaying 1 of 3 closed trades',
    );
  });
});

describe('query-only database hardening', () => {
  it('refuses CREATE TABLE, DROP TABLE, and ALTER TABLE on the analytics handle', () => {
    const path = tempDbPath();
    openWriteRepo(path).close();
    openRepos.pop();
    const source = openSqlitePerformanceDataSource({ path, busyTimeoutMs: 1000 });
    openSources.push(source);
    expect(source.queryOnlyEnabled()).toBe(true);
    expect(() => {
      source.execForTests('CREATE TABLE audit_probe (id INTEGER)');
    }).toThrow();
    expect(() => {
      source.execForTests('DROP TABLE tokens');
    }).toThrow();
    expect(() => {
      source.execForTests('ALTER TABLE tokens ADD COLUMN probe TEXT');
    }).toThrow();
  });

  it('rejects schema 6 without modifying the file', () => {
    const path = tempDbPath();
    const database = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
    applyMigrations(database, { targetVersion: 6 });
    database.close();
    const before = readFileSync(path);

    const source = openSqlitePerformanceDataSource({ path, busyTimeoutMs: 1000 });
    openSources.push(source);
    expect(() => {
      source.verifyCompatibleSchema();
    }).toThrow(/schema 6|schema 7 or later/);
    source.close();
    openSources.pop();
    expect(readFileSync(path).equals(before)).toBe(true);

    const after = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
    expect(after.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.['version']).toBe(
      6,
    );
    after.close();
  });

  it('accepts schema 7 and a synthetic later schema only when required columns exist', () => {
    const compatible = tempDbPath();
    openWriteRepo(compatible).close();
    openRepos.pop();
    const extra = new DatabaseSync(compatible);
    extra
      .prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (8, 'future', ?)")
      .run(T_10_00);
    extra.close();
    const compatibleSource = openSqlitePerformanceDataSource({ path: compatible, busyTimeoutMs: 1000 });
    openSources.push(compatibleSource);
    expect(() => {
      compatibleSource.verifyCompatibleSchema();
    }).not.toThrow();

    const incompatible = tempDbPath();
    const raw = new DatabaseSync(incompatible);
    raw.exec(`
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
INSERT INTO schema_migrations (version, name, applied_at) VALUES (9, 'future', '${T_10_00}');
CREATE TABLE tokens (id INTEGER);
CREATE TABLE market_snapshots (id INTEGER);
CREATE TABLE strategy_evaluations (id INTEGER);
CREATE TABLE paper_evaluations (id INTEGER);
CREATE TABLE position_evaluations (id INTEGER);
CREATE TABLE paper_positions (id INTEGER);
CREATE TABLE paper_open_positions (token_id INTEGER);
CREATE TABLE exit_evaluations (id INTEGER);
CREATE TABLE paper_position_exits (id INTEGER);
`);
    raw.close();
    const bad = openSqlitePerformanceDataSource({ path: incompatible, busyTimeoutMs: 1000 });
    openSources.push(bad);
    expect(() => {
      bad.verifyCompatibleSchema();
    }).toThrow(/missing required column/);
  });
});

describe('coherent read snapshot', () => {
  it('does not observe a completed trade inserted after the read snapshot began', () => {
    const path = tempDbPath();
    const repository = openWriteRepo(path);
    seedClosedPaperTrade(repository, {
      tokenMint: WRAPPED_SOL_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 60_000),
      entryPriceUsd: 100,
      exitPriceUsd: 120,
    });
    repository.close();
    openRepos.pop();

    const source = openSqlitePerformanceDataSource({ path, busyTimeoutMs: 5000 });
    openSources.push(source);
    source.withReadSnapshot(() => {
      expect(source.loadCompletedTradeEvidence()).toHaveLength(1);
      const writer = openWriteRepo(path);
      seedClosedPaperTrade(writer, {
        tokenMint: USDC_MINT,
        openedAt: T_10_00,
        exitedAt: addMs(T_10_00, 120_000),
        entryPriceUsd: 100,
        exitPriceUsd: 90,
      });
      writer.close();
      openRepos.pop();
      expect(source.loadCompletedTradeEvidence()).toHaveLength(1);
    });
    expect(source.loadCompletedTradeEvidence()).toHaveLength(2);
  });
});

describe('performance import graph', () => {
  it('does not reach live evaluators, feature providers, DexScreener, or Solana RPC', () => {
    const start = [
      fileURLToPath(new URL('../src/performance/command.ts', import.meta.url)),
      fileURLToPath(new URL('../src/performance/run-report.ts', import.meta.url)),
      fileURLToPath(new URL('../src/performance/run-trades.ts', import.meta.url)),
    ];
    const forbidden = [
      `${sep}paper${sep}execute.ts`,
      `${sep}paper${sep}evaluator.ts`,
      `${sep}position${sep}execute.ts`,
      `${sep}position${sep}evaluator.ts`,
      `${sep}exit${sep}execute.ts`,
      `${sep}exit${sep}evaluator.ts`,
      `${sep}strategy${sep}evaluator.ts`,
      `${sep}features${sep}live.ts`,
    ];
    const seen = new Set<string>();
    const queue = [...start];
    const importPattern = /from ['"](\.[^'"]+)['"]/g;

    while (queue.length > 0) {
      const current = queue.pop();
      if (current === undefined || seen.has(current) || !existsSync(current)) {
        continue;
      }
      seen.add(current);
      for (const fragment of forbidden) {
        expect(current.includes(fragment)).toBe(false);
      }
      expect(current.includes(`${sep}solana${sep}`)).toBe(false);
      const source = readFileSync(current, 'utf8');
      expect(source).not.toMatch(/\bfetch\s*\(/);
      for (const match of source.matchAll(importPattern)) {
        const specifier = match[1];
        if (specifier === undefined || !specifier.startsWith('.')) {
          continue;
        }
        const withTs = specifier.endsWith('.js') ? specifier.replace(/\.js$/, '.ts') : `${specifier}.ts`;
        queue.push(resolve(dirname(current), withTs));
      }
    }

    expect(seen.size).toBeGreaterThan(5);
  });
});
