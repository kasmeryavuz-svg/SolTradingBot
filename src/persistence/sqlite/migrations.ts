import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { PersistenceError } from '../types.js';

export const INITIAL_MIGRATION_VERSION = 1;
export const INITIAL_MIGRATION_NAME = '001_initial_persistence';
export const RISK_MIGRATION_VERSION = 2;
export const RISK_MIGRATION_NAME = '002_token_risk_scans';
export const FEATURE_MIGRATION_VERSION = 3;
export const FEATURE_MIGRATION_NAME = '003_feature_vectors';
export const STRATEGY_MIGRATION_VERSION = 4;
export const STRATEGY_MIGRATION_NAME = '004_strategy_evaluations';
export const PAPER_MIGRATION_VERSION = 5;
export const PAPER_MIGRATION_NAME = '005_paper_evaluations';
export const LATEST_SCHEMA_VERSION = PAPER_MIGRATION_VERSION;

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
  {
    version: RISK_MIGRATION_VERSION,
    name: RISK_MIGRATION_NAME,
    sql: `
CREATE TABLE risk_scans (
  id INTEGER PRIMARY KEY,
  token_id INTEGER NOT NULL,
  scanned_at TEXT NOT NULL,
  commitment TEXT NOT NULL CHECK (commitment IN ('confirmed', 'finalized')),
  token_program TEXT NOT NULL CHECK (token_program IN ('spl_token', 'token_2022')),
  program_owner TEXT NOT NULL,
  mint_context_slot INTEGER NOT NULL,
  supply_context_slot INTEGER,
  largest_accounts_context_slot INTEGER,
  decimals INTEGER NOT NULL CHECK (decimals >= 0 AND decimals <= 255),
  supply_raw TEXT,
  mint_authority TEXT,
  freeze_authority TEXT,
  top1_bps INTEGER CHECK (top1_bps IS NULL OR (top1_bps >= 0 AND top1_bps <= 10000)),
  top5_bps INTEGER CHECK (top5_bps IS NULL OR (top5_bps >= 0 AND top5_bps <= 10000)),
  top10_bps INTEGER CHECK (top10_bps IS NULL OR (top10_bps >= 0 AND top10_bps <= 10000)),
  top20_bps INTEGER CHECK (top20_bps IS NULL OR (top20_bps >= 0 AND top20_bps <= 10000)),
  largest_accounts_count INTEGER NOT NULL CHECK (largest_accounts_count >= 0 AND largest_accounts_count <= 20),
  data_completeness TEXT NOT NULL CHECK (data_completeness IN ('complete', 'partial')),
  highest_finding_severity TEXT NOT NULL CHECK (
    highest_finding_severity IN ('none', 'info', 'medium', 'high', 'critical')
  ),
  UNIQUE (token_id, scanned_at),
  FOREIGN KEY (token_id) REFERENCES tokens(id)
) STRICT;

CREATE INDEX risk_scans_token_scanned_at_idx ON risk_scans (token_id, scanned_at DESC);

CREATE TABLE risk_scan_checks (
  scan_id INTEGER NOT NULL,
  check_name TEXT NOT NULL CHECK (check_name IN ('mint_account', 'supply', 'largest_accounts')),
  ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
  context_slot INTEGER,
  error TEXT,
  PRIMARY KEY (scan_id, check_name),
  FOREIGN KEY (scan_id) REFERENCES risk_scans(id)
) STRICT;

CREATE TABLE risk_scan_extensions (
  scan_id INTEGER NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  extension_name TEXT NOT NULL,
  authority TEXT,
  program_id TEXT,
  state TEXT,
  transfer_fee_basis_points INTEGER CHECK (
    transfer_fee_basis_points IS NULL
    OR (transfer_fee_basis_points >= 0 AND transfer_fee_basis_points <= 10000)
  ),
  maximum_fee_raw TEXT,
  parsed INTEGER NOT NULL CHECK (parsed IN (0, 1)),
  PRIMARY KEY (scan_id, ordinal),
  FOREIGN KEY (scan_id) REFERENCES risk_scans(id)
) STRICT;

CREATE TABLE risk_top_token_accounts (
  scan_id INTEGER NOT NULL,
  rank INTEGER NOT NULL CHECK (rank >= 1 AND rank <= 20),
  token_account TEXT NOT NULL,
  amount_raw TEXT NOT NULL,
  share_bps INTEGER CHECK (share_bps IS NULL OR (share_bps >= 0 AND share_bps <= 10000)),
  PRIMARY KEY (scan_id, rank),
  UNIQUE (scan_id, token_account),
  FOREIGN KEY (scan_id) REFERENCES risk_scans(id)
) STRICT;

CREATE TABLE risk_findings (
  scan_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('authority', 'token_extension', 'concentration', 'data_quality')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'medium', 'high', 'critical')),
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  PRIMARY KEY (scan_id, code),
  FOREIGN KEY (scan_id) REFERENCES risk_scans(id)
) STRICT;
`,
  },
  {
    version: FEATURE_MIGRATION_VERSION,
    name: FEATURE_MIGRATION_NAME,
    sql: `
CREATE TABLE feature_vectors (
  id INTEGER PRIMARY KEY,
  token_id INTEGER NOT NULL,
  feature_set_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  as_of TEXT NOT NULL,
  market_collected_at TEXT NOT NULL,
  market_pair_address TEXT NOT NULL,
  previous_market_collected_at TEXT,
  risk_scanned_at TEXT,
  feature_completeness TEXT NOT NULL CHECK (feature_completeness IN ('complete', 'partial')),
  available_feature_count INTEGER NOT NULL CHECK (available_feature_count >= 0),
  unavailable_feature_count INTEGER NOT NULL CHECK (unavailable_feature_count >= 0),
  source_identity TEXT NOT NULL UNIQUE,
  CHECK (market_collected_at <= as_of),
  CHECK (risk_scanned_at IS NULL OR risk_scanned_at <= as_of),
  CHECK (
    previous_market_collected_at IS NULL
    OR previous_market_collected_at < market_collected_at
  ),
  FOREIGN KEY (token_id) REFERENCES tokens(id)
) STRICT;

CREATE INDEX feature_vectors_token_as_of_idx ON feature_vectors (token_id, as_of DESC, id DESC);

CREATE TABLE feature_values (
  vector_id INTEGER NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  feature_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('number', 'integer', 'boolean')),
  status TEXT NOT NULL CHECK (status IN ('available', 'unavailable')),
  number_value REAL,
  integer_value INTEGER,
  boolean_value INTEGER,
  unavailable_reason TEXT,
  PRIMARY KEY (vector_id, feature_name),
  UNIQUE (vector_id, ordinal),
  FOREIGN KEY (vector_id) REFERENCES feature_vectors(id),
  CHECK (
    (
      status = 'available'
      AND kind = 'number'
      AND number_value IS NOT NULL
      AND integer_value IS NULL
      AND boolean_value IS NULL
      AND unavailable_reason IS NULL
    )
    OR (
      status = 'available'
      AND kind = 'integer'
      AND integer_value IS NOT NULL
      AND number_value IS NULL
      AND boolean_value IS NULL
      AND unavailable_reason IS NULL
    )
    OR (
      status = 'available'
      AND kind = 'boolean'
      AND boolean_value IN (0, 1)
      AND number_value IS NULL
      AND integer_value IS NULL
      AND unavailable_reason IS NULL
    )
    OR (
      status = 'unavailable'
      AND number_value IS NULL
      AND integer_value IS NULL
      AND boolean_value IS NULL
      AND unavailable_reason IS NOT NULL
    )
  )
) STRICT;
`,
  },
  {
    version: STRATEGY_MIGRATION_VERSION,
    name: STRATEGY_MIGRATION_NAME,
    sql: `
CREATE TABLE strategy_definitions (
  strategy_version TEXT PRIMARY KEY,
  strategy_name TEXT NOT NULL,
  feature_set_version TEXT NOT NULL,
  definition_fingerprint TEXT NOT NULL,
  first_recorded_at TEXT NOT NULL
) STRICT;

CREATE TABLE strategy_evaluations (
  id INTEGER PRIMARY KEY,
  token_id INTEGER NOT NULL,
  feature_vector_id INTEGER NOT NULL,
  strategy_version TEXT NOT NULL,
  strategy_definition_fingerprint TEXT NOT NULL,
  feature_set_version TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  as_of TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('entry_candidate', 'no_entry', 'insufficient_data')),
  passed_rule_count INTEGER NOT NULL CHECK (passed_rule_count >= 0),
  failed_rule_count INTEGER NOT NULL CHECK (failed_rule_count >= 0),
  unavailable_rule_count INTEGER NOT NULL CHECK (unavailable_rule_count >= 0),
  source_identity TEXT NOT NULL UNIQUE,
  FOREIGN KEY (token_id) REFERENCES tokens(id),
  FOREIGN KEY (feature_vector_id) REFERENCES feature_vectors(id),
  FOREIGN KEY (strategy_version) REFERENCES strategy_definitions(strategy_version)
) STRICT;

CREATE INDEX strategy_evaluations_token_as_of_id
  ON strategy_evaluations (token_id, as_of DESC, id DESC);

CREATE TABLE strategy_rule_results (
  evaluation_id INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  rule_code TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'data_quality',
    'market_quality',
    'activity',
    'flow',
    'momentum',
    'risk'
  )),
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'unavailable')),
  description TEXT NOT NULL,
  criterion TEXT NOT NULL,
  observed TEXT NOT NULL,
  reason TEXT NOT NULL,
  PRIMARY KEY (evaluation_id, rule_code),
  UNIQUE (evaluation_id, ordinal),
  FOREIGN KEY (evaluation_id) REFERENCES strategy_evaluations(id)
) STRICT;
`,
  },
  {
    version: PAPER_MIGRATION_VERSION,
    name: PAPER_MIGRATION_NAME,
    sql: `
CREATE TABLE paper_definitions (
  paper_spec_version TEXT PRIMARY KEY,
  paper_spec_name TEXT NOT NULL,
  feature_set_version TEXT NOT NULL,
  strategy_version TEXT NOT NULL,
  strategy_definition_fingerprint TEXT NOT NULL,
  definition_fingerprint TEXT NOT NULL,
  first_recorded_at TEXT NOT NULL
) STRICT;

CREATE TABLE paper_evaluations (
  id INTEGER PRIMARY KEY,
  token_id INTEGER NOT NULL,
  strategy_evaluation_id INTEGER NOT NULL,
  paper_spec_version TEXT NOT NULL,
  paper_definition_fingerprint TEXT NOT NULL,
  strategy_definition_fingerprint TEXT NOT NULL,
  feature_set_version TEXT NOT NULL,
  as_of TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  market_collected_at TEXT NOT NULL,
  pair_address TEXT NOT NULL,
  strategy_decision TEXT NOT NULL CHECK (
    strategy_decision IN ('entry_candidate', 'no_entry', 'insufficient_data')
  ),
  paper_action TEXT NOT NULL CHECK (paper_action IN ('entry_observation', 'no_action')),
  no_action_reason TEXT CHECK (
    no_action_reason IS NULL
    OR no_action_reason IN ('strategy_no_entry', 'strategy_insufficient_data')
  ),
  reference_price_usd REAL,
  simulated_entry_price_usd REAL,
  execution_model TEXT NOT NULL CHECK (
    execution_model = 'exact_strategy_market_snapshot_reference_price'
  ),
  cost_model TEXT NOT NULL CHECK (cost_model = 'none'),
  quantity_model TEXT NOT NULL CHECK (quantity_model = 'none'),
  position_model TEXT NOT NULL CHECK (position_model = 'none'),
  exit_model TEXT NOT NULL CHECK (exit_model = 'none'),
  source_identity TEXT NOT NULL UNIQUE,
  FOREIGN KEY (token_id) REFERENCES tokens(id),
  FOREIGN KEY (strategy_evaluation_id) REFERENCES strategy_evaluations(id),
  FOREIGN KEY (paper_spec_version) REFERENCES paper_definitions(paper_spec_version),
  CHECK (
    (
      paper_action = 'entry_observation'
      AND strategy_decision = 'entry_candidate'
      AND no_action_reason IS NULL
      AND reference_price_usd IS NOT NULL
      AND reference_price_usd > 0
      AND simulated_entry_price_usd IS NOT NULL
      AND simulated_entry_price_usd > 0
      AND simulated_entry_price_usd = reference_price_usd
    )
    OR (
      paper_action = 'no_action'
      AND (
        (strategy_decision = 'no_entry' AND no_action_reason = 'strategy_no_entry')
        OR (
          strategy_decision = 'insufficient_data'
          AND no_action_reason = 'strategy_insufficient_data'
        )
      )
      AND reference_price_usd IS NULL
      AND simulated_entry_price_usd IS NULL
    )
  )
) STRICT;

CREATE INDEX paper_evaluations_token_as_of_id
  ON paper_evaluations (token_id, as_of DESC, id DESC);
`,
  },
];

export function migrationSqlDigest(version: number): string {
  const migration = MIGRATIONS.find((item) => item.version === version);
  if (migration === undefined) {
    throw new PersistenceError(`Unknown migration version: ${String(version)}.`);
  }

  return createHash('sha256').update(migration.sql, 'utf8').digest('hex');
}

export function applyMigrations(
  database: DatabaseSync,
  options: { targetVersion?: number } = {},
): number {
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
    if (options.targetVersion !== undefined && migration.version > options.targetVersion) {
      continue;
    }

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
