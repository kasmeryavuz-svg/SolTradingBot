import { sanitizeErrorText } from '../utils/sanitize-rpc-url.js';
import { LiveError, type LiveErrorCode } from './errors.js';

const WIRE_LIKE =
  /(?:[A-Za-z0-9+/]{80,}={0,2})|(?:[1-9A-HJ-NP-Za-km-z]{80,})/g;

export function sanitizeLiveText(text: string, secrets: readonly string[] = []): string {
  let sanitized = sanitizeErrorText(text);
  for (const secret of secrets) {
    if (secret.length > 0) {
      sanitized = sanitized.split(secret).join('[redacted]');
    }
  }
  return sanitized.replace(WIRE_LIKE, '[redacted-binary]');
}

export function formatLiveError(error: unknown, secrets: readonly string[] = []): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeLiveText(message, secrets);
}

export function toSanitizedLiveError(
  error: unknown,
  secrets: readonly string[] = [],
  code: LiveErrorCode = 'live_operation_failed',
): LiveError {
  if (error instanceof LiveError) {
    return new LiveError(sanitizeLiveText(error.message, secrets), { code: error.code });
  }
  const message = error instanceof Error ? error.message : 'Live operation failed.';
  return new LiveError(sanitizeLiveText(message, secrets), { code });
}

export function assertPublicValueHasNoWire(value: unknown, path = '$'): void {
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
    throw new LiveError(`Public live result leaked binary material at ${path}.`);
  }
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && (value.length >= 80 && /[+/=]/.test(value) || /wire|base64/i.test(path))) {
      if (/^[A-Za-z0-9+/]+=*$/.test(value) && value.length >= 80) {
        throw new LiveError(`Public live result leaked wire-like text at ${path}.`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertPublicValueHasNoWire(item, `${path}[${String(index)}]`);
    });
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (
      /^(signedTransaction|compiledSignedTransaction|wireBytes|messageBytes|transactionBase64|wireBase64|signedWire|signatureBytes)$/i.test(
        key,
      )
    ) {
      throw new LiveError(`Public live result leaked forbidden field ${path}.${key}.`);
    }
    assertPublicValueHasNoWire(item, `${path}.${key}`);
  }
}
