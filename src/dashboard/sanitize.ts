import { basename } from 'node:path';
import type { AppConfig } from '../config/types.js';
import { MEMORY_DATABASE_PATH } from '../config/defaults.js';
import { DASHBOARD_CHECKPOINT, DASHBOARD_SPEC_VERSION } from './constants.js';
import { DashboardError } from './errors.js';
import type { SanitizedDashboardConfig } from './types.js';

const WINDOWS_PATH = /[A-Za-z]:\\[^\s"'`]+/g;
const POSIX_HOME_PATH = /\/(?:home|Users)\/[^\s"'`]+/g;
const CREDENTIAL_URL = /https?:\/\/[^/\s]*:[^/\s]*@/i;
const PRIVATE_KEY_LIKE = /(?:private[_ -]?key|seed phrase|SECRET_API_KEY)/i;

export function databaseFilename(path: string): string {
  if (path === MEMORY_DATABASE_PATH) {
    return MEMORY_DATABASE_PATH;
  }
  return basename(path);
}

export function sanitizeDashboardConfig(config: AppConfig): SanitizedDashboardConfig {
  return {
    nodeEnv: config.nodeEnv,
    solanaNetwork: config.solana.network,
    databaseEnabled: config.database.enabled,
    databaseFilename: config.database.enabled ? databaseFilename(config.database.path) : null,
    discoveryEnabled: config.discovery.enabled,
    configuredMarketTokenCount: config.marketData.tokenMints.length,
    checkpoint: DASHBOARD_CHECKPOINT,
    dashboardSpecVersion: DASHBOARD_SPEC_VERSION,
  };
}

export function sanitizeDashboardReason(error: unknown): string {
  if (error instanceof DashboardError) {
    if (containsForbiddenSecretText(error.message)) {
      return 'Section unavailable.';
    }
    return error.message;
  }

  const message = error instanceof Error ? error.message : '';
  if (containsForbiddenSecretText(message)) {
    return 'Section unavailable.';
  }
  if (/does not exist/i.test(message) || /not available/i.test(message) || /cannot open/i.test(message) || /permission denied/i.test(message)) {
    return 'Database file is not available.';
  }
  if (/schema/i.test(message) || /incompatible/i.test(message) || /missing required (?:table|column)/i.test(message)) {
    return 'Database schema is incompatible.';
  }
  if (/integrity/i.test(message)) {
    return 'Database integrity check failed.';
  }
  if (/disabled/i.test(message) && /persist|database/i.test(message)) {
    return 'Database is disabled.';
  }
  return 'Section unavailable.';
}

export function containsForbiddenSecretText(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes('solana_rpc_url')) {
    return true;
  }
  if (lower.includes('process.env')) {
    return true;
  }
  if (PRIVATE_KEY_LIKE.test(text)) {
    return true;
  }
  if (CREDENTIAL_URL.test(text)) {
    return true;
  }
  if (WINDOWS_PATH.test(text) || POSIX_HOME_PATH.test(text)) {
    WINDOWS_PATH.lastIndex = 0;
    POSIX_HOME_PATH.lastIndex = 0;
    return true;
  }
  WINDOWS_PATH.lastIndex = 0;
  POSIX_HOME_PATH.lastIndex = 0;
  return false;
}

export function assertResponseTextIsSanitized(text: string): void {
  if (containsForbiddenSecretText(text)) {
    throw new DashboardError('Dashboard response contained sanitized-secret leakage.');
  }
}
