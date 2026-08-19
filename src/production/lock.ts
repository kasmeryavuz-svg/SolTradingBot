import { chmodSync, closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROD20_LOCK_FILE_MODE, PROD20_LOCK_FILE_NAME, PROD20_SPEC_VERSION } from './constants.js';
import { ProductionError } from './errors.js';
import { PROD20_DEFINITION_FINGERPRINT } from './identity.js';
import type { ProcessLiveness, ProductionLockRecord, ProductionProcessIdentity } from './types.js';

export type AcquiredProductionLock = {
  path: string;
  record: ProductionLockRecord;
};

const inProcessOwnedLocks = new Map<string, ProductionProcessIdentity>();

export function serializeProductionLock(record: ProductionLockRecord): string {
  return JSON.stringify({
    specVersion: record.specVersion,
    specFingerprint: record.specFingerprint,
    pid: record.pid,
    processStartedAtMs: record.processStartedAtMs,
    runtimeStartedAt: record.runtimeStartedAt,
  });
}

export function classifyProductionLock(
  raw: string,
  expectedFingerprint: string = PROD20_DEFINITION_FINGERPRINT,
): { kind: 'malformed' } | { kind: 'unknown_identity' } | { kind: 'valid'; record: ProductionLockRecord } {
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
  const keys = Object.keys(record);
  if (keys.length !== 5) {
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
  const lock: ProductionLockRecord = {
    specVersion: record['specVersion'],
    specFingerprint: record['specFingerprint'],
    pid: record['pid'],
    processStartedAtMs: record['processStartedAtMs'],
    runtimeStartedAt: record['runtimeStartedAt'],
  };
  if (lock.specVersion !== PROD20_SPEC_VERSION || lock.specFingerprint !== expectedFingerprint) {
    return { kind: 'unknown_identity' };
  }
  return { kind: 'valid', record: lock };
}

export function inspectProductionLockFile(
  directory: string,
  liveness: ProcessLiveness,
  options: {
    current: ProductionProcessIdentity;
    expectedFingerprint?: string;
  },
):
  | { kind: 'absent' }
  | { kind: 'malformed' }
  | { kind: 'unknown_identity' }
  | { kind: 'stale'; record: ProductionLockRecord }
  | { kind: 'active'; record: ProductionLockRecord } {
  const path = join(directory, PROD20_LOCK_FILE_NAME);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return { kind: 'absent' };
    }
    throw new ProductionError('lock_failure', 'Unable to read the production singleton lock.', {
      cause: error,
    });
  }
  const classified = classifyProductionLock(raw, options.expectedFingerprint ?? PROD20_DEFINITION_FINGERPRINT);
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
    return { kind: 'stale', record: classified.record };
  }
  if (liveness.isAlive(classified.record.pid)) {
    return { kind: 'active', record: classified.record };
  }
  return { kind: 'stale', record: classified.record };
}

export function acquireProductionLock(options: {
  directory: string;
  pid: number;
  processStartedAtMs: number;
  runtimeStartedAt: string;
  liveness: ProcessLiveness;
  specFingerprint?: string;
}): AcquiredProductionLock {
  const specFingerprint = options.specFingerprint ?? PROD20_DEFINITION_FINGERPRINT;
  const path = join(options.directory, PROD20_LOCK_FILE_NAME);
  const inProcessOwner = inProcessOwnedLocks.get(path);
  if (
    inProcessOwner !== undefined &&
    inProcessOwner.pid === options.pid &&
    inProcessOwner.processStartedAtMs === options.processStartedAtMs
  ) {
    throw new ProductionError(
      'production_instance_already_running',
      'Another prod20 runtime is already running for this deployment.',
    );
  }
  const record: ProductionLockRecord = {
    specVersion: PROD20_SPEC_VERSION,
    specFingerprint,
    pid: options.pid,
    processStartedAtMs: options.processStartedAtMs,
    runtimeStartedAt: options.runtimeStartedAt,
  };
  const body = serializeProductionLock(record);
  const current = { pid: options.pid, processStartedAtMs: options.processStartedAtMs };

  const first = tryExclusiveCreate(path, body);
  if (first === 'acquired') {
    inProcessOwnedLocks.set(path, current);
    return { path, record };
  }

  const existing = inspectProductionLockFile(options.directory, options.liveness, {
    current,
    expectedFingerprint: specFingerprint,
  });
  if (existing.kind === 'malformed') {
    throw new ProductionError(
      'malformed_lock',
      'Production singleton lock is malformed. Refusing to delete it automatically.',
    );
  }
  if (existing.kind === 'unknown_identity') {
    throw new ProductionError(
      'unknown_lock_identity',
      'Production singleton lock has an unknown spec version or fingerprint. Refusing to delete it automatically.',
    );
  }
  if (existing.kind === 'active') {
    throw new ProductionError(
      'production_instance_already_running',
      'Another prod20 runtime is already running for this deployment.',
    );
  }
  if (existing.kind === 'stale') {
    try {
      unlinkSync(path);
    } catch (error: unknown) {
      if (!(isErrnoException(error) && error.code === 'ENOENT')) {
        throw new ProductionError('lock_failure', 'Unable to remove a stale production singleton lock.', {
          cause: error,
        });
      }
    }
  }

  const retry = tryExclusiveCreate(path, body);
  if (retry === 'acquired') {
    inProcessOwnedLocks.set(path, current);
    return { path, record };
  }
  throw new ProductionError(
    'production_instance_already_running',
    'Another prod20 runtime is already running for this deployment.',
  );
}

export function releaseProductionLock(acquired: AcquiredProductionLock): void {
  inProcessOwnedLocks.delete(acquired.path);
  let raw: string;
  try {
    raw = readFileSync(acquired.path, 'utf8');
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return;
    }
    throw new ProductionError('lock_failure', 'Unable to read the production singleton lock during release.', {
      cause: error,
    });
  }
  const classified = classifyProductionLock(raw, acquired.record.specFingerprint);
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
    throw new ProductionError('lock_failure', 'Unable to release the owned production singleton lock.', {
      cause: error,
    });
  }
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
    throw new ProductionError('lock_failure', 'Unable to acquire the production singleton lock.', {
      cause: error,
    });
  }
}

function applyRestrictiveLockPermissions(path: string): void {
  try {
    chmodSync(path, PROD20_LOCK_FILE_MODE);
  } catch {
    // POSIX 0600 is best-effort. Windows file modes are not equivalent; do not fail the checkpoint.
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}
