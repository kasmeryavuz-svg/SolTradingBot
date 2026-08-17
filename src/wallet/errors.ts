export const WALLET_ERROR_CODES = [
  'wallet_config_missing',
  'interactive_tty_required',
  'secret_input_cancelled',
  'secret_input_too_long',
  'invalid_secret_encoding',
  'invalid_secret_length',
  'signer_address_mismatch',
  'signer_unavailable',
  'self_test_signature_failed',
  'preflight_not_passed',
  'candidate_changed_after_preflight',
  'blockhash_expired_before_signing',
  'compiled_signer_mismatch',
  'signature_verification_failed',
  'wallet_operation_failed',
  'trading_enabled',
  'unexpected_arguments',
] as const;

export type WalletErrorCode = (typeof WALLET_ERROR_CODES)[number];

export class WalletError extends Error {
  readonly code: WalletErrorCode;

  constructor(message: string, options?: { cause?: unknown; code?: WalletErrorCode }) {
    super(message, options);
    this.name = 'WalletError';
    this.code = options?.code ?? 'wallet_operation_failed';
  }
}
