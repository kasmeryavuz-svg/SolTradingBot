export const RW0_SPEC_VERSION = 'rw0_v3';
export const RW0_SPEC_NAME = 'recovery_watcher_safety_evidence_only';
export const RW0_CHECKPOINT = 'rw0';

// These values identify the published Slice 1/2 rows. They are compatibility
// constants only: new episodes, screenings, and safety evidence use RW0_SPEC_VERSION.
export const RW0_LEGACY_SPEC_VERSION = 'rw0_v1';
export const RW0_LEGACY_WATCHER_DEFINITION_FINGERPRINT =
  '5dc65c1129485f77b337be22a42dc81ba76aa24c89d2661fce50ef6d70cbd297';

export const RW0_SAFETY_SPEC_VERSION = 'rw0_safety_v2';
export const RW0_SAFETY_SPEC_NAME = 'persisted_fail_closed_safety_evidence';
export const RW0_HOLDER_MAX_PCT = 10;
export const RW0_LINKED_BUNDLE_MAX_PCT = 20;

export const RECOVERY_V0_SIGNAL_VERSION = 'recovery_v0';
export const RECOVERY_V0_SIGNAL_NAME = 'unproven_5m_crash_then_same_pair_recovery';

export const RW0_SHADOW_PAPER_SPEC_VERSION = 'rw0_shadow_paper_v0';
export const RW0_SHADOW_PAPER_SPEC_NAME = 'unsafe_research_shadow_simulation';

export const RW0_EXIT_SPEC_VERSION = 'rw0_exit_v0';
export const RW0_EXIT_SPEC_NAME = 'discrete_observed_threshold_comparator';

export const DEFAULT_RW0_DATABASE_PATH = './data/recovery-watcher.sqlite';
export const FORBIDDEN_PRODUCTION_DATABASE_PATH = './data/soltradingbot.sqlite';
export const RW0_MEMORY_DATABASE_PATH = ':memory:';
export const DEFAULT_RW0_DATABASE_BUSY_TIMEOUT_MS = 5_000;

export const RW0_LOCK_FILE_NAME = '.rw0-runtime.lock';
export const RW0_LOCK_FILE_MODE = 0o600;

export const RW0_WATCH_CADENCE_MS = 60_000;
export const RW0_WATCH_TTL_MS = 7_200_000;
export const RW0_COOLDOWN_MS = 7_200_000;
export const RW0_MAX_CONCURRENT_WATCHES = 10;
export const RW0_MAX_EPISODES_PER_MINT_PER_24H = 3;
export const RW0_EPISODE_WINDOW_MS = 86_400_000;

export const RW0_NETWORK_TIMEOUT_MS = 10_000;
export const RW0_SCREENING_MAX_CANDIDATES = 20;
export const RW0_DISCOVERY_CALLS_PER_SCREENING_CYCLE = 2;
export const RW0_WATCH_FETCH_CONCURRENCY = RW0_MAX_CONCURRENT_WATCHES;
export const RW0_SCREENING_FETCH_CONCURRENCY = 4;
export const RW0_SCREENING_WALL_BUDGET_MS = 20_000;
export const RW0_SCHEDULING_POLICY = 'watch_due_target_from_pass_start' as const;
export const RW0_MARKET_PROVIDER = 'dexscreener';
export const RW0_SCREENING_MARKET_SOURCE = 'token-pairs/v1';
export const RW0_WATCH_MARKET_SOURCE = 'token-pairs/v1_exact_pair';

export const RW0_SCREENING_DISPOSITIONS = [
  'DIP_PASS',
  'NOT_DIP',
  'INCOMPLETE',
  'MARKET_UNAVAILABLE',
  'WATCH_CAP_FULL',
  'EPISODE_LIMIT',
  'COOLDOWN',
  'ALREADY_ACTIVE',
  'SKIPPED_CAP',
] as const;

export const RW0_DIP_FILTER_RESULTS = ['PASS', 'NOT_DIP', 'INCOMPLETE', 'NOT_EVALUATED'] as const;

export const RECOVERY_V0_MIN_PRICE_CHANGE_5M_PCT = -60;
export const RECOVERY_V0_MAX_PRICE_CHANGE_5M_PCT = -40;
export const RECOVERY_V0_MIN_DIP_VOLUME_5M_USD = 5_000;
export const RECOVERY_V0_MIN_CONFIRMATION_LIQUIDITY_USD = 10_000;
export const RECOVERY_V0_MIN_VOLUME_TO_LIQUIDITY_5M = 1.0;
export const RECOVERY_V0_MAX_VOLUME_TO_LIQUIDITY_5M_EXCLUSIVE = 3.0;

export const RW0_COST_MODEL = 'none' as const;
export const RW0_EXECUTION_MODEL = 'discrete_observed_price_no_quote' as const;

export const RW0_EXIT_STOP_LOSS_BPS = 1000;
export const RW0_EXIT_TAKE_PROFIT_BPS = 2000;
export const RW0_EXIT_MAX_HOLDING_MS = 21_600_000;

export const RW0_SCHEMA_VERSION = 2;
export const RW0_MIGRATION_NAME = 'rw0_002_safety_evidence';

export const RW0_REDACTED_URL_TOKEN = '[REDACTED_URL]';

export const RECOVERY_EPISODE_STATES = [
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
  'COOLDOWN',
] as const;

export const ACTIVE_RECOVERY_EPISODE_STATES = [
  'DISCOVERED',
  'DIP_CANDIDATE',
  'RECOVERY_WATCH',
  'SIGNAL_PENDING_SAFETY',
  'SHADOW_RESEARCH_OPEN',
  'PAPER_ELIGIBLE',
  'PAPER_OPEN',
] as const;

export const RW0_WATCH_SLOT_STATES = [
  'RECOVERY_WATCH',
  'SIGNAL_PENDING_SAFETY',
  'SHADOW_RESEARCH_OPEN',
  'PAPER_ELIGIBLE',
  'PAPER_OPEN',
] as const;

export const TERMINAL_BEFORE_COOLDOWN_STATES = [
  'CLOSED',
  'EXPIRED',
  'REJECTED_FILTER',
  'REJECTED_INCOMPLETE',
  'REJECTED_SAFETY',
  'REJECTED_SAFETY_UNKNOWN',
  'REJECTED_CAP',
  'CENSORED_UNAVAILABLE',
] as const;

export const SAFETY_GATE_STATUSES = ['UNKNOWN', 'PASS', 'FAIL'] as const;

export const RESEARCH_TRACKS = ['none', 'shadow', 'safety_approved'] as const;

export const SHADOW_CLOSE_REASONS = [
  'stop_loss_threshold',
  'take_profit_threshold',
  'max_holding_time',
] as const;

export const SHADOW_EXIT_ACTIONS = ['hold', ...SHADOW_CLOSE_REASONS] as const;
