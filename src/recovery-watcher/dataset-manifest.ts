import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import {
  RECOVERY_V0_SIGNAL_VERSION,
  RW0_SAFETY_SPEC_VERSION,
  RW0_SCHEMA_VERSION,
  RW0_SPEC_VERSION,
} from './constants.js';
import { RecoveryWatcherError } from './errors.js';
import {
  RECOVERY_V0_SIGNAL_FINGERPRINT,
  RW0_SAFETY_SPEC_FINGERPRINT,
  RW0_WATCHER_DEFINITION_FINGERPRINT,
  fingerprintCanonicalJson,
} from './identity.js';
import {
  RW0_MIGRATIONS,
  assertRecoveryMigrationIntegrity,
  recoveryMigrationSqlDigest,
} from './db/migrations.js';

export const RW0_DATASET_MANIFEST_VERSION = 'rw0_dataset_manifest_v1';
export const RW0_DATASET_EVIDENCE_CLASSES = ['retained_forward', 'disposable', 'test'] as const;

export type RecoveryDatasetEvidenceClass = (typeof RW0_DATASET_EVIDENCE_CLASSES)[number];
export type RecoveryMigrationIdentity = { version: number; name: string; sqlDigest: string };
export type RecoveryDatasetManifest = {
  manifestVersion: string;
  manifestSchemaDigest: string;
  datasetId: string;
  createdAt: string;
  startAt: string;
  evidenceClass: RecoveryDatasetEvidenceClass;
  watcherSpecVersion: string;
  watcherSpecFingerprint: string;
  safetySpecVersion: string;
  safetySpecFingerprint: string;
  signalVersion: string;
  signalFingerprint: string;
  recoverySchemaVersion: number;
  recoveryMigrations: readonly RecoveryMigrationIdentity[];
  databasePathFingerprint: string;
  manifestFingerprint: string;
};

export type RecoveryDatasetMetadata = {
  evidenceClass: RecoveryDatasetEvidenceClass | 'unclassified';
  populated: boolean;
  manifest: RecoveryDatasetManifest | null;
};

const MANIFEST_TABLE_SQL = `CREATE TABLE rw0_dataset_manifest (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  manifest_version TEXT NOT NULL,
  manifest_schema_digest TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  start_at TEXT NOT NULL,
  evidence_class TEXT NOT NULL CHECK (evidence_class IN ('retained_forward', 'disposable', 'test')),
  watcher_spec_version TEXT NOT NULL,
  watcher_spec_fingerprint TEXT NOT NULL,
  safety_spec_version TEXT NOT NULL,
  safety_spec_fingerprint TEXT NOT NULL,
  signal_version TEXT NOT NULL,
  signal_fingerprint TEXT NOT NULL,
  recovery_schema_version INTEGER NOT NULL,
  recovery_migration_digests_json TEXT NOT NULL CHECK (json_valid(recovery_migration_digests_json)),
  database_path_fingerprint TEXT NOT NULL,
  manifest_fingerprint TEXT NOT NULL
) STRICT;`;

export const RW0_DATASET_MANIFEST_SCHEMA_DIGEST = sha256(
  canonicalManifestTableSql(MANIFEST_TABLE_SQL),
);

const DATA_TABLES = [
  'rw0_episodes',
  'rw0_state_transitions',
  'rw0_market_observations',
  'rw0_safety_evidence',
  'rw0_shadow_positions',
  'rw0_shadow_exit_observations',
  'rw0_screening_observations',
  'rw0_safety_evidence_v2',
  'rw0_safety_decisions',
] as const;

export function currentRecoveryMigrationIdentities(): readonly RecoveryMigrationIdentity[] {
  return RW0_MIGRATIONS.map((migration) => ({
    version: migration.version,
    name: migration.name,
    sqlDigest: recoveryMigrationSqlDigest(migration.version),
  }));
}

export function recoveryDatabasePathFingerprint(path: string): string {
  const resolvedPath = path === ':memory:' ? path : resolve(path).replaceAll('\\', '/');
  const normalized = process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
  return sha256(normalized);
}

export function buildRecoveryDatasetManifest(input: {
  datasetId: string;
  createdAt: string;
  startAt: string;
  evidenceClass: RecoveryDatasetEvidenceClass;
  databasePath: string;
}): RecoveryDatasetManifest {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.datasetId)) {
    throw manifestError('RW0_DATASET_ID must be 1-128 safe identifier characters.');
  }
  const createdAt = canonicalInstant(input.createdAt, 'RW0_DATASET_CREATED_AT');
  const startAt = canonicalInstant(input.startAt, 'RW0_DATASET_START_AT');
  if (Date.parse(createdAt) > Date.parse(startAt)) {
    throw manifestError('Dataset created_at must be at or before start_at.');
  }
  if (!RW0_DATASET_EVIDENCE_CLASSES.includes(input.evidenceClass)) {
    throw manifestError('Dataset evidence class is invalid.');
  }
  const unsigned = {
    manifestVersion: RW0_DATASET_MANIFEST_VERSION,
    manifestSchemaDigest: RW0_DATASET_MANIFEST_SCHEMA_DIGEST,
    datasetId: input.datasetId,
    createdAt,
    startAt,
    evidenceClass: input.evidenceClass,
    watcherSpecVersion: RW0_SPEC_VERSION,
    watcherSpecFingerprint: RW0_WATCHER_DEFINITION_FINGERPRINT,
    safetySpecVersion: RW0_SAFETY_SPEC_VERSION,
    safetySpecFingerprint: RW0_SAFETY_SPEC_FINGERPRINT,
    signalVersion: RECOVERY_V0_SIGNAL_VERSION,
    signalFingerprint: RECOVERY_V0_SIGNAL_FINGERPRINT,
    recoverySchemaVersion: RW0_SCHEMA_VERSION,
    recoveryMigrations: currentRecoveryMigrationIdentities(),
    databasePathFingerprint: recoveryDatabasePathFingerprint(input.databasePath),
  };
  return { ...unsigned, manifestFingerprint: fingerprintCanonicalJson(unsigned) };
}

export function initializeRecoveryDatasetManifest(
  database: DatabaseSync,
  requested: RecoveryDatasetManifest,
): { idempotent: boolean; manifest: RecoveryDatasetManifest } {
  assertRecoveryMigrationIntegrity(database);
  database.exec('BEGIN IMMEDIATE');
  try {
    const existing = inspectRecoveryDatasetManifest(database, requested.databasePathFingerprint);
    if (existing.manifest !== null) {
      if (existing.manifest.manifestFingerprint !== requested.manifestFingerprint) {
        throw manifestError(
          'Recovery dataset manifest conflicts with the existing frozen identity.',
        );
      }
      database.exec('COMMIT');
      return { idempotent: true, manifest: existing.manifest };
    }
    if (tableExists(database, 'rw0_dataset_manifest')) {
      throw manifestError('Recovery dataset manifest provenance is absent or ambiguous.');
    }
    if (requested.evidenceClass === 'retained_forward' && existing.populated) {
      throw manifestError(
        'A populated recovery database without provenance cannot become retained_forward.',
      );
    }
    database.exec(MANIFEST_TABLE_SQL);
    database
      .prepare(
        `INSERT INTO rw0_dataset_manifest VALUES (
      1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )`,
      )
      .run(
        requested.manifestVersion,
        requested.manifestSchemaDigest,
        requested.datasetId,
        requested.createdAt,
        requested.startAt,
        requested.evidenceClass,
        requested.watcherSpecVersion,
        requested.watcherSpecFingerprint,
        requested.safetySpecVersion,
        requested.safetySpecFingerprint,
        requested.signalVersion,
        requested.signalFingerprint,
        requested.recoverySchemaVersion,
        JSON.stringify(requested.recoveryMigrations),
        requested.databasePathFingerprint,
        requested.manifestFingerprint,
      );
    database.exec('COMMIT');
    return { idempotent: false, manifest: requested };
  } catch (error: unknown) {
    try {
      database.exec('ROLLBACK');
    } catch {
      /* transaction already closed */
    }
    throw error;
  }
}

export function inspectRecoveryDatasetManifest(
  database: DatabaseSync,
  databasePathOrFingerprint: string,
): RecoveryDatasetMetadata {
  assertRecoveryMigrationIntegrity(database);
  const populated = isRecoveryDatabasePopulated(database);
  if (!tableExists(database, 'rw0_dataset_manifest')) {
    return { evidenceClass: 'unclassified', populated, manifest: null };
  }
  assertManifestTableContract(database);
  const rows = database.prepare('SELECT * FROM rw0_dataset_manifest').all();
  if (rows.length !== 1) {
    throw manifestError('Recovery dataset manifest provenance is absent or ambiguous.');
  }
  const manifest = hydrateManifest(rows[0] ?? {});
  const expectedPathFingerprint = /^[a-f0-9]{64}$/.test(databasePathOrFingerprint)
    ? databasePathOrFingerprint
    : recoveryDatabasePathFingerprint(databasePathOrFingerprint);
  assertCurrentManifest(manifest, expectedPathFingerprint);
  return { evidenceClass: manifest.evidenceClass, populated, manifest };
}

export function requireRecoveryDatasetManifest(
  database: DatabaseSync,
  databasePath: string,
): RecoveryDatasetManifest {
  const metadata = inspectRecoveryDatasetManifest(database, databasePath);
  if (metadata.manifest === null) {
    throw manifestError(
      'Recovery runtime requires an initialized dataset manifest before collection.',
    );
  }
  return metadata.manifest;
}

function hydrateManifest(row: Record<string, unknown>): RecoveryDatasetManifest {
  const migrations = parseMigrations(requireString(row, 'recovery_migration_digests_json'));
  const evidenceClass = requireString(row, 'evidence_class');
  if (!RW0_DATASET_EVIDENCE_CLASSES.includes(evidenceClass as RecoveryDatasetEvidenceClass)) {
    throw manifestError('Recovery dataset manifest evidence class is invalid.');
  }
  return {
    manifestVersion: requireString(row, 'manifest_version'),
    manifestSchemaDigest: requireString(row, 'manifest_schema_digest'),
    datasetId: requireString(row, 'dataset_id'),
    createdAt: canonicalInstant(requireString(row, 'created_at'), 'created_at'),
    startAt: canonicalInstant(requireString(row, 'start_at'), 'start_at'),
    evidenceClass: evidenceClass as RecoveryDatasetEvidenceClass,
    watcherSpecVersion: requireString(row, 'watcher_spec_version'),
    watcherSpecFingerprint: requireString(row, 'watcher_spec_fingerprint'),
    safetySpecVersion: requireString(row, 'safety_spec_version'),
    safetySpecFingerprint: requireString(row, 'safety_spec_fingerprint'),
    signalVersion: requireString(row, 'signal_version'),
    signalFingerprint: requireString(row, 'signal_fingerprint'),
    recoverySchemaVersion: requireInteger(row, 'recovery_schema_version'),
    recoveryMigrations: migrations,
    databasePathFingerprint: requireString(row, 'database_path_fingerprint'),
    manifestFingerprint: requireString(row, 'manifest_fingerprint'),
  };
}

function assertCurrentManifest(manifest: RecoveryDatasetManifest, pathFingerprint: string): void {
  const expected = buildRecoveryDatasetManifest({
    datasetId: manifest.datasetId,
    createdAt: manifest.createdAt,
    startAt: manifest.startAt,
    evidenceClass: manifest.evidenceClass,
    databasePath: ':memory:',
  });
  const canonical = { ...expected, databasePathFingerprint: pathFingerprint };
  const { manifestFingerprint: ignoredFingerprint, ...unsigned } = canonical;
  void ignoredFingerprint;
  canonical.manifestFingerprint = fingerprintCanonicalJson(unsigned);
  if (JSON.stringify(manifest) !== JSON.stringify(canonical)) {
    throw manifestError('Recovery dataset manifest does not match the frozen current identities.');
  }
}

function parseMigrations(value: string): readonly RecoveryMigrationIdentity[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error('not array');
    return parsed.map((item) => {
      if (typeof item !== 'object' || item === null) throw new Error('not object');
      const row = item as Record<string, unknown>;
      if (
        !Number.isInteger(row['version']) ||
        typeof row['name'] !== 'string' ||
        typeof row['sqlDigest'] !== 'string'
      )
        throw new Error('bad identity');
      return { version: row['version'] as number, name: row['name'], sqlDigest: row['sqlDigest'] };
    });
  } catch {
    throw manifestError('Recovery dataset migration identities are malformed.');
  }
}

function isRecoveryDatabasePopulated(database: DatabaseSync): boolean {
  return DATA_TABLES.some(
    (table) =>
      Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.['count'] ?? 0) > 0,
  );
}

function tableExists(database: DatabaseSync, table: string): boolean {
  return (
    database.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) !==
    undefined
  );
}

function assertManifestTableContract(database: DatabaseSync): void {
  const row = database
    .prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'rw0_dataset_manifest'")
    .get();
  const sql = row?.['sql'];
  if (
    typeof sql !== 'string' ||
    sha256(canonicalManifestTableSql(sql)) !== RW0_DATASET_MANIFEST_SCHEMA_DIGEST
  ) {
    throw manifestError(
      'Recovery dataset manifest table schema does not match the frozen contract.',
    );
  }
}

function canonicalManifestTableSql(sql: string): string {
  return sql.trim().replace(/;$/, '').replaceAll('\r\n', '\n');
}

function requireString(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== 'string' || value.length === 0)
    throw manifestError(`Recovery dataset manifest ${field} is malformed.`);
  return value;
}

function requireInteger(row: Record<string, unknown>, field: string): number {
  const value = row[field];
  if (!Number.isInteger(value))
    throw manifestError(`Recovery dataset manifest ${field} is malformed.`);
  return value as number;
}

function canonicalInstant(value: string, field: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw manifestError(`${field} must be a canonical UTC ISO-8601 instant.`);
  }
  return value;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function manifestError(message: string): RecoveryWatcherError {
  return new RecoveryWatcherError(message, { code: 'schema_mismatch' });
}
