import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  executeResearchCompare,
  openReadOnlyResearchDatabase,
  openSqliteResearchDataSource,
  prepareResearchCommand,
  reconstructPointInTimeVector,
  simulateResearchCandidate,
} from '../src/research/index.js';
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
import { seedClosedPaperTrade, addMs, T_10_00, WRAPPED_SOL_MINT } from './performance-fixtures.js';
import { allEntrySnapshot } from './research-fixtures.js';
import { passingRisk } from './strategy-fixtures.js';
import { evaluateExitAction } from '../src/exit/evaluator.js';
import { openedPositionFrom, positionBundleAt } from './position-fixtures.js';
import { exitMarketSnapshot } from './exit-fixtures.js';

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
  const directory = mkdtempSync(join(tmpdir(), 'mtb-research-'));
  tempDirs.push(directory);
  return join(directory, 'history.sqlite');
}

function openWriteRepo(path: string): SqlitePersistenceRepository {
  const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
  repository.initialize();
  openRepos.push(repository);
  return repository;
}

describe('research sqlite source', () => {
  it('keeps migrations 001-007 frozen and does not add 008', () => {
    expect(LATEST_SCHEMA_VERSION).toBe(7);
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
    expect(() => migrationSqlDigest(8)).toThrow(/Unknown migration version: 8/);
  });

  it('rejects schema 6', () => {
    const path = tempDbPath();
    const database = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
    applyMigrations(database, { targetVersion: 6 });
    database.close();
    const source = openSqliteResearchDataSource({ path, busyTimeoutMs: 1000 });
    openSources.push(source);
    expect(() => {
      source.verifyCompatibleSchema();
    }).toThrow(/schema 7 or later|schema 6/);
  });

  it('accepts schema 7 and future extra columns', () => {
    const path = tempDbPath();
    const repository = openWriteRepo(path);
    expect(repository.getStats().schemaVersion).toBe(7);
    repository.close();
    openRepos.pop();

    const writable = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
    writable.exec('ALTER TABLE market_snapshots ADD COLUMN extra_research_lab TEXT');
    writable.close();

    const source = openSqliteResearchDataSource({ path, busyTimeoutMs: 1000 });
    openSources.push(source);
    source.verifyCompatibleSchema();
    expect(source.queryOnlyEnabled()).toBe(true);
  });

  it('excludes runtime-exit-referenced snapshots before candidate runs and shows the count', () => {
    const path = tempDbPath();
    const repository = openWriteRepo(path);
    seedClosedPaperTrade(repository, {
      tokenMint: WRAPPED_SOL_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 60_000),
      entryPriceUsd: 1,
      exitPriceUsd: 0.8,
    });
    repository.recordMarketSnapshots([
      allEntrySnapshot({ collectedAt: addMs(T_10_00, 120_000), priceUsd: 1.01 }),
    ]);
    const before = repository.getStats();
    repository.close();
    openRepos.pop();

    const config = prepareResearchCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path });
    const report = executeResearchCompare(config);
    expect(report.rawMarketSnapshotCount).toBeGreaterThan(0);
    expect(report.runtimeExitReferencedSnapshotCountExcluded).toBeGreaterThan(0);
    expect(report.researchMarketSnapshotCount).toBe(
      report.rawMarketSnapshotCount - report.runtimeExitReferencedSnapshotCountExcluded,
    );
    expect(report.candidates.every((item) => item.researchDatasetFingerprint === report.researchDatasetFingerprint)).toBe(
      true,
    );

    const afterRepo = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    afterRepo.initialize();
    openRepos.push(afterRepo);
    const after = afterRepo.getStats();
    expect(after.tokenCount).toBe(before.tokenCount);
    expect(after.marketSnapshotCount).toBe(before.marketSnapshotCount);
    expect(after.riskScanCount).toBe(before.riskScanCount);
    expect(after.featureVectorCount).toBe(before.featureVectorCount);
    expect(after.strategyEvaluationCount).toBe(before.strategyEvaluationCount);
    expect(after.paperEvaluationCount).toBe(before.paperEvaluationCount);
    expect(after.positionEvaluationCount).toBe(before.positionEvaluationCount);
    expect(after.paperPositionCount).toBe(before.paperPositionCount);
    expect(after.openPaperPositionCount).toBe(before.openPaperPositionCount);
    expect(after.exitEvaluationCount).toBe(before.exitEvaluationCount);
    expect(after.paperPositionExitCount).toBe(before.paperPositionExitCount);
  });

  it('opens query-only and rejects writes', () => {
    const path = tempDbPath();
    openWriteRepo(path).close();
    openRepos.pop();
    const source = openSqliteResearchDataSource({ path, busyTimeoutMs: 1000 });
    openSources.push(source);
    expect(source.queryOnlyEnabled()).toBe(true);
    expect(() => {
      source.withReadSnapshot(() => {
        throw new Error('should not write');
      });
    }).toThrow(/should not write/);
  });

  it('rejects INSERT UPDATE DELETE CREATE DROP ALTER on the research handle', () => {
    const path = tempDbPath();
    openWriteRepo(path).close();
    openRepos.pop();
    const database = openReadOnlyResearchDatabase({ path, busyTimeoutMs: 1000 });
    expect(String(Object.values(database.prepare('PRAGMA query_only').get() ?? {})[0] ?? '')).toBe('1');
    expect(() => {
      database.exec('INSERT INTO tokens (chain, mint, first_observed_at, last_observed_at, created_at) VALUES (\'solana\', \'x\', \'2026-01-01T00:00:00.000Z\', \'2026-01-01T00:00:00.000Z\', \'2026-01-01T00:00:00.000Z\')');
    }).toThrow();
    expect(() => {
      database.exec('UPDATE tokens SET mint = mint');
    }).toThrow();
    expect(() => {
      database.exec('DELETE FROM tokens');
    }).toThrow();
    expect(() => {
      database.exec('CREATE TABLE audit_lab (id INTEGER)');
    }).toThrow();
    expect(() => {
      database.exec('DROP TABLE tokens');
    }).toThrow();
    expect(() => {
      database.exec('ALTER TABLE tokens ADD COLUMN audit_lab TEXT');
    }).toThrow();
    database.close();
  });

  it('rejects schema 6 without modifying the file', () => {
    const path = tempDbPath();
    const database = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
    applyMigrations(database, { targetVersion: 6 });
    database.close();
    const before = createHash('sha256').update(readFileSync(path)).digest('hex');
    const source = openSqliteResearchDataSource({ path, busyTimeoutMs: 1000 });
    openSources.push(source);
    expect(() => {
      source.verifyCompatibleSchema();
    }).toThrow(/schema/);
    source.close();
    openSources.pop();
    const after = createHash('sha256').update(readFileSync(path)).digest('hex');
    expect(after).toBe(before);
  });

  it('changes the dataset fingerprint when a bound market or risk fact changes', () => {
    const path = tempDbPath();
    const repository = openWriteRepo(path);
    repository.recordMarketSnapshots([allEntrySnapshot({ collectedAt: T_10_00, priceUsd: 1 })]);
    repository.recordRiskReport(
      passingRisk({
        scannedAt: addMs(T_10_00, -60_000),
        highestFindingSeverity: 'high',
        findings: [
          {
            code: 'MINT_AUTHORITY_ACTIVE',
            category: 'authority',
            severity: 'high',
            confidence: 'high',
            title: 'mint',
            description: 'mint',
          },
        ],
      }),
    );
    repository.close();
    openRepos.pop();

    const original = fingerprintOf(path);
    const snapshotRow = readOne(path, 'SELECT * FROM market_snapshots');
    const tokenRow = readOne(path, 'SELECT * FROM tokens');
    const riskRow = readOne(path, 'SELECT * FROM risk_scans');
    const findingRow = readOne(path, 'SELECT * FROM risk_findings');
    const marketMutations: Array<[string, number | string]> = [
      ['price_usd', 1.01],
      ['liquidity_usd', 100_001],
      ['volume_5m_usd', 20_001],
      ['volume_1h_usd', 501],
      ['volume_24h_usd', 5_001],
      ['buys_5m', 61],
      ['sells_5m', 41],
      ['buys_1h', 301],
      ['sells_1h', 201],
      ['price_change_5m_pct', 6],
      ['price_change_1h_pct', 2],
      ['price_change_24h_pct', 5],
      ['market_cap_usd', 100_001],
      ['fdv_usd', 200_001],
      ['pair_created_at', '2026-08-17T08:00:00.000Z'],
      ['pair_address', 'ChangedPair111111111111111111111111111111111'],
      ['collected_at', '2026-08-17T10:00:00.001Z'],
      ['token_name', 'ChangedName'],
      ['token_symbol', 'CHG'],
      ['dex_id', 'raydium'],
    ];
    for (const [column, value] of marketMutations) {
      runSql(path, `UPDATE market_snapshots SET ${column} = ?`, value);
      expect(fingerprintOf(path), column).not.toBe(original);
      runSql(path, `UPDATE market_snapshots SET ${column} = ?`, snapshotRow[column] ?? null);
      expect(fingerprintOf(path), `${column} restored`).toBe(original);
    }

    runSql(path, 'UPDATE tokens SET mint = ?', 'ChangedMint11111111111111111111111111111111112');
    expect(fingerprintOf(path), 'token mint').not.toBe(original);
    runSql(path, 'UPDATE tokens SET mint = ?', tokenRow['mint'] ?? null);
    expect(fingerprintOf(path), 'token mint restored').toBe(original);

    const riskMutations: Array<[string, number | string]> = [
      ['scanned_at', '2026-08-17T09:58:00.000Z'],
      ['token_program', 'token_2022'],
      ['data_completeness', 'partial'],
      ['top1_bps', 1],
      ['top5_bps', 2],
      ['top10_bps', 3],
      ['top20_bps', 4],
      ['largest_accounts_count', 5],
    ];
    for (const [column, value] of riskMutations) {
      runSql(path, `UPDATE risk_scans SET ${column} = ?`, value);
      expect(fingerprintOf(path), column).not.toBe(original);
      runSql(path, `UPDATE risk_scans SET ${column} = ?`, riskRow[column] ?? null);
      expect(fingerprintOf(path), `${column} restored`).toBe(original);
    }

    runSql(path, 'UPDATE risk_findings SET severity = ?', 'critical');
    expect(fingerprintOf(path), 'finding severity').not.toBe(original);
    runSql(path, 'UPDATE risk_findings SET severity = ?', findingRow['severity'] ?? null);
    expect(fingerprintOf(path), 'finding severity restored').toBe(original);

    runSql(path, 'UPDATE risk_findings SET code = ?', 'FREEZE_AUTHORITY_ACTIVE');
    expect(fingerprintOf(path), 'finding presence').not.toBe(original);
    runSql(path, 'UPDATE risk_findings SET code = ?', findingRow['code'] ?? null);
    expect(fingerprintOf(path), 'finding presence restored').toBe(original);
  });

  it('loads markets, exclusions, and risk from one deferred read snapshot', () => {
    const path = tempDbPath();
    const repository = openWriteRepo(path);
    repository.recordMarketSnapshots([allEntrySnapshot({ collectedAt: T_10_00, priceUsd: 1 })]);
    repository.recordRiskReport(passingRisk({ scannedAt: addMs(T_10_00, -60_000) }));
    repository.close();
    openRepos.pop();

    const wal = new DatabaseSync(path);
    wal.exec('PRAGMA journal_mode=WAL');
    wal.close();

    const source = openSqliteResearchDataSource({ path, busyTimeoutMs: 5_000 });
    openSources.push(source);
    let frozenFingerprint = '';
    source.withReadSnapshot(() => {
      const first = source.loadResearchDataset();
      frozenFingerprint = first.researchDatasetFingerprint;
      runSql(path, 'UPDATE market_snapshots SET price_usd = ?', 9.99);
      runSql(path, "UPDATE risk_scans SET data_completeness = ?", 'partial');
      const second = source.loadResearchDataset();
      expect(second.researchDatasetFingerprint).toBe(frozenFingerprint);
      expect(second.marketSnapshots[0]?.priceUsd).toBe(first.marketSnapshots[0]?.priceUsd);
      expect(second.riskReports[0]?.dataCompleteness).toBe(first.riskReports[0]?.dataCompleteness);
    });
    source.close();
    openSources.pop();
    expect(fingerprintOf(path)).not.toBe(frozenFingerprint);
  });

  it('excludes T1 from previousMarket, entry, and exit when it is runtime-exit referenced', () => {
    const path = tempDbPath();
    const repository = openWriteRepo(path);
    const t0 = T_10_00;
    const t1 = addMs(T_10_00, 60_000);
    const t2 = addMs(T_10_00, 120_000);
    repository.recordRiskReport(passingRisk({ scannedAt: addMs(t0, -1_000) }));
    seedClosedPaperTrade(repository, {
      tokenMint: WRAPPED_SOL_MINT,
      openedAt: t0,
      exitedAt: t1,
      entryPriceUsd: 1,
      exitPriceUsd: 0.8,
    });
    repository.recordMarketSnapshots([allEntrySnapshot({ collectedAt: t2, priceUsd: 1.01 })]);
    repository.close();
    openRepos.pop();

    const source = openSqliteResearchDataSource({ path, busyTimeoutMs: 1000 });
    openSources.push(source);
    const dataset = source.withReadSnapshot(() => {
      source.verifyCompatibleSchema();
      return source.loadResearchDataset();
    });
    expect(dataset.runtimeExitReferencedSnapshotCountExcluded).toBeGreaterThan(0);
    expect(dataset.marketSnapshots.some((snapshot) => snapshot.collectedAt === t1)).toBe(false);
    const atT2 = dataset.marketSnapshots.find((snapshot) => snapshot.collectedAt === t2);
    if (atT2 === undefined) {
      throw new Error('expected T2 in the research universe');
    }
    const vector = reconstructPointInTimeVector({
      snapshot: atT2,
      researchMarketSnapshots: dataset.marketSnapshots,
      riskReports: dataset.riskReports,
    });
    expect(vector.previousMarketCollectedAt).toBe(t0);
    const simulated = simulateResearchCandidate(dataset, 'quality_control_v1');
    expect(simulated.completedTrades.every((trade) => trade.exitedAt !== t1)).toBe(true);
  });

  it('excludes no_change and unavailable-price x11 snapshots too', () => {
    const path = tempDbPath();
    const repository = openWriteRepo(path);
    const openedAt = T_10_00;
    const holdAt = addMs(T_10_00, 1_000);
    const unavailableAt = addMs(T_10_00, 2_000);
    const bundle = positionBundleAt(openedAt, { tokenMint: WRAPPED_SOL_MINT, priceUsd: 1 });
    repository.recordPositionBundle(bundle);
    const open = openedPositionFrom(bundle);
    const storedOpen = repository.getOpenPaperPosition(WRAPPED_SOL_MINT);
    if (storedOpen === null) {
      throw new Error('expected open position');
    }
    const holdSnapshot = exitMarketSnapshot(open, { collectedAt: holdAt, priceUsd: 1.05 });
    repository.recordExitBundle({
      openPosition: storedOpen,
      marketSnapshot: holdSnapshot,
      exitEvaluation: evaluateExitAction({ openPosition: storedOpen, marketSnapshot: holdSnapshot }),
    });
    const nullSnapshot = exitMarketSnapshot(open, { collectedAt: unavailableAt, priceUsd: null });
    repository.recordExitBundle({
      openPosition: storedOpen,
      marketSnapshot: nullSnapshot,
      exitEvaluation: evaluateExitAction({ openPosition: storedOpen, marketSnapshot: nullSnapshot }),
    });
    repository.close();
    openRepos.pop();

    const source = openSqliteResearchDataSource({ path, busyTimeoutMs: 1000 });
    openSources.push(source);
    const dataset = source.withReadSnapshot(() => source.loadResearchDataset());
    expect(dataset.runtimeExitReferencedSnapshotCountExcluded).toBeGreaterThanOrEqual(2);
    expect(dataset.marketSnapshots.some((snapshot) => snapshot.collectedAt === holdAt)).toBe(false);
    expect(dataset.marketSnapshots.some((snapshot) => snapshot.collectedAt === unavailableAt)).toBe(false);
  });
});

function fingerprintOf(path: string): string {
  const source = openSqliteResearchDataSource({ path, busyTimeoutMs: 1000 });
  openSources.push(source);
  const dataset = source.withReadSnapshot(() => source.loadResearchDataset());
  source.close();
  openSources.pop();
  return dataset.researchDatasetFingerprint;
}

function runSql(path: string, sql: string, value: number | string | bigint | null): void {
  const database = new DatabaseSync(path);
  database.prepare(sql).run(value);
  database.close();
}

function readOne(path: string, sql: string): Record<string, number | string | bigint | null> {
  const database = new DatabaseSync(path);
  const row = database.prepare(sql).get() as Record<string, number | string | bigint | null> | undefined;
  database.close();
  if (row === undefined) {
    throw new Error(`expected a row from ${sql}`);
  }
  return row;
}
