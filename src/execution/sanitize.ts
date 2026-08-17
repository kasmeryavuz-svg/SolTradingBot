import { sanitizeErrorText } from '../utils/sanitize-rpc-url.js';

const SECRET_PLACEHOLDER = '[redacted]';

export function sanitizeExecutionText(text: string, secrets: readonly string[] = []): string {
  let sanitized = sanitizeErrorText(text);
  for (const secret of secrets) {
    if (secret.length === 0) {
      continue;
    }
    sanitized = sanitized.split(secret).join(SECRET_PLACEHOLDER);
  }
  return sanitized;
}

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
  return '';
}

export function formatExecutionError(error: unknown, secrets: readonly string[] = []): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeExecutionText(message, secrets);
}

export function containsSecret(text: string, secrets: readonly string[]): boolean {
  return secrets.some((secret) => secret.length > 0 && text.includes(secret));
}

export function assertNoSecret(text: string, secrets: readonly string[], label: string): void {
  if (containsSecret(text, secrets)) {
    throw new Error(`${label} leaked a configured secret.`);
  }
}
