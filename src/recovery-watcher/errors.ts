export const RECOVERY_WATCHER_ERROR_CODES = [
  'trading_enabled',
  'live_broadcast_enabled',
  'configuration',
  'invalid_mint',
  'invalid_pair',
  'invalid_timestamp',
  'look_ahead',
  'illegal_transition',
  'active_episode_exists',
  'mint_in_cooldown',
  'episode_day_cap',
  'watch_cap',
  'watch_ttl_not_elapsed',
  'confirmation_after_watch_ttl',
  'safety_incomplete',
  'safe_paper_not_implemented',
  'shadow_paper_confusion',
  'close_evidence_required',
  'close_not_implemented',
  'stale_episode',
  'transition_conflict',
  'observation_conflict',
  'evidence_invalid',
  'persistence_failed',
  'schema_mismatch',
  'database_unavailable',
  'production_database_path',
  'lock_failure',
  'lock_already_held',
  'malformed_lock',
  'unknown_lock_identity',
  'definition_mismatch',
  'recovery_watcher_failed',
] as const;

export type RecoveryWatcherErrorCode = (typeof RECOVERY_WATCHER_ERROR_CODES)[number];

export class RecoveryWatcherError extends Error {
  readonly code: RecoveryWatcherErrorCode;

  constructor(message: string, options?: { cause?: unknown; code?: RecoveryWatcherErrorCode }) {
    super(message, options);
    this.name = 'RecoveryWatcherError';
    this.code = options?.code ?? 'recovery_watcher_failed';
  }
}
