import {
  DEFAULT_PROD20_HEALTH_PORT,
  DEFAULT_PROD20_INTERVAL_MS,
  PROD20_CHECKPOINT,
  PROD20_HEALTH_HOST,
  PROD20_MAX_WATCHLIST,
  PROD20_SPEC_NAME,
  PROD20_SPEC_VERSION,
  REQUIRED_SCHEMA_VERSION,
} from './constants.js';
import { PROD20_DEFINITION_FINGERPRINT } from './identity.js';
import { sanitizeDatabasePathDisplay } from './sanitizer.js';
import type { ProductionRuntimeConfig } from './types.js';

export function formatProductionStatusLines(): string[] {
  return [
    'Checkpoint 20',
    `prod20 version: ${PROD20_SPEC_VERSION}`,
    `name: ${PROD20_SPEC_NAME}`,
    `fingerprint: ${PROD20_DEFINITION_FINGERPRINT}`,
    'deployment capability: PAPER / DATA ONLY',
    'automatic live trading: UNAVAILABLE',
    'manual CP16 live: SEPARATE',
    'ML production input: NO',
    'wallet intelligence production input: NO',
    `schema: ${String(REQUIRED_SCHEMA_VERSION)}`,
    'migration 010: ABSENT',
    `health bind: ${PROD20_HEALTH_HOST}`,
    `default health port: ${String(DEFAULT_PROD20_HEALTH_PORT)}`,
    `default interval: ${String(DEFAULT_PROD20_INTERVAL_MS)}`,
    `max watchlist: ${String(PROD20_MAX_WATCHLIST)}`,
  ];
}

export function formatProductionPlanLines(config: ProductionRuntimeConfig): string[] {
  return [
    'Checkpoint 20 production plan',
    `prod enabled: ${config.enabled ? 'yes' : 'no'}`,
    `collector enabled: ${config.collectorEnabled ? 'yes' : 'no'}`,
    `paper enabled: ${config.paperEnabled ? 'yes' : 'no'}`,
    `watchlist count: ${String(config.paperMints.length)}`,
    `interval: ${String(config.intervalMs)}`,
    `health host: ${PROD20_HEALTH_HOST}`,
    `health port: ${String(config.healthPort)}`,
    `trading enabled: ${config.tradingEnabled ? 'true' : 'false'}`,
    `live broadcast enabled: ${config.liveBroadcastEnabled ? 'true' : 'false'}`,
    `database enabled: ${config.databaseEnabled ? 'yes' : 'no'}`,
    `database path: ${sanitizeDatabasePathDisplay(config.databasePath)}`,
    `work mode: ${config.workMode}`,
    `checkpoint: ${PROD20_CHECKPOINT}`,
  ];
}

export function formatProductionPreflightLines(): string[] {
  return [
    'Checkpoint 20 production preflight',
    'status: PASS',
    `spec: ${PROD20_SPEC_VERSION}`,
    `fingerprint: ${PROD20_DEFINITION_FINGERPRINT}`,
    `schema: ${String(REQUIRED_SCHEMA_VERSION)}`,
    'migration 010: ABSENT',
    'automatic live trading: UNAVAILABLE',
  ];
}
