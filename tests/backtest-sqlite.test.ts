import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { executeHistoricalBacktest, openSqliteBacktestDataSource, prepareBacktestCommand } from '../src/backtest/index.js';
import { BacktestError } from '../src/backtest/types.js';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { PersistenceError } from '../src/persistence/types.js';
import { createSqlitePersistenceRepository, SqlitePersistenceRepository } from '../src/persistence/index.js';
import { FINDING_CODES, TOKEN_2022_PROGRAM_ID } from '../src/risk/constants.js';
import { COMPATIBLE_SCHEMA_VERSIONS, REQUIRED_SCHEMA_VERSION } from '../src/backtest/constants.js';
import { applyMigrations, LATEST_SCHEMA_VERSION, openSqliteDatabase } from '../src/persistence/sqlite/index.js';
import {
  CONCENTRATION_UNAVAILABLE_REASON,
  riskDerivedFeatures,
  riskDerivedFeaturesFromFacts,
} from '../src/features/risk-features.js';
import { generateFeatureVector } from '../src/features/engine.js';
import { passingBundle } from './strategy-fixtures.js';
import { AUTHORITY } from './risk-fixtures.js';
import { candidateRisk, candidateSnapshot, outcomeOnlySnapshot, T_10_00 } from './backtest-fixtures.js';
import { featureValue } from './feature-fixtures.js';

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
  const directory = mkdtempSync(join(tmpdir(), 'mtb-backtest-'));
  tempDirs.push(directory);
  return join(directory, 'history.sqlite');
}

function openWriteRepo(path: string): SqlitePersistenceRepository {
  const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
  repository.initialize();
  openRepos.push(repository);
  return repository;
}

function seedHistoricalDb(path: string): ReturnType<SqlitePersistenceRepository['getTableCounts']> {
  const repository = openWriteRepo(path);
  repository.recordMarketSnapshots([
    candidateSnapshot(),
    outcomeOnlySnapshot({ priceUsd: 110 }),
    candidateSnapshot({ tokenMint: USDC_MINT, liquidityUsd: 1_000 }),
  ]);
  repository.recordRiskReport(fullStoredRisk());
  const counts = repository.getTableCounts();
  repository.close();
  const index = openRepos.indexOf(repository);
  if (index >= 0) {
    openRepos.splice(index, 1);
  }
  return counts;
}

function fullStoredRisk() {
  return candidateRisk({
    commitment: 'finalized',
    tokenProgram: 'token_2022',
    programOwner: TOKEN_2022_PROGRAM_ID,
    mintContextSlot: 111,
    supplyContextSlot: 222,
    largestAccountsContextSlot: 333,
    decimals: 9,
    supplyRaw: '999',
    mintAuthority: AUTHORITY,
    freezeAuthority: AUTHORITY,
    extensions: [
      {
        name: 'TransferFeeConfig',
        rawName: 'transferFeeConfig',
        authority: AUTHORITY,
        programId: TOKEN_2022_PROGRAM_ID,
        state: 'configured',
        transferFeeBasisPoints: 150,
        maximumFeeRaw: '1000',
        olderTransferFeeBasisPoints: 12,
        newerTransferFeeBasisPoints: 150,
        olderMaximumFeeRaw: '9',
        newerMaximumFeeRaw: '1000',
        parsed: true,
        classified: true,
      },
    ],
    largestTokenAccounts: [
      { rank: 1, tokenAccount: WRAPPED_SOL_MINT, amountRaw: '8000', shareBps: 8000 },
      { rank: 2, tokenAccount: USDC_MINT, amountRaw: '2000', shareBps: 2000 },
    ],
    concentration: {
      top1Bps: 8000,
      top5Bps: 9000,
      top10Bps: 9500,
      top20Bps: 9900,
      observedAccountsCount: 2,
    },
    concentrationUnavailableReason: null,
    findings: [
      {
        code: FINDING_CODES.TRANSFER_FEE_CONFIGURED,
        category: 'token_extension',
        severity: 'medium',
        confidence: 'high',
        title: 'B fee',
        description: 'fee',
      },
      {
        code: FINDING_CODES.MINT_AUTHORITY_ACTIVE,
        category: 'authority',
        severity: 'high',
        confidence: 'high',
        title: 'A mint',
        description: 'mint',
      },
      {
        code: FINDING_CODES.FREEZE_AUTHORITY_ACTIVE,
        category: 'authority',
        severity: 'high',
        confidence: 'high',
        title: 'freeze',
        description: 'freeze',
      },
      {
        code: FINDING_CODES.TOKEN_ACCOUNT_CONCENTRATION_VERY_HIGH,
        category: 'concentration',
        severity: 'critical',
        confidence: 'high',
        title: 'top1',
        description: 'top1',
      },
      {
        code: FINDING_CODES.UNCLASSIFIED_TOKEN_EXTENSION_PRESENT,
        category: 'token_extension',
        severity: 'info',
        confidence: 'medium',
        title: 'unclassified',
        description: 'unclassified',
      },
    ],
    dataCompleteness: 'complete',
    highestFindingSeverity: 'critical',
  });
}

function unavailableConcentrationRisk() {
  return candidateRisk({
    tokenProgram: 'token_2022',
    programOwner: TOKEN_2022_PROGRAM_ID,
    dataCompleteness: 'partial',
    concentration: null,
    concentrationUnavailableReason: 'largest token accounts unavailable',
    largestTokenAccounts: [],
    checks: [
      { check: 'mint_account', ok: true, contextSlot: 111, error: null },
      { check: 'supply', ok: true, contextSlot: 222, error: null },
      { check: 'largest_accounts', ok: false, contextSlot: null, error: 'unavailable' },
    ],
    findings: [],
    highestFindingSeverity: 'none',
  });
}

describe('sqlite historical source', () => {
  it('opens an existing database read-only and loads a historical risk-feature projection', () => {
    const path = tempDbPath();
    seedHistoricalDb(path);
    const source = openSqliteBacktestDataSource({ path, busyTimeoutMs: 1000 });
    openSources.push(source);
    source.verifyCompatibleSchema();
    expect(source.verifyIntegrity().ok).toBe(true);

    const dataset = source.loadDataset();
    expect(dataset.marketSnapshots).toHaveLength(3);
    expect(dataset.riskReports).toHaveLength(1);

    const report = dataset.riskReports[0];
    expect(report).toEqual({
      tokenMint: WRAPPED_SOL_MINT,
      scannedAt: fullStoredRisk().scannedAt,
      tokenProgram: 'token_2022',
      dataCompleteness: 'complete',
      findings: [
        {
          code: FINDING_CODES.FREEZE_AUTHORITY_ACTIVE,
          category: 'authority',
          severity: 'high',
          confidence: 'high',
          title: 'freeze',
          description: 'freeze',
        },
        {
          code: FINDING_CODES.MINT_AUTHORITY_ACTIVE,
          category: 'authority',
          severity: 'high',
          confidence: 'high',
          title: 'A mint',
          description: 'mint',
        },
        {
          code: FINDING_CODES.TOKEN_ACCOUNT_CONCENTRATION_VERY_HIGH,
          category: 'concentration',
          severity: 'critical',
          confidence: 'high',
          title: 'top1',
          description: 'top1',
        },
        {
          code: FINDING_CODES.TRANSFER_FEE_CONFIGURED,
          category: 'token_extension',
          severity: 'medium',
          confidence: 'high',
          title: 'B fee',
          description: 'fee',
        },
        {
          code: FINDING_CODES.UNCLASSIFIED_TOKEN_EXTENSION_PRESENT,
          category: 'token_extension',
          severity: 'info',
          confidence: 'medium',
          title: 'unclassified',
          description: 'unclassified',
        },
      ],
      concentration: {
        top1Bps: 8000,
        top5Bps: 9000,
        top10Bps: 9500,
        top20Bps: 9900,
        observedAccountsCount: 2,
      },
    });
    expect(report).not.toHaveProperty('chain');
    expect(report).not.toHaveProperty('commitment');
    expect(report).not.toHaveProperty('extensions');
    expect(report).not.toHaveProperty('checks');
    expect(report).not.toHaveProperty('classified');
    expect(report).not.toHaveProperty('rawName');
    expect(report).not.toHaveProperty('highestFindingSeverity');
    expect(report).not.toHaveProperty('programOwner');

    const oneToken = source.loadDataset(WRAPPED_SOL_MINT);
    expect(oneToken.marketSnapshots.every((item) => item.tokenMint === WRAPPED_SOL_MINT)).toBe(true);
    expect(oneToken.riskReports.every((item) => item.tokenMint === WRAPPED_SOL_MINT)).toBe(true);
  });

  it('reproduces every c06_v1 risk-derived feature from persisted historical facts', () => {
    const path = tempDbPath();
    const liveReport = fullStoredRisk();
    const repository = openWriteRepo(path);
    repository.recordMarketSnapshots([candidateSnapshot()]);
    repository.recordRiskReport(liveReport);
    repository.close();
    openRepos.pop();

    const source = openSqliteBacktestDataSource({ path, busyTimeoutMs: 1000 });
    openSources.push(source);
    const historical = source.loadDataset().riskReports[0];
    expect(historical).toBeDefined();

    const liveFeatures = riskDerivedFeatures(liveReport, T_10_00);
    const historicalFeatures = riskDerivedFeaturesFromFacts(historical ?? null, T_10_00);
    expect(historicalFeatures).toEqual(liveFeatures);
    expect(liveFeatures.map((item) => item.name)).toEqual([
      'risk_data_complete',
      'risk_token_2022',
      'risk_finding_mint_authority_active',
      'risk_finding_freeze_authority_active',
      'risk_finding_permanent_delegate_active',
      'risk_finding_non_transferable',
      'risk_finding_transfer_hook_active',
      'risk_finding_default_account_state_frozen',
      'risk_finding_transfer_fee_configured',
      'risk_top1_token_account_concentration_bps',
      'risk_top5_token_account_concentration_bps',
      'risk_top10_token_account_concentration_bps',
      'risk_top20_token_account_concentration_bps',
      'risk_finding_count',
      'risk_critical_finding_count',
      'risk_high_finding_count',
      'risk_medium_finding_count',
      'risk_info_finding_count',
      'risk_age_seconds',
    ]);

    const liveVector = generateFeatureVector(
      {
        market: candidateSnapshot(),
        previousMarket: null,
        risk: liveReport,
        riskUnavailableReason: null,
        asOf: T_10_00,
      },
      { generatedAt: T_10_00 },
    );
    const historicalVector = generateFeatureVector(
      {
        market: candidateSnapshot(),
        previousMarket: null,
        risk: historical ?? null,
        riskUnavailableReason: null,
        asOf: T_10_00,
      },
      { generatedAt: T_10_00 },
    );
    for (const feature of liveFeatures) {
      expect(featureValue(historicalVector, feature.name)).toEqual(featureValue(liveVector, feature.name));
    }
  });

  it('keeps historically unavailable concentration unavailable instead of inventing zero', () => {
    const path = tempDbPath();
    const liveReport = unavailableConcentrationRisk();
    const repository = openWriteRepo(path);
    repository.recordRiskReport(liveReport);
    repository.close();
    openRepos.pop();

    const source = openSqliteBacktestDataSource({ path, busyTimeoutMs: 1000 });
    openSources.push(source);
    const historical = source.loadDataset().riskReports[0];
    expect(historical?.concentration).toBeNull();
    expect(historical?.dataCompleteness).toBe('partial');
    expect(historical?.tokenProgram).toBe('token_2022');

    const features = riskDerivedFeaturesFromFacts(historical ?? null, T_10_00);
    expect(features).toEqual(riskDerivedFeatures(liveReport, T_10_00));
    for (const name of [
      'risk_top1_token_account_concentration_bps',
      'risk_top5_token_account_concentration_bps',
      'risk_top10_token_account_concentration_bps',
      'risk_top20_token_account_concentration_bps',
    ] as const) {
      const feature = features.find((item) => item.name === name);
      expect(feature).toMatchObject({
        status: 'unavailable',
        value: null,
        unavailableReason: CONCENTRATION_UNAVAILABLE_REASON,
      });
      expect(feature?.value).not.toBe(0);
    }
  });

  it('fails when the database file is missing and does not create it', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-backtest-missing-'));
    tempDirs.push(directory);
    const nested = join(directory, 'missing-dir', 'bot.sqlite');
    expect(() => openSqliteBacktestDataSource({ path: nested, busyTimeoutMs: 1000 })).toThrow(BacktestError);
    expect(existsSync(nested)).toBe(false);
    expect(existsSync(join(directory, 'missing-dir'))).toBe(false);
  });

  it('refuses DATABASE_ENABLED=false and incompatible schema versions', () => {
    expect(() => prepareBacktestCommand({ DATABASE_ENABLED: 'false' })).toThrow(PersistenceError);

    const path = tempDbPath();
    const database = new DatabaseSync(path);
    database.exec(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
    );
    database.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
      3,
      '003_feature_vectors',
      '2026-08-17T10:00:00.000Z',
    );
    database.close();

    const source = openSqliteBacktestDataSource({ path, busyTimeoutMs: 1000 });
    openSources.push(source);
    expect(() => {
      source.verifyCompatibleSchema();
    }).toThrow(/schema 4/);
  });

  it('accepts schema 6 and does not write rows during a backtest run', () => {
    const path = tempDbPath();
    const before = seedHistoricalDb(path);
    expect(before.schemaMigrations).toBe(LATEST_SCHEMA_VERSION);
    expect(COMPATIBLE_SCHEMA_VERSIONS).toEqual([4, 5, 6]);
    expect(REQUIRED_SCHEMA_VERSION).toBe(4);

    const config = prepareBacktestCommand({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: path,
    });
    const result = executeHistoricalBacktest(config, ['node', 'run.ts']);
    expect(result.backtestSpecVersion).toBe('b08_v1');
    expect(result.scope).toEqual({ kind: 'all' });
    expect(result.marketSnapshotCount).toBe(3);

    const afterRepo = openWriteRepo(path);
    expect(afterRepo.getTableCounts()).toEqual(before);
    expect(afterRepo.getStats().schemaVersion).toBe(6);
  });

  it('accepts schema 5 and does not migrate it', () => {
    const path = tempDbPath();
    const database = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
    applyMigrations(database, { targetVersion: 5 });
    expect(database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.['version']).toBe(5);
    database.close();

    const source = openSqliteBacktestDataSource({ path, busyTimeoutMs: 1000 });
    openSources.push(source);
    source.verifyCompatibleSchema();

    const after = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
    try {
      expect(after.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.['version']).toBe(5);
      expect(
        after.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'position_evaluations'").get(),
      ).toBeUndefined();
    } finally {
      after.close();
    }
  });

  it('still opens a schema 4 database read-only without migrating it', () => {
    const path = tempDbPath();
    const database = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
    applyMigrations(database, { targetVersion: 4 });
    expect(database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.['version']).toBe(4);
    database.close();

    const source = openSqliteBacktestDataSource({ path, busyTimeoutMs: 1000 });
    openSources.push(source);
    source.verifyCompatibleSchema();

    const after = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
    try {
      expect(after.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.['version']).toBe(4);
      expect(
        after.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'paper_evaluations'").get(),
      ).toBeUndefined();
    } finally {
      after.close();
    }
  });

  it('does not insert, update, delete, or change schema from the backtest source module', () => {
    const source = readFileSync(new URL('../src/backtest/sqlite-source.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bCREATE\b|\bDROP\b|\bALTER\b|\bREPLACE\b/i);
    expect(source).not.toMatch(/applyMigrations|ensureDatabaseDirectory|openSqliteDatabase/);
    expect(source).not.toMatch(/scanTokenRisk|evaluateFindings|from '\.\.\/risk\/evaluator|classified:\s*true|olderTransferFeeBasisPoints:\s*null/);
    expect(source).toMatch(/readOnly:\s*true/);
    expect(source).toMatch(/query_only/);
    expect(source).toMatch(/ORDER BY code ASC/);
  });

  it('verifies a stored s07_v1 definition and refuses a mismatched fingerprint without changing it', () => {
    const path = tempDbPath();
    const repository = openWriteRepo(path);
    repository.recordStrategyBundle(passingBundle());
    const before = repository.getTableCounts();
    repository.close();
    openRepos.pop();

    const config = prepareBacktestCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path });
    const ok = executeHistoricalBacktest(config, ['node', 'run.ts', WRAPPED_SOL_MINT]);
    expect(ok.scope).toEqual({ kind: 'token', tokenMint: WRAPPED_SOL_MINT });

    const writable = new DatabaseSync(path);
    writable.prepare('UPDATE strategy_definitions SET definition_fingerprint = ? WHERE strategy_version = ?').run(
      '0'.repeat(64),
      's07_v1',
    );
    writable.close();

    expect(() => executeHistoricalBacktest(config, ['node', 'run.ts'])).toThrow(/will not change it/);

    const after = openWriteRepo(path);
    expect(after.getTableCounts().strategyDefinitions).toBe(before.strategyDefinitions);
    expect(after.getTableCounts().strategyEvaluations).toBe(before.strategyEvaluations);
  });
});
