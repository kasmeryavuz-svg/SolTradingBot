export const WALLET_INTELLIGENCE_ERROR_CODES = [
  'invalid_mint',
  'unsupported_network',
  'cluster_mismatch',
  'missing_helius_api_key',
  'provider_unavailable',
  'provider_rate_limited',
  'provider_auth_failed',
  'provider_invalid_response',
  'provider_integrity_failure',
  'provider_timeout',
  'database_unavailable',
  'schema_mismatch',
  'scan_not_found',
  'persistence_failed',
  'duplicate_scan',
  'wallet_intelligence_failed',
] as const;

export type WalletIntelligenceErrorCode = (typeof WALLET_INTELLIGENCE_ERROR_CODES)[number];

export class WalletIntelligenceError extends Error {
  readonly code: WalletIntelligenceErrorCode;

  constructor(message: string, options?: { cause?: unknown; code?: WalletIntelligenceErrorCode }) {
    super(message, options);
    this.name = 'WalletIntelligenceError';
    this.code = options?.code ?? 'wallet_intelligence_failed';
  }
}
