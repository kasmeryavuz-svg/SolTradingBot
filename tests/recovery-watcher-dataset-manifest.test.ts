import type { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RW0_LEGACY_SPEC_VERSION,
  RW0_LEGACY_WATCHER_DEFINITION_FINGERPRINT,
  RW0_SCHEMA_VERSION,
} from '../src/recovery-watcher/constants.js';
import {
  buildRecoveryDatasetManifest,
  currentRecoveryMigrationIdentities,
  initializeRecoveryDatasetManifest,
  inspectRecoveryDatasetManifest,
  requireRecoveryDatasetManifest,
  RW0_DATASET_MANIFEST_SCHEMA_DIGEST,
  RW0_DATASET_MANIFEST_VERSION,
} from '../src/recovery-watcher/dataset-manifest.js';
import {
  initializeRecoveryDatabase,
  openRecoveryMemoryDatabase,
} from '../src/recovery-watcher/db/database.js';
import {
  RW0_MIGRATIONS,
  recoveryMigrationSqlDigest,
} from '../src/recovery-watcher/db/migrations.js';
import {
  RECOVERY_V0_SIGNAL_FINGERPRINT,
  RW0_SAFETY_SPEC_FINGERPRINT,
  RW0_WATCHER_DEFINITION_FINGERPRINT,
} from '../src/recovery-watcher/identity.js';
import {
  listScreeningObservations,
  loadRecoveryReportSnapshot,
} from '../src/recovery-watcher/persistence.js';

const open: DatabaseSync[] = [];
const BASE = {
  datasetId: 'cry-7-forward-001',
  createdAt: '2026-08-20T08:00:00.000Z',
  startAt: '2026-08-20T09:00:00.000Z',
  evidenceClass: 'retained_forward' as const,
  databasePath: ':memory:',
};

afterEach(() => {
  for (const database of open.splice(0)) database.close();
});

function database(): DatabaseSync {
  const value = openRecoveryMemoryDatabase();
  initializeRecoveryDatabase(value);
  open.push(value);
  return value;
}

describe('Recovery Watcher retained forward-evidence manifest', () => {
  it('is exactly idempotent for an identical retry and rejects a conflicting retry', () => {
    const db = database();
    const manifest = buildRecoveryDatasetManifest(BASE);
    expect(initializeRecoveryDatasetManifest(db, manifest).idempotent).toBe(false);
    expect(initializeRecoveryDatasetManifest(db, manifest).idempotent).toBe(true);
    const conflict = buildRecoveryDatasetManifest({ ...BASE, datasetId: 'cry-7-forward-002' });
    expect(() => initializeRecoveryDatasetManifest(db, conflict)).toThrow(/conflicts/);
  });

  it('persists every frozen identity and every recovery migration digest', () => {
    const db = database();
    const manifest = buildRecoveryDatasetManifest(BASE);
    initializeRecoveryDatasetManifest(db, manifest);
    const hydrated = requireRecoveryDatasetManifest(db, ':memory:');
    expect(hydrated).toEqual(manifest);
    expect(hydrated.manifestVersion).toBe(RW0_DATASET_MANIFEST_VERSION);
    expect(hydrated.manifestSchemaDigest).toBe(RW0_DATASET_MANIFEST_SCHEMA_DIGEST);
    expect(hydrated.watcherSpecFingerprint).toBe(RW0_WATCHER_DEFINITION_FINGERPRINT);
    expect(hydrated.safetySpecFingerprint).toBe(RW0_SAFETY_SPEC_FINGERPRINT);
    expect(hydrated.signalFingerprint).toBe(RECOVERY_V0_SIGNAL_FINGERPRINT);
    expect(hydrated.recoverySchemaVersion).toBe(RW0_SCHEMA_VERSION);
    expect(hydrated.recoveryMigrations).toEqual(currentRecoveryMigrationIdentities());
  });

  it.each([
    ['watcher_spec_version', 'rw0_v1'],
    ['watcher_spec_fingerprint', '0'.repeat(64)],
    ['safety_spec_version', 'rw0_safety_v1'],
    ['safety_spec_fingerprint', '1'.repeat(64)],
    ['signal_version', 'recovery_v999'],
    ['signal_fingerprint', '2'.repeat(64)],
    ['recovery_schema_version', 1],
    ['recovery_migration_digests_json', '[]'],
    ['manifest_schema_digest', '3'.repeat(64)],
    ['manifest_fingerprint', '4'.repeat(64)],
  ])('fails status/report hydration after SQL tampering of %s', (column, value) => {
    const db = database();
    initializeRecoveryDatasetManifest(db, buildRecoveryDatasetManifest(BASE));
    db.prepare(`UPDATE rw0_dataset_manifest SET ${column} = ?`).run(value);
    expect(() => inspectRecoveryDatasetManifest(db, ':memory:')).toThrow(/manifest/);
    expect(() =>
      loadRecoveryReportSnapshot(db, { now: new Date(BASE.startAt), databasePath: ':memory:' }),
    ).toThrow(/manifest/);
  });

  it('fails closed on database path and applied migration identity mismatches', () => {
    const db = database();
    initializeRecoveryDatasetManifest(db, buildRecoveryDatasetManifest(BASE));
    expect(() => inspectRecoveryDatasetManifest(db, 'C:/other/recovery.sqlite')).toThrow(
      /manifest/,
    );
    db.prepare('UPDATE rw0_schema_migrations SET sql_digest = ? WHERE version = 2').run(
      '0'.repeat(64),
    );
    expect(() => inspectRecoveryDatasetManifest(db, ':memory:')).toThrow(/migration 2 digest/);
  });

  it('detects direct SQL changes to the manifest table contract', () => {
    const db = database();
    initializeRecoveryDatasetManifest(db, buildRecoveryDatasetManifest(BASE));
    db.exec('ALTER TABLE rw0_dataset_manifest ADD COLUMN forged_note TEXT');
    expect(() => inspectRecoveryDatasetManifest(db, ':memory:')).toThrow(/table schema/);
  });

  it('will not promote a populated provenance-free database to retained evidence', () => {
    const db = database();
    insertLegacyScreening(db);
    expect(inspectRecoveryDatasetManifest(db, ':memory:')).toEqual({
      evidenceClass: 'unclassified',
      populated: true,
      manifest: null,
    });
    expect(() => initializeRecoveryDatasetManifest(db, buildRecoveryDatasetManifest(BASE))).toThrow(
      /populated recovery database without provenance/,
    );
  });

  it.each(['disposable', 'test'] as const)(
    'will not relabel a %s dataset as retained_forward',
    (evidenceClass) => {
      const db = database();
      initializeRecoveryDatasetManifest(
        db,
        buildRecoveryDatasetManifest({ ...BASE, evidenceClass }),
      );
      expect(() =>
        initializeRecoveryDatasetManifest(db, buildRecoveryDatasetManifest(BASE)),
      ).toThrow(/conflicts/);
    },
  );

  it('keeps rw0_v1 rows readable but excludes them from retained/current provenance', () => {
    const db = database();
    insertLegacyScreening(db);
    const rows = listScreeningObservations(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.watcherSpecVersion).toBe(RW0_LEGACY_SPEC_VERSION);
    expect(() => requireRecoveryDatasetManifest(db, ':memory:')).toThrow(/requires an initialized/);
    expect(() => initializeRecoveryDatasetManifest(db, buildRecoveryDatasetManifest(BASE))).toThrow(
      /cannot become retained_forward/,
    );
  });

  it('leaves recovery schema 2 and its two frozen migrations unchanged', () => {
    expect(RW0_SCHEMA_VERSION).toBe(2);
    expect(RW0_MIGRATIONS.map(({ version }) => version)).toEqual([1, 2]);
    expect(recoveryMigrationSqlDigest(1)).toBe(
      '84832895ff70d1d6362058699a2301ed590eb3b5e6ce70bf598b2eb41060f234',
    );
    expect(recoveryMigrationSqlDigest(2)).toBe(
      'bea11ee4cb756d12560b238e205085d0c9446f2d3ad80934e87c0e68ab9a626a',
    );
  });
});

function insertLegacyScreening(database: DatabaseSync): void {
  database
    .prepare(
      `INSERT INTO rw0_screening_observations (
    screening_id, mint, screened_at, discovery_sources, provider, source, pair_address,
    price_usd, liquidity_usd, volume_5m_usd, price_change_5m_pct, signal_version,
    signal_fingerprint, watcher_spec_version, watcher_spec_fingerprint, dip_filter_result,
    disposition, reason, collected_at_is_local_collection_time
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'legacy-screening',
      'LegacyMint1111111111111111111111111111111',
      BASE.createdAt,
      '["profile"]',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      'recovery_v0',
      RECOVERY_V0_SIGNAL_FINGERPRINT,
      RW0_LEGACY_SPEC_VERSION,
      RW0_LEGACY_WATCHER_DEFINITION_FINGERPRINT,
      'NOT_EVALUATED',
      'MARKET_UNAVAILABLE',
      'legacy row remains readable',
      1,
    );
}
