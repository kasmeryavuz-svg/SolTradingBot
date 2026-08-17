export const EXECUTION_SPEC_VERSION = 'e14_v1';
export const EXECUTION_SPEC_NAME = 'jupiter_v2_unsigned_swap_preflight_engine';
export const EXECUTION_CHECKPOINT = '14';

export const JUPITER_PROVIDER_PROTOCOL = 'https' as const;
export const JUPITER_PROVIDER_HOST = 'api.jup.ag' as const;
export const JUPITER_SWAP_API_VERSION = 'v2' as const;
export const JUPITER_BUILD_PATH = '/swap/v2/build' as const;
export const JUPITER_PROVIDER_ORIGIN = `${JUPITER_PROVIDER_PROTOCOL}://${JUPITER_PROVIDER_HOST}` as const;
export const JUPITER_BUILD_URL = `${JUPITER_PROVIDER_ORIGIN}${JUPITER_BUILD_PATH}` as const;

export const JUPITER_HTTP_METHOD = 'GET' as const;
export const JUPITER_REDIRECT_POLICY = 'error' as const;
export const JUPITER_API_KEY_HEADER = 'x-api-key' as const;

export const EXECUTION_SWAP_MODE = 'ExactIn' as const;
export const EXECUTION_SLIPPAGE_BPS = 100;
export const EXECUTION_MAX_ACCOUNTS = 64;
export const EXECUTION_BLOCKHASH_SLOTS_TO_EXPIRY = 150;
export const EXECUTION_COMPUTE_UNIT_PRICE_PERCENTILE = 'high' as const;
export const EXECUTION_FOR_JITO_BUNDLE = false;
export const EXECUTION_ROUTE_PLAN_TOTAL_BPS = 10_000;
export const EXECUTION_PLATFORM_FEE_BPS = 0;
export const EXECUTION_TIP_AMOUNT_LAMPORTS = 0;

export const COMPUTE_UNIT_HARD_MAX = 1_400_000;
export const COMPUTE_UNIT_MARGIN_NUMERATOR = 6n;
export const COMPUTE_UNIT_MARGIN_DENOMINATOR = 5n;
export const MAX_PRIORITY_FEE_LAMPORTS = 1_000_000n;
export const MICRO_LAMPORTS_PER_LAMPORT = 1_000_000n;

export const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';
export const COMPUTE_BUDGET_REQUEST_HEAP_FRAME_DISCRIMINATOR = 1;
export const COMPUTE_BUDGET_SET_LIMIT_DISCRIMINATOR = 2;
export const COMPUTE_BUDGET_SET_PRICE_DISCRIMINATOR = 3;
export const COMPUTE_BUDGET_SET_LOADED_ACCOUNTS_DATA_SIZE_LIMIT_DISCRIMINATOR = 4;

export const SOLANA_PACKET_DATA_SIZE = 1_232;
export const SOLANA_MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
export const SOLANA_DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const SOLANA_TESTNET_GENESIS_HASH = '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY';
export const COMPUTE_UNITS_CONSUMED_MAX = 4_294_967_295n;

export const U64_MAX = 18_446_744_073_709_551_615n;

export const JUPITER_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const EXECUTION_MAX_ROUTE_HOPS = 64;
export const EXECUTION_MAX_INSTRUCTION_ACCOUNTS = 256;
export const EXECUTION_MAX_LOOKUP_TABLES = 32;
export const EXECUTION_MAX_LOOKUP_TABLE_ADDRESSES = 256;
export const EXECUTION_MAX_SIMULATION_LOGS = 20;
export const EXECUTION_MAX_SIMULATION_LOG_CHARS = 200;

export const EXECUTION_REQUIRED_PUBLIC_FIELDS = [
  'EXECUTION_TAKER_PUBKEY',
  'EXECUTION_INPUT_MINT',
  'EXECUTION_OUTPUT_MINT',
  'EXECUTION_AMOUNT_RAW',
] as const;

export const EXECUTION_TRADING_ENABLED_REFUSAL =
  'Checkpoint 14 execution engine is preflight-only. TRADING_ENABLED must remain false. Signing and broadcast are unavailable until later checkpoints.';

export const EXECUTION_UNSUPPORTED_NETWORK_MESSAGE =
  'Checkpoint 14 real Jupiter build/simulation supports only SOLANA_NETWORK=mainnet-beta.';

export const EXECUTION_CLUSTER_MISMATCH_MESSAGE =
  'Connected Solana RPC genesis hash is not the official mainnet-beta genesis. e14 will not mark a candidate simulation_passed on a mismatched cluster.';

export const EXECUTION_RPC_UNAVAILABLE_MESSAGE =
  'Solana RPC cluster identity or block height was unavailable. e14 will not mark a candidate simulation_passed without that evidence.';

export const EXECUTION_MISSING_PUBLIC_CONFIG_MESSAGE =
  'Checkpoint 14 refuses to call Jupiter before required public execution config is present. Set EXECUTION_TAKER_PUBKEY, EXECUTION_INPUT_MINT, EXECUTION_OUTPUT_MINT, and EXECUTION_AMOUNT_RAW. There is no default wallet, token, or amount.';
