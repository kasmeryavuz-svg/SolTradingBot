import { sanitizeErrorText, sanitizeRpcUrl } from '../utils/sanitize-rpc-url.js';

const SECRET_PLACEHOLDER = '[redacted]';
const SUBSTRING_REDACT_MIN = 12;
const QUERY_SECRET = /(?:api-key|api_key|HELIUS_API_KEY)\s*[=:]\s*[^\s&"']+/gi;

export function collectErrorText(error: unknown, depth = 0): string {
  if (depth > 5 || error === undefined || error === null) {
    return '';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof AggregateError) {
    return [error.message, ...error.errors.map((item) => collectErrorText(item, depth + 1))]
      .filter((item) => item !== '')
      .join('\n');
  }
  if (error instanceof Error) {
    const cause = 'cause' in error ? collectErrorText(error.cause, depth + 1) : '';
    return [error.message, cause].filter((item) => item !== '').join('\n');
  }
  return 'Wallet intelligence operation failed.';
}

export function sanitizeWalletIntelligenceText(text: string, secrets: readonly string[] = []): string {
  let sanitized = sanitizeErrorText(text);
  sanitized = sanitized.replace(QUERY_SECRET, (match) => {
    const separator = match.includes('=') ? '=' : ':';
    const prefix = match.split(/[=:]/, 1)[0] ?? 'api-key';
    return `${prefix}${separator}${SECRET_PLACEHOLDER}`;
  });
  for (const secret of secrets) {
    if (secret.length === 0) {
      continue;
    }
    sanitized = sanitized.split(secret).join(SECRET_PLACEHOLDER);
    if (secret.length >= SUBSTRING_REDACT_MIN) {
      for (let index = 0; index <= secret.length - SUBSTRING_REDACT_MIN; index += 1) {
        sanitized = sanitized.split(secret.slice(index, index + SUBSTRING_REDACT_MIN)).join(SECRET_PLACEHOLDER);
      }
    }
  }
  return sanitized;
}

export function formatWalletIntelligenceError(error: unknown, secrets: readonly string[] = []): string {
  return sanitizeWalletIntelligenceText(collectErrorText(error) || 'Wallet intelligence operation failed.', secrets);
}

export function containsSecret(text: string, secrets: readonly string[]): boolean {
  return secrets.some((secret) => secret.length > 0 && text.includes(secret));
}

export function assertNoSecret(text: string, secrets: readonly string[], label: string): void {
  if (containsSecret(text, secrets)) {
    throw new Error(`${label} leaked a configured secret.`);
  }
}

export function assertNoAuthenticatedProviderUrl(text: string): void {
  if (/helius-rpc\.com\/?\?[^\s]*api-key=/i.test(text) && !text.includes(SECRET_PLACEHOLDER)) {
    throw new Error('Authenticated Helius URL leaked.');
  }
  try {
    if (text.includes('https://') || text.includes('http://')) {
      const sanitized = sanitizeRpcUrl(text);
      if (sanitized.includes('api-key=') && !sanitized.includes('REDACTED') && !sanitized.includes(SECRET_PLACEHOLDER)) {
        throw new Error('Authenticated Helius URL leaked.');
      }
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Authenticated Helius URL leaked.') {
      throw error;
    }
  }
}

export function secretsFromApiKey(apiKey: string | null | undefined): string[] {
  if (apiKey === null || apiKey === undefined || apiKey === '') {
    return [];
  }
  return [apiKey];
}
