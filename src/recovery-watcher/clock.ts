import { RecoveryWatcherError } from './errors.js';

const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function parseUtcInstant(value: string, label: string): number {
  if (!UTC_INSTANT.test(value)) {
    throw new RecoveryWatcherError(`Invalid ${label}. Expected a UTC instant ending in Z.`, {
      code: 'invalid_timestamp',
    });
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new RecoveryWatcherError(`Invalid ${label}. Expected a UTC instant ending in Z.`, {
      code: 'invalid_timestamp',
    });
  }
  return parsed;
}

export function assertNotFuture(value: string, now: Date, label: string): void {
  const instant = parseUtcInstant(value, label);
  if (instant > now.getTime()) {
    throw new RecoveryWatcherError(`${label} is in the future. Look-ahead is rejected.`, {
      code: 'look_ahead',
    });
  }
}

export function assertTimestampOrder(earlier: string, later: string, message: string): void {
  const left = parseUtcInstant(earlier, 'earlier timestamp');
  const right = parseUtcInstant(later, 'later timestamp');
  if (left > right) {
    throw new RecoveryWatcherError(message, { code: 'look_ahead' });
  }
}

export function assertStrictlyLater(earlier: string, later: string, message: string): void {
  const left = parseUtcInstant(earlier, 'earlier timestamp');
  const right = parseUtcInstant(later, 'later timestamp');
  if (left >= right) {
    throw new RecoveryWatcherError(message, { code: 'look_ahead' });
  }
}

export function assertSameInstant(left: string, right: string, message: string): void {
  if (parseUtcInstant(left, 'left timestamp') !== parseUtcInstant(right, 'right timestamp')) {
    throw new RecoveryWatcherError(message, { code: 'look_ahead' });
  }
}

export function isSameUtcInstant(left: string, right: string): boolean {
  return parseUtcInstant(left, 'left timestamp') === parseUtcInstant(right, 'right timestamp');
}

export function watchExpiresAtMs(watchStartedAt: string, ttlMs: number): number {
  return parseUtcInstant(watchStartedAt, 'watch_started_at') + ttlMs;
}

export function addMs(iso: string, ms: number): string {
  const instant = parseUtcInstant(iso, 'timestamp');
  return new Date(instant + ms).toISOString();
}

export function isWithinLookback(iso: string, now: Date, lookbackMs: number): boolean {
  const instant = parseUtcInstant(iso, 'timestamp');
  return now.getTime() - instant <= lookbackMs && instant <= now.getTime();
}

export function createRecoveryClock(now: () => Date = () => new Date()): { now: () => Date } {
  return { now };
}
