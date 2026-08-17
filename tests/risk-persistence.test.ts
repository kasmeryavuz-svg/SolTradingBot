import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { FINDING_CODES, SPL_TOKEN_PROGRAM_ID } from '../src/risk/constants.js';
import {
  createSqlitePersistenceRepository,
  PersistenceError,
  SqlitePersistenceRepository,
} from '../src/persistence/index.js';
import { applyMigrations, openSqliteDatabase } from '../src/persistence/sqlite/index.js';
import { sampleReport } from './risk-fixtures.js';

const openRepos: SqlitePersistenceRepository[] = [];

function openMemoryRepo(): SqlitePersistenceRepository {
  const repository = createSqlitePersistenceRepository({
    path: ':memory:',
    busyTimeoutMs: 1000,
  });
  repository.initialize();
  openRepos.push(repository);
  return repository;
}

afterEach(() => {
  while (openRepos.length > 0) {
    openRepos.pop()?.close();
  }
});

describe('risk persistence', () => {
  it('persists checks, extensions, top accounts, findings, and raw TEXT amounts', () => {
    const repository = openMemoryRepo();
    const recorded = repository.recordRiskReport(sampleReport({
      mintAuthority: USDC_MINT,
      supplyRaw: '18446744073709551615',
      extensions: [{
        name: 'TransferFeeConfig',
        rawName: 'transferFeeConfig',
        authority: null,
        programId: null,
        state: null,
        transferFeeBasisPoints: 150,
        maximumFeeRaw: '1000',
        olderTransferFeeBasisPoints: null,
        newerTransferFeeBasisPoints: 150,
        olderMaximumFeeRaw: null,
        newerMaximumFeeRaw: '1000',
        parsed: true,
        classified: true,
      }],
      findings: [{
        code: FINDING_CODES.MINT_AUTHORITY_ACTIVE,
        category: 'authority',
        severity: 'high',
        confidence: 'high',
        title: 'Mint authority is active',
        description: 'There is currently a mint authority capable of minting additional supply.',
      }],
      highestFindingSeverity: 'high',
    }));

    const history = repository.getRiskHistory(WRAPPED_SOL_MINT, 20);
    expect(recorded.tokenInserted).toBe(true);
    expect(history?.scans).toHaveLength(1);
    expect(history?.scans[0]?.supplyRaw).toBe('18446744073709551615');
    expect(history?.scans[0]?.checks).toHaveLength(3);
    expect(history?.scans[0]?.extensions[0]?.transferFeeBasisPoints).toBe(150);
    expect(history?.scans[0]?.findings[0]?.code).toBe(FINDING_CODES.MINT_AUTHORITY_ACTIVE);
    expect(repository.getStats().riskScanCount).toBe(1);
    expect(history?.token.firstObservedAt).toBe(sampleReport().scannedAt);
  });

  it('keeps null risk fields as SQL NULL and bounds history newest-first', () => {
    const repository = openMemoryRepo();
    repository.recordRiskReport(sampleReport({
      scannedAt: '2026-08-17T10:00:00.000Z',
      supplyRaw: null,
      supplyContextSlot: null,
      concentration: null,
      concentrationUnavailableReason: 'supply unavailable',
      largestTokenAccounts: [],
      dataCompleteness: 'partial',
      checks: [
        { check: 'mint_account', ok: true, contextSlot: 100, error: null },
        { check: 'supply', ok: false, contextSlot: null, error: 'unavailable' },
        { check: 'largest_accounts', ok: true, contextSlot: 102, error: null },
      ],
    }));
    repository.recordRiskReport(sampleReport({ scannedAt: '2026-08-17T11:00:00.000Z' }));
    repository.recordRiskReport(sampleReport({ scannedAt: '2026-08-17T12:00:00.000Z' }));

    const history = repository.getRiskHistory(WRAPPED_SOL_MINT, 2);
    expect(history?.scans.map((scan) => scan.scannedAt)).toEqual([
      '2026-08-17T12:00:00.000Z',
      '2026-08-17T11:00:00.000Z',
    ]);
    expect(repository.getRiskHistory(WRAPPED_SOL_MINT, 1000)?.scans).toHaveLength(3);
    expect(repository.getRiskHistory(USDC_MINT, 20)).toBeNull();
  });

  it('rolls back a failed risk transaction including token timestamp changes', () => {
    const repository = openMemoryRepo();
    repository.recordRiskReport(sampleReport());
    const before = repository.getToken(WRAPPED_SOL_MINT);
    const counts = repository.getTableCounts();

    expect(() => {
      repository.recordRiskReportAndAbort(sampleReport({ scannedAt: '2026-08-17T13:00:00.000Z' }));
    }).toThrow(/Test-forced write failure/);

    expect(repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt).toBe(before?.lastObservedAt);
    expect(repository.getTableCounts()).toEqual(counts);
  });

  it('rolls back after a parent scan and one child insert', () => {
    const repository = openMemoryRepo();
    repository.recordRiskReport(sampleReport());
    const before = repository.getToken(WRAPPED_SOL_MINT);
    const counts = repository.getTableCounts();

    expect(() => {
      repository.recordRiskReportAndAbortAfterChild(
        sampleReport({ scannedAt: '2026-08-17T13:30:00.000Z' }),
      );
    }).toThrow(/after child insert/);

    expect(repository.getToken(WRAPPED_SOL_MINT)?.firstObservedAt).toBe(before?.firstObservedAt);
    expect(repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt).toBe(before?.lastObservedAt);
    expect(repository.getTableCounts()).toEqual(counts);
    expect(counts.riskScans).toBe(1);
    expect(counts.riskScanChecks).toBe(3);
    expect(counts.riskTopTokenAccounts).toBe(1);
  });

  it('fails clearly on a duplicate scan identity instead of ignoring it', () => {
    const repository = openMemoryRepo();
    repository.recordRiskReport(sampleReport());
    expect(() => {
      repository.recordRiskReport(sampleReport());
    }).toThrow(PersistenceError);
    expect(repository.getStats().riskScanCount).toBe(1);
  });

  it('rejects non-finite numeric risk data before writing', () => {
    const repository = openMemoryRepo();
    expect(() => {
      repository.recordRiskReport(sampleReport({
        mintContextSlot: Number.NaN,
      }));
    }).toThrow(PersistenceError);
    expect(repository.getStats().riskScanCount).toBe(0);
  });

  it('enforces risk_scans CHECK constraints', () => {
    const repository = openMemoryRepo();
    repository.recordRiskReport(sampleReport());
    const database = openSqliteDatabase({ path: ':memory:', busyTimeoutMs: 1000 });
    applyMigrations(database);
    database.prepare(
      `INSERT INTO tokens (chain, mint, first_observed_at, last_observed_at, created_at)
       VALUES ('solana', ?, ?, ?, ?)`,
    ).run(WRAPPED_SOL_MINT, '2026-08-17T10:00:00.000Z', '2026-08-17T10:00:00.000Z', '2026-08-17T10:00:00.000Z');

    expect(() => {
      database.prepare(
        `INSERT INTO risk_scans (
          token_id, scanned_at, commitment, token_program, program_owner, mint_context_slot,
          decimals, largest_accounts_count, data_completeness, highest_finding_severity
        ) VALUES (1, ?, 'processed', 'spl_token', ?, 1, 6, 0, 'complete', 'none')`,
      ).run('2026-08-17T10:00:00.000Z', SPL_TOKEN_PROGRAM_ID);
    }).toThrow(/CHECK|constraint/i);
    database.close();
  });

  it('upgrades a populated v1 database to v2 without deleting existing rows', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-risk-mig-'));
    const path = join(directory, 'history.sqlite');
    const raw = openSqliteDatabase({ path, busyTimeoutMs: 1000 });

    try {
      applyMigrations(raw, { targetVersion: 1 });
      expect(raw.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.['version']).toBe(1);
      raw.prepare(
        `INSERT INTO tokens (chain, mint, first_observed_at, last_observed_at, created_at)
         VALUES ('solana', ?, ?, ?, ?)`,
      ).run(WRAPPED_SOL_MINT, '2026-08-17T09:00:00.000Z', '2026-08-17T09:00:00.000Z', '2026-08-17T09:00:00.000Z');
      raw.prepare(
        'INSERT INTO discovery_runs (observed_at, recorded_at, candidate_count) VALUES (?, ?, 1)',
      ).run('2026-08-17T09:00:00.000Z', '2026-08-17T09:00:00.000Z');
      const tokenCount = raw.prepare('SELECT COUNT(*) AS count FROM tokens').get()?.['count'];
      raw.close();

      const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
      try {
        repository.initialize();
        repository.initialize();

        expect(repository.getStats().schemaVersion).toBe(3);
        expect(repository.getTableCounts().schemaMigrations).toBe(3);
        expect(repository.getStats().tokenCount).toBe(tokenCount);
        expect(repository.getToken(WRAPPED_SOL_MINT)?.mint).toBe(WRAPPED_SOL_MINT);

        const recorded = repository.recordRiskReport(sampleReport({
          scannedAt: '2026-08-17T14:00:00.000Z',
        }));
        expect(recorded.tokenInserted).toBe(false);
        expect(repository.getRiskHistory(WRAPPED_SOL_MINT, 20)?.scans).toHaveLength(1);
        expect(repository.getStats().integrity.ok).toBe(true);
      } finally {
        repository.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
