import { DEFAULT_LOG_LEVEL, DEFAULT_NODE_ENV, DEFAULT_TRADING_ENABLED } from './defaults.js';
import {
  LOG_LEVEL_VALUES,
  NODE_ENV_VALUES,
  type AppConfig,
  type EnvSource,
} from './types.js';
import { parseBooleanFlag, parseEnumValue, readOptionalEnv } from '../utils/parse-env.js';

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
  };
}
