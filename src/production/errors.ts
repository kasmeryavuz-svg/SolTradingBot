export type ProductionErrorCode =
  | 'trading_enabled'
  | 'live_broadcast_enabled'
  | 'production_disabled'
  | 'no_production_work_enabled'
  | 'invalid_watchlist'
  | 'invalid_interval'
  | 'invalid_health_port'
  | 'production_instance_already_running'
  | 'malformed_lock'
  | 'unknown_lock_identity'
  | 'lock_failure'
  | 'database_integrity'
  | 'recoverable_operation'
  | 'configuration'
  | 'preflight_failed'
  | 'definition_mismatch'
  | 'node_engine'
  | 'circuit_open'
  | 'health_bind'
  | 'health_server'
  | 'fatal_startup';

export class ProductionError extends Error {
  readonly code: ProductionErrorCode;
  readonly fatal: boolean;

  constructor(code: ProductionErrorCode, message: string, options?: { fatal?: boolean; cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ProductionError';
    this.code = code;
    this.fatal = options?.fatal ?? true;
  }
}
