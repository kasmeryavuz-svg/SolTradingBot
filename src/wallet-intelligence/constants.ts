export const WALLET_INTELLIGENCE_SPEC_VERSION = 'wi18_v1';
export const WALLET_INTELLIGENCE_SPEC_NAME = 'public_onchain_holder_cohort_intelligence';
export const WALLET_INTELLIGENCE_CHECKPOINT = '18';

export const SOLANA_MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
export const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

export const HELIUS_MAINNET_RPC_ORIGIN = 'https://mainnet.helius-rpc.com';
export const HELIUS_MAINNET_RPC_HOST = 'mainnet.helius-rpc.com';
export const HELIUS_RPC_METHOD_GET_TRANSACTIONS_FOR_ADDRESS = 'getTransactionsForAddress';
export const HELIUS_TOKEN_ACCOUNTS_METADATA_FROM_SLOT = 111_491_819;

export const TOP_TOKEN_ACCOUNT_LIMIT = 20;
export const ANALYZED_WALLET_CAP = 10;
export const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const HISTORY_TX_CAP = 200;
export const HISTORY_FULL_PAGE_LIMIT = 100;
export const HISTORY_CENSOR_PROBE_LIMIT = 1;
export const HISTORY_MAX_INSPECTED = HISTORY_TX_CAP + HISTORY_CENSOR_PROBE_LIMIT;
export const HISTORY_MAX_RECENT_PAGES = 3;
export const FIRST_OBSERVED_ACTIVITY_LIMIT = 1;
export const HISTORY_CONCURRENCY = 2;
export const PROVIDER_TIMEOUT_MS = 10_000;
export const PROVIDER_MAX_ATTEMPTS = 2;
export const PROVIDER_RETRY_POLICY = 'one_initial_plus_one_retry' as const;
export const PROVIDER_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
export const GET_MULTIPLE_ACCOUNTS_CHUNK = 100;
export const PAGINATION_TOKEN_MAX_LENGTH = 512;

export const OBSERVED_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
export const OBSERVED_YOUNG_MS = 30 * 24 * 60 * 60 * 1000;

export const BASIS_POINTS_PER_UNIT = 10_000;
export const REQUIRED_SCHEMA_VERSION = 9;
export const WALLET_INTELLIGENCE_MIGRATION_NAME = '009_wallet_intelligence';
export const WALLET_INTELLIGENCE_MIGRATION_VERSION = 9;

export const OWNER_KINDS = [
  'SYSTEM_OWNED_NON_EXECUTABLE',
  'PROGRAM_OWNED_OR_EXECUTABLE',
  'ACCOUNT_MISSING',
  'UNKNOWN',
] as const;

export const OBSERVED_AGE_CLASSES = [
  'OBSERVED_FRESH_7D',
  'OBSERVED_YOUNG_30D',
  'OBSERVED_ESTABLISHED_30D_PLUS',
  'UNKNOWN',
] as const;

export const TOKEN_DELTA_KINDS = [
  'positive_token_delta',
  'negative_token_delta',
  'bidirectional_token_change',
  'no_net_token_delta',
  'incomplete_token_delta',
] as const;
