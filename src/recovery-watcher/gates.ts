import { DEFAULT_LIVE_BROADCAST_ENABLED, DEFAULT_TRADING_ENABLED } from '../config/defaults.js';
import type { EnvSource } from '../config/env-source.js';
import { parseBooleanFlag, readOptionalEnv } from '../utils/parse-env.js';
import { RecoveryWatcherError } from './errors.js';

export function assertRecoveryLiveGatesClosed(source: EnvSource): void {
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
    throw new RecoveryWatcherError(
      'Refusing Recovery Watcher because TRADING_ENABLED=true. rw0_v1 is paper/data research only and never executes live transactions.',
      { code: 'trading_enabled' },
    );
  }
  if (liveBroadcastEnabled) {
    throw new RecoveryWatcherError(
      'Refusing Recovery Watcher because LIVE_BROADCAST_ENABLED=true. rw0_v1 is paper/data research only. Manual CP16 live remains a separate operator command.',
      { code: 'live_broadcast_enabled' },
    );
  }
}
