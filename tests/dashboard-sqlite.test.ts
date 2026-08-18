import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyMigrations,
  LATEST_SCHEMA_VERSION,
  migrationSqlDigest,
  openSqliteDatabase,
} from '../src/persistence/sqlite/index.js';
import {
  openReadOnlyDashboardDatabase,
  tryOpenSqliteDashboardDataSource,
} from '../src/dashboard/index.js';
import { cleanupDashboardHarness, dashboardTempDbPath, openDashboardWriteRepo } from './dashboard-harness.js';

afterEach(async () => {
  await cleanupDashboardHarness();
});

describe('dashboard sqlite read-only source', () => {
  it('keeps frozen migration hashes 001-008 after wallet-intelligence schema 9', () => {
    expect(LATEST_SCHEMA_VERSION).toBe(9);
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

  it('does not create a missing database file', () => {
    const path = dashboardTempDbPath();
    const opened = tryOpenSqliteDashboardDataSource({
      enabled: true,
      path,
      busyTimeoutMs: 1000,
    });
    expect(opened.source).toBeNull();
    expect(opened.reason).toBe('Database file is not available.');
    expect(existsSync(path)).toBe(false);
  });

  it('rejects writes on the dashboard handle', () => {
    const path = dashboardTempDbPath();
    openDashboardWriteRepo(path).close();
    const source = openReadOnlyDashboardDatabase({ path, busyTimeoutMs: 1000 });
    expect(source.queryOnlyEnabled()).toBe(true);
    expect(source.inspectSchema().compatible).toBe(true);
    expect(() => {
      source.execForHostileTests(
        "INSERT INTO tokens (chain, mint, first_observed_at, last_observed_at, created_at) VALUES ('solana', 'x', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
      );
    }).toThrow();
    expect(() => {
      source.execForHostileTests('UPDATE tokens SET mint = mint');
    }).toThrow();
    expect(() => {
      source.execForHostileTests('DELETE FROM tokens');
    }).toThrow();
    expect(() => {
      source.execForHostileTests('CREATE TABLE dashboard_sessions (id INTEGER)');
    }).toThrow();
    expect(() => {
      source.execForHostileTests('DROP TABLE tokens');
    }).toThrow();
    expect(() => {
      source.execForHostileTests('ALTER TABLE tokens ADD COLUMN dashboard_note TEXT');
    }).toThrow();
    source.close();
  });

  it('marks schema 6 as incompatible without mutating it', () => {
    const path = dashboardTempDbPath();
    const database = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
    applyMigrations(database, { targetVersion: 6 });
    database.close();
    const source = openReadOnlyDashboardDatabase({ path, busyTimeoutMs: 1000 });
    const inspection = source.inspectSchema();
    expect(inspection.compatible).toBe(false);
    expect(inspection.schemaVersion).toBe(6);
    source.close();
  });

  it('accepts schema 7 and extra future columns', () => {
    const path = dashboardTempDbPath();
    openDashboardWriteRepo(path).close();
    const writable = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
    writable.exec('ALTER TABLE market_snapshots ADD COLUMN extra_dashboard TEXT');
    writable.close();
    const source = openReadOnlyDashboardDatabase({ path, busyTimeoutMs: 1000 });
    expect(source.inspectSchema().compatible).toBe(true);
    source.close();
  });
});
