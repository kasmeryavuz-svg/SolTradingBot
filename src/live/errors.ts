export const LIVE_ERROR_CODES = [
  'trading_disabled',
  'live_broadcast_disabled',
  'unsupported_live_pair',
  'amount_over_cap',
  'daily_input_cap',
  'daily_attempt_cap',
  'missing_public_config',
  'unsupported_network',
  'database_disabled',
  'preflight_not_passed',
  'priority_fee_over_cap',
  'rpc_fee_unavailable',
  'rpc_fee_over_cap',
  'low_sol_balance',
  'stale_live_candidate',
  'confirmation_required',
  'confirmation_cancelled',
  'confirmation_mismatch',
  'interactive_tty_required',
  'unexpected_arguments',
  'confirmation_bypass_refused',
  'duplicate_live_candidate',
  'signer_mismatch',
  'signature_verification_failed',
  'candidate_changed',
  'candidate_changed_after_confirmation',
  'rpc_signature_mismatch',
  'rpc_signature_malformed',
  'broadcast_rejected',
  'broadcast_outcome_unknown',
  'broadcast_submitting_required',
  'persist_failed_before_send',
  'confirmation_integrity_error',
  'receipt_integrity_error',
  'receipt_fee_anomaly',
  'nothing_to_reconcile',
  'provider_unavailable',
  'daily_limit_exceeded',
  'live_operation_failed',
] as const;

export type LiveErrorCode = (typeof LIVE_ERROR_CODES)[number];

export class LiveError extends Error {
  readonly code: LiveErrorCode;

  constructor(message: string, options?: { cause?: unknown; code?: LiveErrorCode }) {
    super(message, options);
    this.name = 'LiveError';
    this.code = options?.code ?? 'live_operation_failed';
  }
}
