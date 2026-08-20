import type { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_DATABASE_PATH } from '../src/config/defaults.js';
import {
  RW0_LEGACY_SPEC_VERSION,
  RW0_LEGACY_WATCHER_DEFINITION_FINGERPRINT,
  RW0_SCHEMA_VERSION,
  RW0_SPEC_VERSION,
} from '../src/recovery-watcher/constants.js';
import {
  activateRecoveryDatasetRuntime,
  buildRecoveryDatasetManifest,
  currentRecoveryMigrationIdentities,
  initializeRecoveryDatasetManifest,
  inspectRecoveryDatasetManifest,
  requireRecoveryDatasetManifest,
  recoveryRetainedBindingFingerprint,
  RW0_DATASET_MANIFEST_SCHEMA_DIGEST,
  RW0_DATASET_MANIFEST_VERSION,
  RW0_RETAINED_BINDING_CONTRACT_DIGEST,
  RW0_RETAINED_BINDING_CONTRACT_VERSION,
} from '../src/recovery-watcher/dataset-manifest.js';
import {
  initializeRecoveryDatabase,
  openRecoveryMemoryDatabase,
  openRecoverySqlite,
} from '../src/recovery-watcher/db/database.js';
import {
  RW0_MIGRATIONS,
  recoveryMigrationSqlDigest,
} from '../src/recovery-watcher/db/migrations.js';
import {
  RECOVERY_V0_SIGNAL_FINGERPRINT,
  RW0_SAFETY_SPEC_FINGERPRINT,
  RW0_WATCHER_DEFINITION_FINGERPRINT,
  recoveryScreeningId,
} from '../src/recovery-watcher/identity.js';
import {
  listScreeningObservations,
  loadRecoveryReportSnapshot,
  persistScreeningObservation,
} from '../src/recovery-watcher/persistence.js';
import { runRecoveryWatcher } from '../src/recovery-watcher/runtime.js';
import type {
  RecoveryWatcherConfig,
  ScreeningObservationRecord,
} from '../src/recovery-watcher/types.js';
import { tempRecoveryDatabasePath } from './recovery-watcher-fixtures.js';

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
    expect(hydrated.bindingContractVersion).toBe(RW0_RETAINED_BINDING_CONTRACT_VERSION);
    expect(hydrated.bindingContractDigest).toBe(RW0_RETAINED_BINDING_CONTRACT_DIGEST);
    expect(
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM sqlite_schema
           WHERE type = 'trigger'
             AND name LIKE 'rw0_retained_bind_%'
             AND name NOT LIKE 'rw0_retained_binding_%'`,
        )
        .get()?.['count'],
    ).toBe(9);
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

  it('rejects an after-start row injected without a durable runtime binding', () => {
    const db = database();
    initializeRecoveryDatasetManifest(db, buildRecoveryDatasetManifest(BASE));
    const triggerSql = requireSchemaSql(db, 'trigger', 'rw0_retained_bind_screening_observations');
    db.exec('DROP TRIGGER rw0_retained_bind_screening_observations');
    insertCurrentScreeningSql(db, currentScreening(BASE.startAt));
    db.exec(triggerSql);
    expect(() =>
      loadRecoveryReportSnapshot(db, { now: new Date(BASE.startAt), databasePath: ':memory:' }),
    ).toThrow(/no durable dataset binding/);
  });

  it('prevents copied smoke/test rows on a non-runtime SQLite connection', () => {
    const path = tempRecoveryDatabasePath();
    const retained = openRecoverySqlite(path, { configuredProductionPath: DEFAULT_DATABASE_PATH });
    open.push(retained);
    initializeRecoveryDatabase(retained);
    initializeRecoveryDatasetManifest(
      retained,
      buildRecoveryDatasetManifest({ ...BASE, databasePath: path }),
    );
    const direct = openRecoverySqlite(path, { configuredProductionPath: DEFAULT_DATABASE_PATH });
    open.push(direct);
    expect(() => {
      insertCurrentScreeningSql(direct, currentScreening(BASE.startAt));
    }).toThrow();
    expect(listScreeningObservations(retained)).toEqual([]);
    expect(
      loadRecoveryReportSnapshot(retained, {
        now: new Date(BASE.startAt),
        databasePath: path,
      }).screeningCount,
    ).toBe(0);
  });

  it.each([
    ['dataset_id', 'another-dataset'],
    ['manifest_fingerprint', 'a'.repeat(64)],
  ])('rejects a binding with wrong cross-dataset provenance in %s', (column, value) => {
    const db = database();
    const manifest = buildRecoveryDatasetManifest(BASE);
    initializeRecoveryDatasetManifest(db, manifest);
    activateRecoveryDatasetRuntime(db, manifest, new Date(BASE.startAt));
    persistScreeningObservation(db, currentScreening(BASE.startAt), {
      now: new Date(BASE.startAt),
    });
    db.prepare(`UPDATE rw0_retained_evidence_bindings SET ${column} = ?`).run(value);
    expect(() => inspectRecoveryDatasetManifest(db, ':memory:')).toThrow(
      /exact dataset provenance/,
    );
  });

  it('rejects a forged binding for a copied pre-start row at hydration', () => {
    const db = database();
    const manifest = buildRecoveryDatasetManifest(BASE);
    initializeRecoveryDatasetManifest(db, manifest);
    activateRecoveryDatasetRuntime(db, manifest, new Date(BASE.startAt));
    const row = currentScreening('2026-08-20T08:59:59.999Z');
    const triggerSql = requireSchemaSql(db, 'trigger', 'rw0_retained_bind_screening_observations');
    db.exec('DROP TRIGGER rw0_retained_bind_screening_observations');
    insertCurrentScreeningSql(db, row);
    db.exec(triggerSql);
    db.prepare(
      `INSERT INTO rw0_retained_evidence_bindings (
        table_name, row_identity, row_timestamp, dataset_id, evidence_class,
        manifest_fingerprint, binding_fingerprint, bound_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'rw0_screening_observations',
      row.screeningId,
      row.screenedAt,
      manifest.datasetId,
      manifest.evidenceClass,
      manifest.manifestFingerprint,
      recoveryRetainedBindingFingerprint(manifest, {
        tableName: 'rw0_screening_observations',
        rowIdentity: row.screeningId,
        rowTimestamp: row.screenedAt,
      }),
      row.screenedAt,
    );
    expect(() => inspectRecoveryDatasetManifest(db, ':memory:')).toThrow(
      /before manifest start_at/,
    );
  });

  it('rejects legitimate persistence before startAt without retaining the row', () => {
    const db = database();
    const manifest = buildRecoveryDatasetManifest(BASE);
    initializeRecoveryDatasetManifest(db, manifest);
    activateRecoveryDatasetRuntime(db, manifest, new Date(BASE.startAt));
    const beforeStart = currentScreening('2026-08-20T08:59:59.999Z');
    expect(() =>
      persistScreeningObservation(db, beforeStart, { now: new Date(BASE.startAt) }),
    ).toThrow();
    expect(listScreeningObservations(db)).toEqual([]);
  });

  it('binds a legitimate retained runtime row at startAt and accepts the report', () => {
    const db = database();
    const manifest = buildRecoveryDatasetManifest(BASE);
    initializeRecoveryDatasetManifest(db, manifest);
    activateRecoveryDatasetRuntime(db, manifest, new Date(BASE.startAt));
    const row = currentScreening(BASE.startAt);
    expect(persistScreeningObservation(db, row, { now: new Date(BASE.startAt) }).idempotent).toBe(
      false,
    );
    const binding = db
      .prepare('SELECT * FROM rw0_retained_evidence_bindings WHERE row_identity = ?')
      .get(row.screeningId);
    expect(binding).toMatchObject({
      table_name: 'rw0_screening_observations',
      row_identity: row.screeningId,
      row_timestamp: row.screenedAt,
      dataset_id: manifest.datasetId,
      evidence_class: 'retained_forward',
      manifest_fingerprint: manifest.manifestFingerprint,
    });
    expect(
      loadRecoveryReportSnapshot(db, {
        now: new Date(BASE.startAt),
        databasePath: ':memory:',
      }).screeningCount,
    ).toBe(1);
  });

  it('fails runtime before startAt before the provider factory is initialized', async () => {
    const path = tempRecoveryDatabasePath();
    const db = openRecoverySqlite(path, { configuredProductionPath: DEFAULT_DATABASE_PATH });
    initializeRecoveryDatabase(db);
    initializeRecoveryDatasetManifest(
      db,
      buildRecoveryDatasetManifest({ ...BASE, databasePath: path }),
    );
    db.close();
    let providerFactoryCalled = false;
    await expect(
      runRecoveryWatcher({
        config: retainedConfig(path),
        once: true,
        clock: { now: () => new Date('2026-08-20T08:59:59.999Z') },
        liveness: { isAlive: () => false },
        pid: 616161,
        processStartedAtMs: 16,
        providerFactory: () => {
          providerFactoryCalled = true;
          throw new Error('provider factory must not initialize');
        },
      }),
    ).rejects.toThrow(/before the dataset manifest start_at/);
    expect(providerFactoryCalled).toBe(false);
  });
});

function currentScreening(screenedAt: string): ScreeningObservationRecord {
  const mint = 'So11111111111111111111111111111111111111112';
  return {
    screeningId: recoveryScreeningId({
      mint,
      screenedAt,
      signalFingerprint: RECOVERY_V0_SIGNAL_FINGERPRINT,
      watcherSpecFingerprint: RW0_WATCHER_DEFINITION_FINGERPRINT,
    }),
    mint,
    screenedAt,
    discoverySources: '["dexscreener_profile"]',
    provider: null,
    source: null,
    pairAddress: null,
    priceUsd: null,
    liquidityUsd: null,
    volume5mUsd: null,
    priceChange5mPct: null,
    signalVersion: 'recovery_v0',
    signalFingerprint: RECOVERY_V0_SIGNAL_FINGERPRINT,
    watcherSpecVersion: RW0_SPEC_VERSION,
    watcherSpecFingerprint: RW0_WATCHER_DEFINITION_FINGERPRINT,
    dipFilterResult: 'NOT_EVALUATED',
    disposition: 'MARKET_UNAVAILABLE',
    reason: 'hostile retained provenance fixture',
    collectedAtIsLocalCollectionTime: true,
  };
}

function insertCurrentScreeningSql(database: DatabaseSync, row: ScreeningObservationRecord): void {
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
      row.screeningId,
      row.mint,
      row.screenedAt,
      row.discoverySources,
      row.provider,
      row.source,
      row.pairAddress,
      row.priceUsd,
      row.liquidityUsd,
      row.volume5mUsd,
      row.priceChange5mPct,
      row.signalVersion,
      row.signalFingerprint,
      row.watcherSpecVersion,
      row.watcherSpecFingerprint,
      row.dipFilterResult,
      row.disposition,
      row.reason,
      1,
    );
}

function requireSchemaSql(database: DatabaseSync, type: 'table' | 'trigger', name: string): string {
  const sql = database
    .prepare('SELECT sql FROM sqlite_schema WHERE type = ? AND name = ?')
    .get(type, name)?.['sql'];
  if (typeof sql !== 'string') throw new Error(`missing schema object ${name}`);
  return sql;
}

function retainedConfig(path: string): RecoveryWatcherConfig {
  return {
    tradingEnabled: false,
    liveBroadcastEnabled: false,
    databasePath: path,
    configuredProductionDatabasePath: DEFAULT_DATABASE_PATH,
    networkTimeoutMs: 10_000,
    screeningMaxCandidates: 20,
  };
}

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
