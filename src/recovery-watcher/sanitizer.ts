import { basename } from 'node:path';
import { RW0_MEMORY_DATABASE_PATH, RW0_REDACTED_URL_TOKEN } from './constants.js';

const HTTP_URL = /https?:\/\/[^\s<>"'`]+/gi;
const SENSITIVE_ASSIGNMENT =
  /\b(?:x-api-key|privateKey|private_key|secret|api[_-]?key|authorization|password|mnemonic|seed(?:Phrase)?|token)\s*[:=]\s*[^\s,;]+/gi;
const BEARER_TOKEN = /\bBearer\s+[^\s,;]+/gi;
const AUTHORIZATION_HEADER = /\bAuthorization\s*[:=]\s*[^\s,;]+/gi;

export function sanitizeRecoveryText(text: string): string {
  let sanitized = text.replace(HTTP_URL, RW0_REDACTED_URL_TOKEN);
  sanitized = sanitized.replace(BEARER_TOKEN, 'Bearer REDACTED');
  sanitized = sanitized.replace(AUTHORIZATION_HEADER, 'Authorization=REDACTED');
  sanitized = sanitized.replace(SENSITIVE_ASSIGNMENT, (match) => {
    const separator = match.includes(':') && !match.includes('=') ? ':' : '=';
    const name = match.split(/[:=]/)[0]?.trim() ?? 'secret';
    return `${name}${separator}REDACTED`;
  });
  return sanitized;
}

export function sanitizeRecoveryErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeRecoveryText(error.message);
  }
  return sanitizeRecoveryText(String(error));
}

export function sanitizeRecoveryDatabasePathDisplay(path: string): string {
  const trimmed = path.trim();
  if (trimmed === RW0_MEMORY_DATABASE_PATH) {
    return RW0_MEMORY_DATABASE_PATH;
  }
  if (trimmed === '') {
    return '<configured>';
  }
  const base = basename(trimmed);
  return base === '' ? '<configured>' : base;
}
