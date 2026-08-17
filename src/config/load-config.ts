import { parseTokenMintList } from '../market-data/watchlist.js';
import {
  ConfigError,
  parseBooleanFlag,
  parseBoundedPositiveInteger,
  parseEnumValue,
  parseHttpUrl,
  parsePositiveInteger,
  readOptionalEnv,
} from '../utils/parse-env.js';
import {
  DEFAULT_DISCOVERY_ENABLED,
  DEFAULT_DISCOVERY_ENRICH_MARKET_DATA,
  DEFAULT_DISCOVERY_INCLUDE_BOOSTS,
  DEFAULT_DISCOVERY_INCLUDE_PROFILES,
  DEFAULT_DISCOVERY_MAX_CANDIDATES,
  DEFAULT_DISCOVERY_POLL_INTERVAL_MS,
  DEFAULT_DISCOVERY_TIMEOUT_MS,
  DEFAULT_DATABASE_BUSY_TIMEOUT_MS,
  DEFAULT_DATABASE_ENABLED,
  DEFAULT_DATABASE_PATH,
  DEFAULT_LOG_LEVEL,
  DEFAULT_MARKET_DATA_POLL_INTERVAL_MS,
  DEFAULT_MARKET_DATA_TIMEOUT_MS,
  DEFAULT_MARKET_DATA_TOKEN_MINTS,
  DEFAULT_NODE_ENV,
  DEFAULT_SOLANA_NETWORK,
  DEFAULT_SOLANA_RPC_TIMEOUT_MS,
  DEFAULT_SOLANA_RPC_URL,
  DEFAULT_FEATURE_HISTORY_LIMIT,
  DEFAULT_STRATEGY_HISTORY_LIMIT,
  DEFAULT_RISK_HISTORY_LIMIT,
  DEFAULT_RISK_SCAN_COMMITMENT,
  DEFAULT_RISK_SCAN_TIMEOUT_MS,
  DEFAULT_TRADING_ENABLED,
  DISCOVERY_MAX_CANDIDATES_LIMIT,
  HISTORY_LIMIT_MAX,
} from './defaults.js';
import {
  LOG_LEVEL_VALUES,
  NODE_ENV_VALUES,
  RISK_COMMITMENT_VALUES,
  SOLANA_NETWORK_VALUES,
  type AppConfig,
  type EnvSource,
} from './types.js';

export function loadConfig(source: EnvSource): AppConfig {
  return {
    nodeEnv: parseEnumValue(
      readOptionalEnv(source, 'NODE_ENV'),
      NODE_ENV_VALUES,
      DEFAULT_NODE_ENV,
      'NODE_ENV',
    ),
    logLevel: parseEnumValue(
      readOptionalEnv(source, 'LOG_LEVEL'),
      LOG_LEVEL_VALUES,
      DEFAULT_LOG_LEVEL,
      'LOG_LEVEL',
    ),
    tradingEnabled: parseBooleanFlag(
      readOptionalEnv(source, 'TRADING_ENABLED'),
      DEFAULT_TRADING_ENABLED,
      'TRADING_ENABLED',
    ),
    solana: {
      network: parseEnumValue(
        readOptionalEnv(source, 'SOLANA_NETWORK'),
        SOLANA_NETWORK_VALUES,
        DEFAULT_SOLANA_NETWORK,
        'SOLANA_NETWORK',
      ),
      rpcTimeoutMs: parsePositiveInteger(
        readOptionalEnv(source, 'SOLANA_RPC_TIMEOUT_MS'),
        DEFAULT_SOLANA_RPC_TIMEOUT_MS,
        'SOLANA_RPC_TIMEOUT_MS',
      ),
      rpcUrl: parseHttpUrl(
        readOptionalEnv(source, 'SOLANA_RPC_URL'),
        DEFAULT_SOLANA_RPC_URL,
        'SOLANA_RPC_URL',
      ),
    },
    marketData: {
      tokenMints: parseTokenMintList(
        readOptionalEnv(source, 'MARKET_DATA_TOKEN_MINTS'),
        DEFAULT_MARKET_DATA_TOKEN_MINTS,
        'MARKET_DATA_TOKEN_MINTS',
      ),
      timeoutMs: parsePositiveInteger(
        readOptionalEnv(source, 'MARKET_DATA_TIMEOUT_MS'),
        DEFAULT_MARKET_DATA_TIMEOUT_MS,
        'MARKET_DATA_TIMEOUT_MS',
      ),
      pollIntervalMs: parsePositiveInteger(
        readOptionalEnv(source, 'MARKET_DATA_POLL_INTERVAL_MS'),
        DEFAULT_MARKET_DATA_POLL_INTERVAL_MS,
        'MARKET_DATA_POLL_INTERVAL_MS',
      ),
    },
    discovery: loadDiscoveryConfig(source),
    database: loadDatabaseConfig(source),
    risk: loadRiskConfig(source),
    features: loadFeatureConfig(source),
    strategy: loadStrategyConfig(source),
  };
}

function loadDiscoveryConfig(source: EnvSource): AppConfig['discovery'] {
  const discovery = {
    enabled: parseBooleanFlag(
      readOptionalEnv(source, 'DISCOVERY_ENABLED'),
      DEFAULT_DISCOVERY_ENABLED,
      'DISCOVERY_ENABLED',
    ),
    includeProfiles: parseBooleanFlag(
      readOptionalEnv(source, 'DISCOVERY_INCLUDE_PROFILES'),
      DEFAULT_DISCOVERY_INCLUDE_PROFILES,
      'DISCOVERY_INCLUDE_PROFILES',
    ),
    includeBoosts: parseBooleanFlag(
      readOptionalEnv(source, 'DISCOVERY_INCLUDE_BOOSTS'),
      DEFAULT_DISCOVERY_INCLUDE_BOOSTS,
      'DISCOVERY_INCLUDE_BOOSTS',
    ),
    timeoutMs: parsePositiveInteger(
      readOptionalEnv(source, 'DISCOVERY_TIMEOUT_MS'),
      DEFAULT_DISCOVERY_TIMEOUT_MS,
      'DISCOVERY_TIMEOUT_MS',
    ),
    pollIntervalMs: parsePositiveInteger(
      readOptionalEnv(source, 'DISCOVERY_POLL_INTERVAL_MS'),
      DEFAULT_DISCOVERY_POLL_INTERVAL_MS,
      'DISCOVERY_POLL_INTERVAL_MS',
    ),
    maxCandidates: parseBoundedPositiveInteger(
      readOptionalEnv(source, 'DISCOVERY_MAX_CANDIDATES'),
      DEFAULT_DISCOVERY_MAX_CANDIDATES,
      'DISCOVERY_MAX_CANDIDATES',
      DISCOVERY_MAX_CANDIDATES_LIMIT,
    ),
    enrichMarketData: parseBooleanFlag(
      readOptionalEnv(source, 'DISCOVERY_ENRICH_MARKET_DATA'),
      DEFAULT_DISCOVERY_ENRICH_MARKET_DATA,
      'DISCOVERY_ENRICH_MARKET_DATA',
    ),
  };

  if (discovery.enabled && !discovery.includeProfiles && !discovery.includeBoosts) {
    throw new ConfigError(
      'Invalid discovery configuration. Enable at least one discovery source when DISCOVERY_ENABLED=true.',
    );
  }

  return discovery;
}

function loadDatabaseConfig(source: EnvSource): AppConfig['database'] {
  return {
    enabled: parseBooleanFlag(
      readOptionalEnv(source, 'DATABASE_ENABLED'),
      DEFAULT_DATABASE_ENABLED,
      'DATABASE_ENABLED',
    ),
    path: parseDatabasePath(source['DATABASE_PATH'], DEFAULT_DATABASE_PATH),
    busyTimeoutMs: parsePositiveInteger(
      readOptionalEnv(source, 'DATABASE_BUSY_TIMEOUT_MS'),
      DEFAULT_DATABASE_BUSY_TIMEOUT_MS,
      'DATABASE_BUSY_TIMEOUT_MS',
    ),
  };
}

function loadRiskConfig(source: EnvSource): AppConfig['risk'] {
  return {
    timeoutMs: parsePositiveInteger(
      readOptionalEnv(source, 'RISK_SCAN_TIMEOUT_MS'),
      DEFAULT_RISK_SCAN_TIMEOUT_MS,
      'RISK_SCAN_TIMEOUT_MS',
    ),
    commitment: parseEnumValue(
      readOptionalEnv(source, 'RISK_SCAN_COMMITMENT'),
      RISK_COMMITMENT_VALUES,
      DEFAULT_RISK_SCAN_COMMITMENT,
      'RISK_SCAN_COMMITMENT',
    ),
    historyLimit: parseBoundedPositiveInteger(
      readOptionalEnv(source, 'RISK_HISTORY_LIMIT'),
      DEFAULT_RISK_HISTORY_LIMIT,
      'RISK_HISTORY_LIMIT',
      HISTORY_LIMIT_MAX,
    ),
  };
}

function loadFeatureConfig(source: EnvSource): AppConfig['features'] {
  return {
    historyLimit: parseBoundedPositiveInteger(
      readOptionalEnv(source, 'FEATURE_HISTORY_LIMIT'),
      DEFAULT_FEATURE_HISTORY_LIMIT,
      'FEATURE_HISTORY_LIMIT',
      HISTORY_LIMIT_MAX,
    ),
  };
}

function loadStrategyConfig(source: EnvSource): AppConfig['strategy'] {
  return {
    historyLimit: parseBoundedPositiveInteger(
      readOptionalEnv(source, 'STRATEGY_HISTORY_LIMIT'),
      DEFAULT_STRATEGY_HISTORY_LIMIT,
      'STRATEGY_HISTORY_LIMIT',
      HISTORY_LIMIT_MAX,
    ),
  };
}

function parseDatabasePath(raw: string | undefined, fallback: string): string {
  if (raw === undefined) {
    return fallback;
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new ConfigError('Invalid DATABASE_PATH. Expected a file path or :memory:.');
  }

  return trimmed;
}
