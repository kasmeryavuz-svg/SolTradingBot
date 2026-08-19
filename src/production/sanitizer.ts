import { PROD20_REDACTED_URL_TOKEN } from './constants.js';

const HTTP_URL = /https?:\/\/[^\s<>"'`]+/gi;
const SENSITIVE_ASSIGNMENT =
  /\b(?:x-api-key|privateKey|private_key|secret|api[_-]?key|authorization|password|mnemonic|seed(?:Phrase)?|token)\s*[:=]\s*[^\s,;]+/gi;
const BEARER_TOKEN = /\bBearer\s+[^\s,;]+/gi;
const AUTHORIZATION_HEADER = /\bAuthorization\s*[:=]\s*[^\s,;]+/gi;
const HOST_SECRET_PATH = /\b([A-Za-z0-9.-]+\/)([A-Za-z0-9_-]{8,})\b/g;

export function sanitizeProductionUrl(): string {
  return PROD20_REDACTED_URL_TOKEN;
}

export function sanitizeProductionText(text: string): string {
  let sanitized = text.replace(HTTP_URL, PROD20_REDACTED_URL_TOKEN);
  sanitized = sanitized.replace(BEARER_TOKEN, 'Bearer REDACTED');
  sanitized = sanitized.replace(AUTHORIZATION_HEADER, 'Authorization=REDACTED');
  sanitized = sanitized.replace(SENSITIVE_ASSIGNMENT, (match) => {
    const separator = match.includes(':') && !match.includes('=') ? ':' : '=';
    const name = match.split(/[:=]/)[0]?.trim() ?? 'secret';
    return `${name}${separator}REDACTED`;
  });
  sanitized = sanitized.replace(HOST_SECRET_PATH, '$1REDACTED');
  return sanitized;
}

export function sanitizeProductionErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return sanitizeProductionText(error.message);
  }
  return sanitizeProductionText(String(error));
}

export function sanitizeDatabasePathDisplay(path: string): string {
  const trimmed = path.trim();
  if (trimmed === ':memory:') {
    return ':memory:';
  }
  if (trimmed === '') {
    return '<configured>';
  }
  const parts = trimmed.split(/[/\\]/);
  const base = parts[parts.length - 1];
  return base === undefined || base === '' ? '<configured>' : base;
}
