import { DEFAULT_HISTORY_LIMIT, HISTORY_LIMIT_MAX } from '../config/defaults.js';

export function clampHistoryLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.min(limit, HISTORY_LIMIT_MAX);
}
