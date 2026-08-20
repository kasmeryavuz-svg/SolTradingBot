import { chmodSync, closeSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RW0_LOCK_FILE_MODE, RW0_LOCK_FILE_NAME, RW0_SPEC_VERSION } from './constants.js';
import { RecoveryWatcherError } from './errors.js';
import { RW0_WATCHER_DEFINITION_FINGERPRINT } from './identity.js';
import type { RecoveryLockRecord, RecoveryProcessIdentity, RecoveryProcessLiveness } from './types.js';

export type RecoveryLockFileIdentity = {
  dev: number;
  ino: number;
  mtimeMs: number;
  size: number;
};

export type AcquiredRecoveryLock = {
  path: string;
  record: RecoveryLockRecord;
};

const inProcessOwnedLocks = new Map<string, RecoveryProcessIdentity>();

export function recoveryLockPath(directory: string): string {
  return join(directory, RW0_LOCK_FILE_NAME);
}

export function serializeRecoveryLock(record: RecoveryLockRecord): string {
  return JSON.stringify({
    specVersion: record.specVersion,
    specFingerprint: record.specFingerprint,
    pid: record.pid,
    processStartedAtMs: record.processStartedAtMs,
    runtimeStartedAt: record.runtimeStartedAt,
  });
}

export function classifyRecoveryLock(
  raw: string,
  expectedFingerprint: string = RW0_WATCHER_DEFINITION_FINGERPRINT,
): { kind: 'malformed' } | { kind: 'unknown_identity' } | { kind: 'valid'; record: RecoveryLockRecord } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'malformed' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { kind: 'malformed' };
  }
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).length !== 5) {
    return { kind: 'malformed' };
  }
  if (
    typeof record['specVersion'] !== 'string' ||
    typeof record['specFingerprint'] !== 'string' ||
    typeof record['pid'] !== 'number' ||
    !Number.isInteger(record['pid']) ||
    typeof record['processStartedAtMs'] !== 'number' ||
    !Number.isInteger(record['processStartedAtMs']) ||
    typeof record['runtimeStartedAt'] !== 'string'
  ) {
    return { kind: 'malformed' };
  }
  const lock: RecoveryLockRecord = {
    specVersion: record['specVersion'],
    specFingerprint: record['specFingerprint'],
    pid: record['pid'],
    processStartedAtMs: record['processStartedAtMs'],
    runtimeStartedAt: record['runtimeStartedAt'],
  };
  if (lock.specVersion !== RW0_SPEC_VERSION || lock.specFingerprint !== expectedFingerprint) {
    return { kind: 'unknown_identity' };
  }
  return { kind: 'valid', record: lock };
}

export function inspectRecoveryLockFile(
  directory: string,
  liveness: RecoveryProcessLiveness,
  options: {
    current: RecoveryProcessIdentity;
    expectedFingerprint?: string;
  },
):
  | { kind: 'absent' }
  | { kind: 'malformed' }
  | { kind: 'unknown_identity' }
  | { kind: 'stale'; record: RecoveryLockRecord; identity: RecoveryLockFileIdentity }
  | { kind: 'active'; record: RecoveryLockRecord } {
  const path = recoveryLockPath(directory);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return { kind: 'absent' };
    }
    throw new RecoveryWatcherError('Unable to read the recovery singleton lock.', {
      code: 'lock_failure',
      cause: error,
    });
  }
  let identity: RecoveryLockFileIdentity;
  try {
    identity = readRecoveryLockFileIdentity(path);
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return { kind: 'absent' };
    }
    throw new RecoveryWatcherError('Unable to stat the recovery singleton lock.', {
      code: 'lock_failure',
      cause: error,
    });
  }
  const classified = classifyRecoveryLock(raw, options.expectedFingerprint ?? RW0_WATCHER_DEFINITION_FINGERPRINT);
  if (classified.kind === 'malformed') {
    return { kind: 'malformed' };
  }
  if (classified.kind === 'unknown_identity') {
    return { kind: 'unknown_identity' };
  }
  if (classified.record.pid === options.current.pid) {
    if (classified.record.processStartedAtMs === options.current.processStartedAtMs) {
      return { kind: 'active', record: classified.record };
    }
    return { kind: 'stale', record: classified.record, identity };
  }
  if (liveness.isAlive(classified.record.pid)) {
    return { kind: 'active', record: classified.record };
  }
  return { kind: 'stale', record: classified.record, identity };
}

export function acquireRecoveryLock(options: {
  directory: string;
  pid: number;
  processStartedAtMs: number;
  runtimeStartedAt: string;
  liveness: RecoveryProcessLiveness;
  specFingerprint?: string;
}): AcquiredRecoveryLock {
  const specFingerprint = options.specFingerprint ?? RW0_WATCHER_DEFINITION_FINGERPRINT;
  const path = recoveryLockPath(options.directory);
  const inProcessOwner = inProcessOwnedLocks.get(path);
  if (
    inProcessOwner !== undefined &&
    inProcessOwner.pid === options.pid &&
    inProcessOwner.processStartedAtMs === options.processStartedAtMs
  ) {
    throw new RecoveryWatcherError(
      'Another Recovery Watcher runtime in this process already owns the lock.',
      { code: 'lock_already_held' },
    );
  }
  const record: RecoveryLockRecord = {
    specVersion: RW0_SPEC_VERSION,
    specFingerprint,
    pid: options.pid,
    processStartedAtMs: options.processStartedAtMs,
    runtimeStartedAt: options.runtimeStartedAt,
  };
  const body = serializeRecoveryLock(record);
  const current = { pid: options.pid, processStartedAtMs: options.processStartedAtMs };

  if (tryExclusiveCreate(path, body) === 'acquired') {
    inProcessOwnedLocks.set(path, current);
    return { path, record };
  }

  const existing = inspectRecoveryLockFile(options.directory, options.liveness, {
    current,
    expectedFingerprint: specFingerprint,
  });
  if (existing.kind === 'malformed') {
    throw new RecoveryWatcherError(
      'Recovery singleton lock is malformed. Refusing to delete it automatically.',
      { code: 'malformed_lock' },
    );
  }
  if (existing.kind === 'unknown_identity') {
    throw new RecoveryWatcherError(
      'Recovery singleton lock has an unknown spec version or fingerprint. Refusing to delete it automatically.',
      { code: 'unknown_lock_identity' },
    );
  }
  if (existing.kind === 'active') {
    throw new RecoveryWatcherError('Another Recovery Watcher runtime already owns the lock.', {
      code: 'lock_already_held',
    });
  }
  if (existing.kind === 'stale') {
    removeStaleRecoveryLockIfUnchanged(path, {
      record: existing.record,
      identity: existing.identity,
    });
  }

  if (tryExclusiveCreate(path, body) === 'acquired') {
    inProcessOwnedLocks.set(path, current);
    return { path, record };
  }
  throw new RecoveryWatcherError('Another Recovery Watcher runtime already owns the lock.', {
    code: 'lock_already_held',
  });
}

export function releaseRecoveryLock(acquired: AcquiredRecoveryLock): void {
  inProcessOwnedLocks.delete(acquired.path);
  let raw: string;
  try {
    raw = readFileSync(acquired.path, 'utf8');
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return;
    }
    throw new RecoveryWatcherError('Unable to read the recovery singleton lock during release.', {
      code: 'lock_failure',
      cause: error,
    });
  }
  const classified = classifyRecoveryLock(raw, acquired.record.specFingerprint);
  if (classified.kind !== 'valid') {
    return;
  }
  if (
    classified.record.pid !== acquired.record.pid ||
    classified.record.processStartedAtMs !== acquired.record.processStartedAtMs ||
    classified.record.runtimeStartedAt !== acquired.record.runtimeStartedAt ||
    classified.record.specFingerprint !== acquired.record.specFingerprint
  ) {
    return;
  }
  try {
    unlinkSync(acquired.path);
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return;
    }
    throw new RecoveryWatcherError('Unable to release the owned recovery singleton lock.', {
      code: 'lock_failure',
      cause: error,
    });
  }
}

export function removeStaleRecoveryLockIfUnchanged(
  path: string,
  expected: { record: RecoveryLockRecord; identity: RecoveryLockFileIdentity },
): void {
  let identity: RecoveryLockFileIdentity;
  try {
    identity = readRecoveryLockFileIdentity(path);
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return;
    }
    throw new RecoveryWatcherError('Unable to re-stat a stale recovery singleton lock before deletion.', {
      code: 'lock_failure',
      cause: error,
    });
  }
  if (!recoveryLockFileIdentitiesEqual(identity, expected.identity)) {
    throw new RecoveryWatcherError(
      'Stale recovery lock was replaced before deletion. Refusing to unlink.',
      { code: 'lock_already_held' },
    );
  }
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return;
    }
    throw new RecoveryWatcherError('Unable to re-read a stale recovery singleton lock before deletion.', {
      code: 'lock_failure',
      cause: error,
    });
  }
  const classified = classifyRecoveryLock(raw, expected.record.specFingerprint);
  if (classified.kind !== 'valid' || !recoveryLockRecordsEqual(classified.record, expected.record)) {
    throw new RecoveryWatcherError(
      'Stale recovery lock was replaced before deletion. Refusing to unlink.',
      { code: 'lock_already_held' },
    );
  }
  try {
    const again = readRecoveryLockFileIdentity(path);
    if (!recoveryLockFileIdentitiesEqual(again, expected.identity)) {
      throw new RecoveryWatcherError(
        'Stale recovery lock was replaced before deletion. Refusing to unlink.',
        { code: 'lock_already_held' },
      );
    }
  } catch (error: unknown) {
    if (error instanceof RecoveryWatcherError) {
      throw error;
    }
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return;
    }
    throw new RecoveryWatcherError('Unable to re-stat a stale recovery singleton lock before deletion.', {
      code: 'lock_failure',
      cause: error,
    });
  }
  try {
    unlinkSync(path);
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return;
    }
    throw new RecoveryWatcherError('Unable to remove a stale recovery singleton lock.', {
      code: 'lock_failure',
      cause: error,
    });
  }
}

function readRecoveryLockFileIdentity(path: string): RecoveryLockFileIdentity {
  const stats = statSync(path);
  return {
    dev: stats.dev,
    ino: stats.ino,
    mtimeMs: stats.mtimeMs,
    size: stats.size,
  };
}

function recoveryLockFileIdentitiesEqual(
  left: RecoveryLockFileIdentity,
  right: RecoveryLockFileIdentity,
): boolean {
  if (left.size !== right.size || left.mtimeMs !== right.mtimeMs) {
    return false;
  }
  if (left.ino !== 0 && right.ino !== 0) {
    return left.dev === right.dev && left.ino === right.ino;
  }
  return left.dev === right.dev;
}

function recoveryLockRecordsEqual(left: RecoveryLockRecord, right: RecoveryLockRecord): boolean {
  return (
    left.pid === right.pid &&
    left.processStartedAtMs === right.processStartedAtMs &&
    left.runtimeStartedAt === right.runtimeStartedAt &&
    left.specFingerprint === right.specFingerprint &&
    left.specVersion === right.specVersion
  );
}

function tryExclusiveCreate(path: string, body: string): 'acquired' | 'exists' {
  try {
    const fd = openSync(path, 'wx');
    try {
      writeFileSync(fd, body);
    } finally {
      closeSync(fd);
    }
    applyRestrictiveLockPermissions(path);
    return 'acquired';
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'EEXIST') {
      return 'exists';
    }
    throw new RecoveryWatcherError('Unable to acquire the recovery singleton lock.', {
      code: 'lock_failure',
      cause: error,
    });
  }
}

function applyRestrictiveLockPermissions(path: string): void {
  try {
    chmodSync(path, RW0_LOCK_FILE_MODE);
  } catch {
    // POSIX 0600 is best-effort. Windows file modes are not equivalent.
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
