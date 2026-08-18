import type { AppConfig } from '../config/types.js';
import {
  LIVE_CHECKPOINT,
  LIVE_MAX_BROADCAST_ATTEMPTS_PER_UTC_DAY,
  LIVE_MAX_BROADCAST_INPUT_LAMPORTS_PER_UTC_DAY,
  LIVE_MAX_INPUT_LAMPORTS_PER_ATTEMPT,
  LIVE_PAIR_LABEL,
  LIVE_SPEC_NAME,
  LIVE_SPEC_VERSION,
} from './constants.js';
import { LIVE_DEFINITION_FINGERPRINT } from './identity.js';
import type { LiveStatusReport } from './types.js';

export function buildLiveStatusReport(config: AppConfig): LiveStatusReport {
  return {
    specVersion: LIVE_SPEC_VERSION,
    specName: LIVE_SPEC_NAME,
    liveDefinitionFingerprint: LIVE_DEFINITION_FINGERPRINT,
    checkpoint: LIVE_CHECKPOINT,
    pair: LIVE_PAIR_LABEL,
    maxInputLamportsPerAttempt: LIVE_MAX_INPUT_LAMPORTS_PER_ATTEMPT.toString(),
    maxDailyBroadcastInputLamports: LIVE_MAX_BROADCAST_INPUT_LAMPORTS_PER_UTC_DAY.toString(),
    maxAttemptsPerUtcDay: LIVE_MAX_BROADCAST_ATTEMPTS_PER_UTC_DAY,
    broadcastProvider: 'standard Solana RPC',
    jito: 'disabled',
    tradingEnabled: config.tradingEnabled,
    liveBroadcastEnabled: config.liveBroadcastEnabled,
    wallet: 'interactive only',
    automaticTrading: 'unavailable',
    dashboardLiveControls: 'unavailable',
  };
}
