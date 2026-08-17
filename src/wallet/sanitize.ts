import { sanitizeErrorText } from '../utils/sanitize-rpc-url.js';
import { WalletError, type WalletErrorCode } from './errors.js';

const SECRET_PLACEHOLDER = '[redacted]';
const SUBSTRING_REDACT_MIN = 12;

export function sanitizeWalletText(text: string, secrets: readonly string[] = []): string {
  let sanitized = sanitizeErrorText(text);
  for (const secret of secrets) {
    if (secret.length === 0) {
      continue;
    }
    sanitized = sanitized.split(secret).join(SECRET_PLACEHOLDER);
    if (secret.length >= SUBSTRING_REDACT_MIN) {
      for (let index = 0; index <= secret.length - SUBSTRING_REDACT_MIN; index += 1) {
        const slice = secret.slice(index, index + SUBSTRING_REDACT_MIN);
        sanitized = sanitized.split(slice).join(SECRET_PLACEHOLDER);
      }
    }
  }
  return sanitized;
}

export function formatWalletError(error: unknown, secrets: readonly string[] = []): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeWalletText(message, secrets);
}

export function toSanitizedWalletError(
  error: unknown,
  secrets: readonly string[] = [],
  code: WalletErrorCode = 'wallet_operation_failed',
): WalletError {
  if (error instanceof WalletError) {
    return new WalletError(sanitizeWalletText(error.message, secrets), { code: error.code });
  }
  const message = error instanceof Error ? error.message : 'Wallet operation failed.';
  return new WalletError(sanitizeWalletText(message, secrets), { code });
}

export function containsSecret(text: string, secrets: readonly string[]): boolean {
  return secrets.some((secret) => secret.length > 0 && text.includes(secret));
}

export function assertNoSecret(text: string, secrets: readonly string[], label: string): void {
  if (containsSecret(text, secrets)) {
    throw new Error(`${label} leaked a configured secret.`);
  }
}

export function assertPublicValueHasNoBinaryArtifact(value: unknown, path = '$'): void {
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
    throw new WalletError(`Public wallet result leaked binary material at ${path}.`, {
      code: 'wallet_operation_failed',
    });
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertPublicValueHasNoBinaryArtifact(item, `${path}[${String(index)}]`);
    });
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (
      /^(signedTransaction|compiledSignedTransaction|wireBytes|messageBytes|transactionBase64|wireBase64|signatureBytes|signatures)$/i.test(
        key,
      )
    ) {
      throw new WalletError(`Public wallet result leaked forbidden field ${path}.${key}.`, {
        code: 'wallet_operation_failed',
      });
    }
    assertPublicValueHasNoBinaryArtifact(item, `${path}.${key}`);
  }
}
