import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { EXIT_MAX_HOLDING_MS } from '../src/exit/constants.js';
import {
  executePerformanceReport,
  executePerformanceTrades,
  openSqlitePerformanceDataSource,
  preparePerformanceCommand,
} from '../src/performance/index.js';
import { PerformanceError } from '../src/performance/types.js';
import {
  applyMigrations,
  LATEST_SCHEMA_VERSION,
  migrationSqlDigest,
  openSqliteDatabase,
} from '../src/persistence/sqlite/index.js';
import {
  createSqlitePersistenceRepository,
  SqlitePersistenceRepository,
} from '../src/persistence/index.js';
import { nextRepresentableNumber } from './paper-fixtures.js';
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
  const directory = mkdtempSync(join(tmpdir(), 'mtb-perf-'));
  tempDirs.push(directory);
  return join(directory, 'history.sqlite');
}

function openWriteRepo(path: string): SqlitePersistenceRepository {
  const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
  repository.initialize();
  openRepos.push(repository);
  return repository;
}

describe('performance sqlite source', () => {
  it('keeps migrations 001-007 frozen after live schema 8', () => {
    expect(LATEST_SCHEMA_VERSION).toBe(8);
    expect(migrationSqlDigest(1)).toBe(
      '7c20b9f9799c65c1be718df10a8841dcb7486d35414fa4806ea77a6192ebda7a',
    );
    expect(migrationSqlDigest(2)).toBe(
      'c80bbcc691b4eb36c75a3a5fae303f694241152d2ab79679ec8328f9b267071e',
    );
    expect(migrationSqlDigest(3)).toBe(
      '891ed1347be25bcda40cc2219208789fd3af117f91d9d140367c241c087ece1c',
    );
    expect(migrationSqlDigest(4)).toBe(
      'eb21748b78a5ff33fb8bd6f590b24f9be098ff5a343107de74e50d528b84d308',
    );
    expect(migrationSqlDigest(5)).toBe(
      '5435dc4d919729f38474f6cbcdb18a5993b5688d6d97fd31b15fcd75ea26c629',
    );
    expect(migrationSqlDigest(6)).toBe(
      'ddffdd15c0ee0d67e2146854aa6a3adb87c0f0497999de9c80a9bfa4210bdbb0',
    );
    expect(migrationSqlDigest(7)).toBe(
      'd049cf6a2ba8b041f703fe15ab13f1b687a347e4eab6b2b8587a84cd67b404fa',
    );
    expect(migrationSqlDigest(8)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects schema 6 because immutable exit evidence does not exist', () => {
    const path = tempDbPath();
    const database = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
    applyMigrations(database, { targetVersion: 6 });
    expect(
      database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.['version'],
    ).toBe(6);
    database.close();

    const source = openSqlitePerformanceDataSource({ path, busyTimeoutMs: 1000 });
    openSources.push(source);
    expect(() => {
      source.verifyCompatibleSchema();
    }).toThrow(/schema 7 or later|schema 6/);
  });

  it('accepts an empty schema 7 database as no_closed_trades', () => {
    const path = tempDbPath();
    const repository = openWriteRepo(path);
    expect(repository.getStats().schemaVersion).toBe(8);
    repository.close();
    openRepos.pop();

    const config = preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path });
    const report = executePerformanceReport(config);
    expect(report.dataset.status).toBe('no_closed_trades');
    expect(report.dataset.closedTradeCount).toBe(0);
    expect(report.aggregateGrossReturnPct).toBeNull();
    expect(report.rates.winRatePct).toBeNull();
  });

  it('loads populated schema 7 completed trades with known GROSS answers, including zero price and stored quantity', () => {
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
    seedClosedPaperTrade(repository, {
      tokenMint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 240_000),
      entryPriceUsd: 100,
      exitPriceUsd: 0,
    });
    seedClosedPaperTrade(repository, {
      tokenMint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3p9WVrRgGNVPua7A',
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, EXIT_MAX_HOLDING_MS),
      entryPriceUsd: 100,
      exitPriceUsd: 100,
    });
    const before = repository.getTableCounts();
    repository.close();
    openRepos.pop();

    const config = preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path });
    const report = executePerformanceReport(config);
    expect(report.dataset.status).toBe('available');
    expect(report.dataset.closedTradeCount).toBe(5);
    expect(report.counts).toEqual({ winCount: 2, lossCount: 2, breakevenCount: 1 });
    expect(report.capitalReferenceTotals.totalReferenceNotionalUsd).toBe(500);
    expect(report.capitalReferenceTotals.totalGrossPnlUsd).toBe(20 - 10 + 100 - 100 + 0);
    const quantityTrade = report.trades.find((trade) => trade.tokenMint === BONK_MINT);
    expect(quantityTrade?.quantityTokens).toBe(2);
    expect(quantityTrade?.grossExitValueUsd).toBe(200);
    expect(quantityTrade?.grossPnlUsd).toBe(100);
    expect(quantityTrade?.grossReturnPct).toBe(100);
    const zero = report.trades.find(
      (trade) => trade.tokenMint === 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    );
    expect(zero?.exitPriceUsd).toBe(0);
    expect(zero?.grossPnlUsd).toBe(-100);
    expect(zero?.grossReturnPct).toBe(-100);

    const after = openWriteRepo(path);
    expect(after.getTableCounts()).toEqual(before);
    expect(after.getStats().schemaVersion).toBe(8);
  });

  it('enables query_only and refuses INSERT, UPDATE, and DELETE', () => {
    const path = tempDbPath();
    openWriteRepo(path).close();
    openRepos.pop();

    const source = openSqlitePerformanceDataSource({ path, busyTimeoutMs: 1000 });
    openSources.push(source);
    source.verifyCompatibleSchema();
    expect(source.queryOnlyEnabled()).toBe(true);
    expect(() => {
      source.execForTests(
        "INSERT INTO tokens (chain, mint, first_observed_at, last_observed_at, created_at) VALUES ('solana', 'x', '2026-08-17T10:00:00.000Z', '2026-08-17T10:00:00.000Z', '2026-08-17T10:00:00.000Z')",
      );
    }).toThrow();
    expect(() => {
      source.execForTests("UPDATE tokens SET mint = 'y'");
    }).toThrow();
    expect(() => {
      source.execForTests('DELETE FROM tokens');
    }).toThrow();
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

  it('does not write SQL from the performance source module', () => {
    const source = readFileSync(
      new URL('../src/performance/sqlite-source.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE FROM\b|\bDROP\b|\bALTER\b/i);
    expect(source).not.toMatch(
      /applyMigrations|ensureDatabaseDirectory|openSqliteDatabase|recordExitBundle|recordPositionBundle/,
    );
    expect(source).toMatch(/readOnly:\s*true/);
    expect(source).toMatch(/query_only/);
  });

  it('leaves row counts unchanged for performance:report and performance:trades', () => {
    const path = tempDbPath();
    const repository = openWriteRepo(path);
    seedClosedPaperTrade(repository, {
      tokenMint: WRAPPED_SOL_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 60_000),
      entryPriceUsd: 100,
      exitPriceUsd: 120,
    });
    const before = repository.getTableCounts();
    repository.close();
    openRepos.pop();

    const config = preparePerformanceCommand({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: path,
      PERFORMANCE_TRADE_LIMIT: '1',
    });
    const report = executePerformanceReport(config);
    const trades = executePerformanceTrades(config);
    expect(report.dataset.closedTradeCount).toBe(1);
    expect(trades.dataset.closedTradeCount).toBe(1);
    expect(trades.dataset.closedTradeCount).toBe(report.dataset.closedTradeCount);

    const after = openWriteRepo(path);
    expect(after.getTableCounts()).toEqual(before);
    const raw = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
    try {
      expect(raw.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      expect(String(Object.values(raw.prepare('PRAGMA integrity_check').get() ?? {})[0])).toBe(
        'ok',
      );
    } finally {
      raw.close();
    }
  });

  it('fails the report on corrupted eligible lifecycle evidence instead of skipping it', () => {
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

    const writable = new DatabaseSync(path);
    writable
      .prepare('UPDATE paper_positions SET position_definition_fingerprint = ?')
      .run('0'.repeat(64));
    writable.close();

    const config = preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path });
    expect(() => executePerformanceReport(config)).toThrow(PerformanceError);
  });

  it('rejects a completed position that is still marked current-open', () => {
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

    const writable = new DatabaseSync(path);
    writable.exec('PRAGMA foreign_keys = ON');
    writable
      .prepare('INSERT INTO paper_open_positions (token_id, position_id) VALUES (1, 1)')
      .run();
    writable.close();

    const config = preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path });
    expect(() => executePerformanceReport(config)).toThrow(/current paper_open_positions/);
  });

  it('rejects a one-ULP exit quantity difference stored in SQLite', () => {
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

    const writable = new DatabaseSync(path);
    writable
      .prepare('UPDATE paper_position_exits SET quantity_tokens = ?')
      .run(nextRepresentableNumber(1));
    writable.close();

    const config = preparePerformanceCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path });
    expect(() => executePerformanceReport(config)).toThrow(/exactly equal/);
  });

  it('does not create a missing database file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-perf-missing-'));
    tempDirs.push(directory);
    const nested = join(directory, 'missing-dir', 'bot.sqlite');
    expect(() => openSqlitePerformanceDataSource({ path: nested, busyTimeoutMs: 1000 })).toThrow(
      PerformanceError,
    );
    expect(existsSync(nested)).toBe(false);
  });
});
