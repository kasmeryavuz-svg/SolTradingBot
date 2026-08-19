import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { RW0_MIGRATION_NAME, RW0_SCHEMA_VERSION } from '../constants.js';
import { RecoveryWatcherError } from '../errors.js';

export const RW0_MIGRATIONS: readonly { version: number; name: string; sql: string }[] = [
  {
    version: RW0_SCHEMA_VERSION,
    name: RW0_MIGRATION_NAME,
    sql: `
CREATE TABLE rw0_episodes (
  episode_id TEXT PRIMARY KEY,
  mint TEXT NOT NULL,
  pair_address TEXT NOT NULL,
  dip_observed_at TEXT NOT NULL,
  signal_version TEXT NOT NULL,
  signal_fingerprint TEXT NOT NULL,
  watcher_spec_version TEXT NOT NULL,
  watcher_spec_fingerprint TEXT NOT NULL,
  shadow_paper_spec_version TEXT NOT NULL,
  shadow_paper_fingerprint TEXT NOT NULL,
  exit_spec_version TEXT NOT NULL,
  exit_fingerprint TEXT NOT NULL,
  state TEXT NOT NULL CHECK (
    state IN (
      'DISCOVERED',
      'DIP_CANDIDATE',
      'RECOVERY_WATCH',
      'SIGNAL_PENDING_SAFETY',
      'SHADOW_RESEARCH_OPEN',
      'PAPER_ELIGIBLE',
      'PAPER_OPEN',
      'CLOSED',
      'EXPIRED',
      'REJECTED_FILTER',
      'REJECTED_INCOMPLETE',
      'REJECTED_SAFETY',
      'REJECTED_SAFETY_UNKNOWN',
      'REJECTED_CAP',
      'CENSORED_UNAVAILABLE',
      'COOLDOWN'
    )
  ),
  track TEXT NOT NULL CHECK (track IN ('none', 'shadow')),
  safety_incomplete INTEGER NOT NULL CHECK (safety_incomplete IN (0, 1)),
  completeness_gate TEXT NOT NULL CHECK (completeness_gate IN ('FAIL', 'NOT_EVALUATED')),
  holder_status TEXT NOT NULL CHECK (holder_status = 'UNKNOWN'),
  bundle_status TEXT NOT NULL CHECK (bundle_status = 'UNKNOWN'),
  creator_status TEXT NOT NULL CHECK (creator_status = 'UNKNOWN'),
  cost_model TEXT NOT NULL CHECK (cost_model = 'none'),
  execution_model TEXT NOT NULL CHECK (execution_model = 'discrete_observed_price_no_quote'),
  dip_price_usd REAL,
  dip_liquidity_usd REAL,
  dip_volume_5m_usd REAL,
  dip_price_change_5m_pct REAL,
  dip_volume_to_liquidity_5m REAL,
  recovery_confirmed_at TEXT,
  recovery_confirmation_price_usd REAL,
  recovery_confirmation_liquidity_usd REAL,
  recovery_confirmation_volume_5m_usd REAL,
  recovery_confirmation_volume_to_liquidity_5m REAL,
  watch_started_at TEXT,
  last_transition_event_id TEXT NOT NULL,
  last_from_state TEXT,
  safety_completed_at TEXT,
  shadow_entry_at TEXT,
  shadow_entry_price_usd REAL,
  safe_entry_at TEXT,
  safe_entry_price_usd REAL,
  safe_entry_observation_collected_at TEXT,
  closed_at TEXT,
  close_price_usd REAL,
  close_reason TEXT CHECK (
    close_reason IS NULL OR close_reason IN (
      'stop_loss_threshold',
      'take_profit_threshold',
      'max_holding_time'
    )
  ),
  close_observation_collected_at TEXT,
  cooldown_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (mint, pair_address, dip_observed_at, signal_fingerprint),
  CHECK (safe_entry_at IS NULL),
  CHECK (safe_entry_price_usd IS NULL),
  CHECK (safe_entry_observation_collected_at IS NULL),
  CHECK (safety_completed_at IS NULL),
  CHECK (state != 'SHADOW_RESEARCH_OPEN' OR track = 'shadow'),
  CHECK (state != 'SHADOW_RESEARCH_OPEN' OR shadow_entry_at IS NOT NULL),
  CHECK (track != 'shadow' OR shadow_entry_at IS NOT NULL),
  CHECK (
    state NOT IN (
      'DISCOVERED',
      'DIP_CANDIDATE',
      'RECOVERY_WATCH',
      'SIGNAL_PENDING_SAFETY'
    ) OR track = 'none'
  )
) STRICT;

CREATE UNIQUE INDEX rw0_one_active_episode_per_mint
ON rw0_episodes(mint)
WHERE state IN (
  'DISCOVERED',
  'DIP_CANDIDATE',
  'RECOVERY_WATCH',
  'SIGNAL_PENDING_SAFETY',
  'SHADOW_RESEARCH_OPEN',
  'PAPER_ELIGIBLE',
  'PAPER_OPEN'
);

CREATE TABLE rw0_state_transitions (
  id INTEGER PRIMARY KEY,
  episode_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  at TEXT NOT NULL,
  reason TEXT NOT NULL,
  event_id TEXT NOT NULL,
  UNIQUE (episode_id, event_id),
  FOREIGN KEY (episode_id) REFERENCES rw0_episodes(episode_id)
) STRICT;

CREATE TABLE rw0_market_observations (
  id INTEGER PRIMARY KEY,
  episode_id TEXT NOT NULL,
  mint TEXT NOT NULL,
  pair_address TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (length(trim(provider)) > 0),
  source TEXT NOT NULL CHECK (length(trim(source)) > 0),
  price_usd REAL,
  liquidity_usd REAL,
  volume_5m_usd REAL,
  price_change_5m_pct REAL,
  signal_version TEXT NOT NULL,
  signal_fingerprint TEXT NOT NULL,
  watcher_spec_version TEXT NOT NULL,
  watcher_spec_fingerprint TEXT NOT NULL,
  UNIQUE (episode_id, pair_address, collected_at),
  FOREIGN KEY (episode_id) REFERENCES rw0_episodes(episode_id)
) STRICT;

CREATE TABLE rw0_safety_evidence (
  id INTEGER PRIMARY KEY,
  episode_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (
    kind IN ('holder', 'bundle', 'creator', 'token_rights', 'liquidity_execution', 'other')
  ),
  status TEXT NOT NULL CHECK (status = 'UNKNOWN'),
  observed_at TEXT NOT NULL,
  provider TEXT,
  provenance TEXT,
  notes TEXT,
  UNIQUE (episode_id, kind, observed_at),
  FOREIGN KEY (episode_id) REFERENCES rw0_episodes(episode_id)
) STRICT;

CREATE TABLE rw0_shadow_positions (
  id INTEGER PRIMARY KEY,
  episode_id TEXT NOT NULL UNIQUE,
  opened_at TEXT NOT NULL,
  entry_price_usd REAL NOT NULL,
  entry_observation_collected_at TEXT NOT NULL,
  pair_address TEXT NOT NULL,
  safety_incomplete INTEGER NOT NULL CHECK (safety_incomplete = 1),
  completeness_gate TEXT NOT NULL CHECK (completeness_gate = 'FAIL'),
  live_readiness INTEGER NOT NULL CHECK (live_readiness = 0),
  cost_model TEXT NOT NULL CHECK (cost_model = 'none'),
  execution_model TEXT NOT NULL CHECK (execution_model = 'discrete_observed_price_no_quote'),
  FOREIGN KEY (episode_id) REFERENCES rw0_episodes(episode_id)
) STRICT;

CREATE TABLE rw0_shadow_exit_observations (
  id INTEGER PRIMARY KEY,
  episode_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  pair_address TEXT NOT NULL,
  observed_price_usd REAL,
  threshold_price_usd REAL,
  overshoot_pct REAL,
  gap_flag INTEGER NOT NULL CHECK (gap_flag IN (0, 1)),
  action TEXT NOT NULL CHECK (
    action IN ('hold', 'stop_loss_threshold', 'take_profit_threshold', 'max_holding_time')
  ),
  UNIQUE (episode_id, pair_address, observed_at),
  FOREIGN KEY (episode_id) REFERENCES rw0_episodes(episode_id)
) STRICT;

CREATE INDEX rw0_episodes_mint_state ON rw0_episodes (mint, state);
CREATE INDEX rw0_episodes_mint_dip ON rw0_episodes (mint, dip_observed_at);
CREATE INDEX rw0_transitions_episode_at ON rw0_state_transitions (episode_id, at);
CREATE INDEX rw0_observations_episode_at ON rw0_market_observations (episode_id, collected_at);
`,
  },
];

export function recoveryMigrationSql(version: number): string {
  const migration = RW0_MIGRATIONS.find((item) => item.version === version);
  if (migration === undefined) {
    throw new RecoveryWatcherError(`Unknown recovery-watcher migration version ${String(version)}.`, {
      code: 'schema_mismatch',
    });
  }
  return migration.sql;
}

export function recoveryMigrationSqlDigest(version: number): string {
  return createHash('sha256').update(recoveryMigrationSql(version), 'utf8').digest('hex');
}

export function applyRecoveryMigrations(database: DatabaseSync): number {
  database.exec(`
CREATE TABLE IF NOT EXISTS rw0_schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sql_digest TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;
`);

  const appliedRows = database.prepare('SELECT version, name, sql_digest FROM rw0_schema_migrations').all();
  const applied = new Map<number, { name: string; sqlDigest: string }>();
  for (const row of appliedRows) {
    const version = Number(row['version']);
    const name = row['name'];
    const sqlDigest = row['sql_digest'];
    if (typeof name !== 'string' || typeof sqlDigest !== 'string' || !Number.isInteger(version)) {
      throw new RecoveryWatcherError('Recovery schema migration metadata is malformed.', {
        code: 'schema_mismatch',
      });
    }
    applied.set(version, { name, sqlDigest });
  }

  for (const migration of RW0_MIGRATIONS) {
    const expectedDigest = recoveryMigrationSqlDigest(migration.version);
    const existing = applied.get(migration.version);
    if (existing !== undefined) {
      if (existing.name !== migration.name || existing.sqlDigest !== expectedDigest) {
        throw new RecoveryWatcherError(
          'Recovery schema migration digest does not match rw0_v1. Migration drift without a version bump is rejected.',
          { code: 'schema_mismatch' },
        );
      }
      continue;
    }
    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(migration.sql);
      database
        .prepare('INSERT INTO rw0_schema_migrations (version, name, sql_digest, applied_at) VALUES (?, ?, ?, ?)')
        .run(migration.version, migration.name, expectedDigest, new Date().toISOString());
      database.exec('COMMIT');
    } catch (error: unknown) {
      try {
        database.exec('ROLLBACK');
      } catch {
        // The failed migration transaction is already closed or was never opened.
      }
      if (error instanceof RecoveryWatcherError) {
        throw error;
      }
      throw new RecoveryWatcherError('Recovery Watcher migration failed. The local database was rolled back.', {
        code: 'persistence_failed',
        cause: error,
      });
    }
  }

  assertRecoveryMigrationIntegrity(database);
  return currentRecoverySchemaVersion(database);
}

export function currentRecoverySchemaVersion(database: DatabaseSync): number {
  const row = database.prepare('SELECT MAX(version) AS version FROM rw0_schema_migrations').get();
  return row === undefined || row['version'] === null ? 0 : Number(row['version']);
}

export function storedRecoveryMigrationDigest(database: DatabaseSync, version: number): string | null {
  const row = database.prepare('SELECT sql_digest FROM rw0_schema_migrations WHERE version = ?').get(version);
  if (row === undefined || typeof row['sql_digest'] !== 'string') {
    return null;
  }
  return row['sql_digest'];
}

export function assertRecoveryMigrationIntegrity(database: DatabaseSync): void {
  const version = currentRecoverySchemaVersion(database);
  if (version !== RW0_SCHEMA_VERSION) {
    throw new RecoveryWatcherError(
      `Recovery Watcher requires schema ${String(RW0_SCHEMA_VERSION)}. Found ${String(version)}.`,
      { code: 'schema_mismatch' },
    );
  }
  const stored = storedRecoveryMigrationDigest(database, RW0_SCHEMA_VERSION);
  const expected = recoveryMigrationSqlDigest(RW0_SCHEMA_VERSION);
  if (stored !== expected) {
    throw new RecoveryWatcherError(
      'Recovery schema migration digest does not match rw0_v1. Migration drift without a version bump is rejected.',
      { code: 'schema_mismatch' },
    );
  }
}
