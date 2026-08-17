import { RiskScanError } from './types.js';

export const RAW_AMOUNT_PATTERN = /^(0|[1-9]\d*)$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseRawAmount(value: unknown, field: string): string {
  if (typeof value !== 'string' || !RAW_AMOUNT_PATTERN.test(value)) {
    throw new RiskScanError(`Invalid ${field}. Expected a non-negative decimal integer string.`);
  }

  return value;
}

export function parseSafeSlot(value: unknown, field: string): number {
  if (typeof value === 'bigint') {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RiskScanError(`Invalid ${field}. Slot exceeds a safe integer.`);
    }
    return Number(value);
  }

  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return parseSafeSlot(Number(value), field);
  }

  throw new RiskScanError(`Invalid ${field}. Expected a non-negative safe integer.`);
}

export function parseDecimals(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) {
    throw new RiskScanError('Invalid mint decimals. Expected an integer from 0 to 255.');
  }

  return value;
}

export function parseBasisPoints(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new RiskScanError(`Invalid ${field}. Expected an integer from 0 to 10000.`);
  }

  return value;
}

export function formatBasisPoints(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const fraction = String(Math.abs(bps % 100)).padStart(2, '0');
  return `${String(whole)}.${fraction}%`;
}
