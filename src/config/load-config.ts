import {
  DEFAULT_LOG_LEVEL,
  DEFAULT_NODE_ENV,
  DEFAULT_SOLANA_NETWORK,
  DEFAULT_SOLANA_RPC_TIMEOUT_MS,
  DEFAULT_SOLANA_RPC_URL,
  DEFAULT_TRADING_ENABLED,
} from './defaults.js';
import {
  LOG_LEVEL_VALUES,
  NODE_ENV_VALUES,
  SOLANA_NETWORK_VALUES,
  type AppConfig,
  type EnvSource,
} from './types.js';
import {
  parseBooleanFlag,
  parseEnumValue,
  parseHttpUrl,
  parsePositiveInteger,
  readOptionalEnv,
} from '../utils/parse-env.js';

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
  };
}
