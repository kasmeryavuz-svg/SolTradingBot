import type { DatabaseSync } from 'node:sqlite';
import { PersistenceError } from '../types.js';

export const INITIAL_MIGRATION_VERSION = 1;
export const INITIAL_MIGRATION_NAME = '001_initial_persistence';

const MIGRATIONS: readonly { version: number; name: string; sql: string }[] = [
  {
    version: INITIAL_MIGRATION_VERSION,
    name: INITIAL_MIGRATION_NAME,
    sql: `
CREATE TABLE tokens (
  id INTEGER PRIMARY KEY,
  chain TEXT NOT NULL CHECK (chain = 'solana'),
  mint TEXT NOT NULL UNIQUE,
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE discovery_runs (
  id INTEGER PRIMARY KEY,
  observed_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  candidate_count INTEGER NOT NULL CHECK (candidate_count >= 0)
) STRICT;

CREATE TABLE discovery_source_results (
  run_id INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('dexscreener_profile', 'dexscreener_boost')),
  ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
  record_count INTEGER NOT NULL CHECK (record_count >= 0),
  error TEXT,
  PRIMARY KEY (run_id, source),
  FOREIGN KEY (run_id) REFERENCES discovery_runs(id)
) STRICT;

CREATE TABLE discovery_observations (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL,
  token_id INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  dex_screener_url TEXT,
  description TEXT,
  profile_updated_at TEXT,
  boost_amount REAL,
  boost_total_amount REAL,
  market_data_status TEXT NOT NULL CHECK (
    market_data_status IN ('available', 'unavailable', 'not_requested')
  ),
  UNIQUE (run_id, token_id),
  FOREIGN KEY (run_id) REFERENCES discovery_runs(id),
  FOREIGN KEY (token_id) REFERENCES tokens(id)
) STRICT;

CREATE TABLE discovery_observation_sources (
  observation_id INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('dexscreener_profile', 'dexscreener_boost')),
  PRIMARY KEY (observation_id, source),
  FOREIGN KEY (observation_id) REFERENCES discovery_observations(id)
) STRICT;

CREATE TABLE discovery_links (
  id INTEGER PRIMARY KEY,
  observation_id INTEGER NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  type TEXT,
  label TEXT,
  url TEXT NOT NULL,
  UNIQUE (observation_id, ordinal),
  FOREIGN KEY (observation_id) REFERENCES discovery_observations(id)
) STRICT;

CREATE TABLE market_snapshots (
  id INTEGER PRIMARY KEY,
  token_id INTEGER NOT NULL,
  discovery_observation_id INTEGER,
  chain TEXT NOT NULL CHECK (chain = 'solana'),
  token_name TEXT,
  token_symbol TEXT,
  dex_id TEXT NOT NULL,
  pair_address TEXT NOT NULL,
  quote_token_mint TEXT,
  quote_token_symbol TEXT,
  price_usd REAL,
  liquidity_usd REAL,
  volume_5m_usd REAL,
  volume_1h_usd REAL,
  volume_24h_usd REAL,
  buys_5m INTEGER,
  sells_5m INTEGER,
  buys_1h INTEGER,
  sells_1h INTEGER,
  price_change_5m_pct REAL,
  price_change_1h_pct REAL,
  price_change_24h_pct REAL,
  market_cap_usd REAL,
  fdv_usd REAL,
  pair_created_at TEXT,
  collected_at TEXT NOT NULL,
  UNIQUE (token_id, pair_address, collected_at),
  FOREIGN KEY (token_id) REFERENCES tokens(id),
  FOREIGN KEY (discovery_observation_id) REFERENCES discovery_observations(id)
) STRICT;
`,
  },
];

export function applyMigrations(database: DatabaseSync): number {
  database.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
) STRICT;
`);

  const applied = new Set(
    database
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => Number(row['version'])),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) {
      continue;
    }

    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(migration.sql);
      database
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString());
      database.exec('COMMIT');
    } catch (error: unknown) {
      try {
        database.exec('ROLLBACK');
      } catch {
        // The failed migration transaction is already closed or was never opened.
      }
      throw new PersistenceError('Migration failed. The local database was rolled back.', {
        cause: error,
      });
    }
  }

  return currentSchemaVersion(database);
}

export function currentSchemaVersion(database: DatabaseSync): number {
  const row = database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
  return row === undefined || row['version'] === null ? 0 : Number(row['version']);
}
