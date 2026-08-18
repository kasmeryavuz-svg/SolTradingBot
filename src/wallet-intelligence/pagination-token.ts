import { PAGINATION_TOKEN_MAX_LENGTH } from './constants.js';
import { WalletIntelligenceError } from './errors.js';

export function parsePaginationToken(value: unknown, previous: readonly string[]): string {
  if (typeof value !== 'string' || value.trim() === '' || value.trim() !== value) {
    throw new WalletIntelligenceError(
      'Provider returned a malformed pagination token. Provider integrity failure.',
      { code: 'provider_integrity_failure' },
    );
  }
  if (value.length > PAGINATION_TOKEN_MAX_LENGTH) {
    throw new WalletIntelligenceError(
      'Provider returned a pagination token that exceeds the integrity length bound.',
      { code: 'provider_integrity_failure' },
    );
  }
  if (previous.includes(value)) {
    throw new WalletIntelligenceError(
      'Provider repeated a pagination token. Provider integrity failure.',
      { code: 'provider_integrity_failure' },
    );
  }
  return value;
}
