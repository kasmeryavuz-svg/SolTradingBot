import type { EnvSource } from '../config/env-source.js';
import { parseBooleanFlag, readOptionalEnv } from '../utils/parse-env.js';
import { DEFAULT_LIVE_BROADCAST_ENABLED, DEFAULT_TRADING_ENABLED } from '../config/defaults.js';
import { ProductionError } from './errors.js';

export function assertProductionLiveGatesClosed(source: EnvSource): void {
  const tradingEnabled = parseBooleanFlag(
    readOptionalEnv(source, 'TRADING_ENABLED'),
    DEFAULT_TRADING_ENABLED,
    'TRADING_ENABLED',
  );
  const liveBroadcastEnabled = parseBooleanFlag(
    readOptionalEnv(source, 'LIVE_BROADCAST_ENABLED'),
    DEFAULT_LIVE_BROADCAST_ENABLED,
    'LIVE_BROADCAST_ENABLED',
  );

  if (tradingEnabled) {
    throw new ProductionError(
      'trading_enabled',
      'Refusing to start production runtime because TRADING_ENABLED=true. prod20 is paper/data only and never executes live transactions.',
    );
  }
  if (liveBroadcastEnabled) {
    throw new ProductionError(
      'live_broadcast_enabled',
      'Refusing to start production runtime because LIVE_BROADCAST_ENABLED=true. prod20 is paper/data only. Manual CP16 live remains a separate operator command.',
    );
  }
}
