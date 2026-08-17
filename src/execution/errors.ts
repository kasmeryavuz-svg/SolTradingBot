export class ExecutionError extends Error {
  readonly code: string;

  constructor(message: string, options?: { cause?: unknown; code?: string }) {
    super(message, options);
    this.name = 'ExecutionError';
    this.code = options?.code ?? 'execution_error';
  }
}

export const EXECUTION_STATUSES = [
  'build_validated',
  'simulation_passed',
  'simulation_failed',
  'blocked_compute_limit',
  'blocked_priority_fee_cap',
  'expired_blockhash',
  'unsupported_signer_requirement',
    'unsupported_network',
    'cluster_mismatch',
    'rpc_unavailable',
    'blocked_transaction_size',
    'provider_contract_changed',
  'provider_rate_limited',
  'provider_auth_failed',
  'provider_unavailable',
  'provider_invalid_response',
  'provider_no_route',
  'missing_public_config',
  'blocked',
  'expired',
  'unsupported',
] as const;

export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];
