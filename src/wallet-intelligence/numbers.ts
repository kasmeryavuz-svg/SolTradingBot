import { createHash } from 'node:crypto';
import { BASIS_POINTS_PER_UNIT } from './constants.js';
import { WalletIntelligenceError } from './errors.js';

export const RAW_AMOUNT_PATTERN = /^(0|[1-9]\d*)$/;
export const SIGNED_RAW_AMOUNT_PATTERN = /^(0|-?[1-9]\d*)$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseNonNegativeRawAmount(value: unknown, field: string): string {
  if (typeof value !== 'string' || !RAW_AMOUNT_PATTERN.test(value)) {
    throw new WalletIntelligenceError(`Invalid ${field}. Expected a non-negative decimal integer string.`, {
      code: 'provider_integrity_failure',
    });
  }
  return value;
}

export function parseSignedRawAmount(value: string, field: string): bigint {
  if (!SIGNED_RAW_AMOUNT_PATTERN.test(value)) {
    throw new WalletIntelligenceError(`Invalid ${field}. Expected a canonical signed decimal integer string.`, {
      code: 'provider_integrity_failure',
    });
  }
  return BigInt(value);
}

export function canonicalRawAmount(value: bigint): string {
  return value.toString(10);
}

export function parseSafeSlot(value: unknown, field: string): number {
  if (typeof value === 'bigint') {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new WalletIntelligenceError(`Invalid ${field}. Slot exceeds a safe integer.`, {
        code: 'provider_integrity_failure',
      });
    }
    return Number(value);
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return parseSafeSlot(Number(value), field);
  }
  throw new WalletIntelligenceError(`Invalid ${field}. Expected a non-negative safe integer.`, {
    code: 'provider_integrity_failure',
  });
}

export function parseDecimals(value: unknown, field = 'decimals'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) {
    throw new WalletIntelligenceError(`Invalid ${field}. Expected an integer from 0 to 255.`, {
      code: 'provider_integrity_failure',
    });
  }
  return value;
}

export function parseUnixSeconds(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'bigint') {
    return parseSafeSlot(value, field);
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return parseUnixSeconds(Number(value), field);
  }
  throw new WalletIntelligenceError(`Invalid ${field}. Expected a non-negative Unix timestamp.`, {
    code: 'provider_integrity_failure',
  });
}

export function unixSecondsToMs(seconds: number): number {
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new WalletIntelligenceError('Invalid Unix timestamp.', { code: 'provider_integrity_failure' });
  }
  const ms = seconds * 1000;
  if (!Number.isSafeInteger(ms)) {
    throw new WalletIntelligenceError('Unix timestamp exceeds a safe millisecond integer.', {
      code: 'provider_integrity_failure',
    });
  }
  return ms;
}

export function msToUnixSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

export function compareCodePoint(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function compareBigIntDesc(left: bigint, right: bigint): number {
  if (left > right) {
    return -1;
  }
  if (left < right) {
    return 1;
  }
  return 0;
}

export function parseTransactionIndex(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'bigint') {
    return parseSafeSlot(value, field);
  }
  throw new WalletIntelligenceError(`Invalid ${field}. Expected a non-negative transactionIndex.`, {
    code: 'provider_integrity_failure',
  });
}

export function observedTop20ShareBps(ownerRaw: bigint, totalRaw: bigint): number {
  if (totalRaw === 0n) {
    return 0;
  }
  if (ownerRaw < 0n || totalRaw < 0n) {
    throw new WalletIntelligenceError('Observed token amounts must be non-negative.', {
      code: 'provider_integrity_failure',
    });
  }
  return Number((ownerRaw * BigInt(BASIS_POINTS_PER_UNIT)) / totalRaw);
}

export function fractionBps(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0;
  }
  return Math.trunc((numerator * BASIS_POINTS_PER_UNIT) / denominator);
}

export function medianNumber(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }
  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  if (lower === undefined || upper === undefined) {
    return null;
  }
  return (lower + upper) / 2;
}

export function utcDayKey(blockTimeMs: number): string {
  return new Date(blockTimeMs).toISOString().slice(0, 10);
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
