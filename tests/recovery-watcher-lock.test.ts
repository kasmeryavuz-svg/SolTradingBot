import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RW0_LOCK_FILE_NAME, RW0_SPEC_VERSION } from '../src/recovery-watcher/constants.js';
import { RecoveryWatcherError } from '../src/recovery-watcher/errors.js';
import { RW0_WATCHER_DEFINITION_FINGERPRINT } from '../src/recovery-watcher/identity.js';
import {
  acquireRecoveryLock,
  classifyRecoveryLock,
  inspectRecoveryLockFile,
  releaseRecoveryLock,
  removeStaleRecoveryLockIfUnchanged,
  serializeRecoveryLock,
} from '../src/recovery-watcher/lock.js';
import { tempRecoveryDirectory } from './recovery-watcher-fixtures.js';

function lockRecord(
  overrides: Partial<{
    specVersion: string;
    specFingerprint: string;
    pid: number;
    processStartedAtMs: number;
    runtimeStartedAt: string;
  }> = {},
) {
  return {
    specVersion: overrides.specVersion ?? RW0_SPEC_VERSION,
    specFingerprint: overrides.specFingerprint ?? RW0_WATCHER_DEFINITION_FINGERPRINT,
    pid: overrides.pid ?? 11,
    processStartedAtMs: overrides.processStartedAtMs ?? 1000,
    runtimeStartedAt: overrides.runtimeStartedAt ?? '2026-08-19T00:00:00.000Z',
  };
}

describe('recovery lock ownership', () => {
  it('acquires for the first runtime and releases only its own lock', () => {
    const directory = tempRecoveryDirectory();
    const acquired = acquireRecoveryLock({
      directory,
      pid: 4242,
      processStartedAtMs: 1000,
      runtimeStartedAt: '2026-08-19T00:00:00.000Z',
      liveness: { isAlive: () => false },
    });
    expect(acquired.record.pid).toBe(4242);
    expect(existsSync(join(directory, RW0_LOCK_FILE_NAME))).toBe(true);
    releaseRecoveryLock(acquired);
    expect(existsSync(join(directory, RW0_LOCK_FILE_NAME))).toBe(false);
  });

  it('fails when a different live PID already owns a valid lock', () => {
    const directory = tempRecoveryDirectory();
    acquireRecoveryLock({
      directory,
      pid: 99,
      processStartedAtMs: 1000,
      runtimeStartedAt: '2026-08-19T00:00:00.000Z',
      liveness: { isAlive: () => false },
    });
    expect(() =>
      acquireRecoveryLock({
        directory,
        pid: 100,
        processStartedAtMs: 2000,
        runtimeStartedAt: '2026-08-19T00:00:01.000Z',
        liveness: { isAlive: (pid) => pid === 99 },
      }),
    ).toThrow(/already owns the lock/);
    expect(existsSync(join(directory, RW0_LOCK_FILE_NAME))).toBe(true);
  });

  it('treats same PID with a different process-start identity as stale reuse', () => {
    const directory = tempRecoveryDirectory();
    const path = join(directory, RW0_LOCK_FILE_NAME);
    writeFileSync(path, serializeRecoveryLock(lockRecord({ pid: 7, processStartedAtMs: 1000 })));
    const acquired = acquireRecoveryLock({
      directory,
      pid: 7,
      processStartedAtMs: 2000,
      runtimeStartedAt: '2026-08-19T00:00:02.000Z',
      liveness: { isAlive: () => true },
    });
    expect(acquired.record.processStartedAtMs).toBe(2000);
    expect(
      (JSON.parse(readFileSync(path, 'utf8')) as { processStartedAtMs: number }).processStartedAtMs,
    ).toBe(2000);
    releaseRecoveryLock(acquired);
  });

  it('fails a same-process duplicate acquire and does not remove the first lock', () => {
    const directory = tempRecoveryDirectory();
    const first = acquireRecoveryLock({
      directory,
      pid: 11,
      processStartedAtMs: 5000,
      runtimeStartedAt: '2026-08-19T00:00:00.000Z',
      liveness: { isAlive: () => true },
    });
    expect(() =>
      acquireRecoveryLock({
        directory,
        pid: 11,
        processStartedAtMs: 5000,
        runtimeStartedAt: '2026-08-19T00:00:01.000Z',
        liveness: { isAlive: () => true },
      }),
    ).toThrow(RecoveryWatcherError);
    expect(existsSync(first.path)).toBe(true);
    expect(
      (JSON.parse(readFileSync(first.path, 'utf8')) as { runtimeStartedAt: string })
        .runtimeStartedAt,
    ).toBe('2026-08-19T00:00:00.000Z');
    releaseRecoveryLock(first);
  });

  it('does not delete a replaced lock with a different process start', () => {
    const directory = tempRecoveryDirectory();
    const acquired = acquireRecoveryLock({
      directory,
      pid: 11,
      processStartedAtMs: 1000,
      runtimeStartedAt: '2026-08-19T00:00:00.000Z',
      liveness: { isAlive: () => false },
    });
    writeFileSync(
      acquired.path,
      serializeRecoveryLock(lockRecord({ pid: 11, processStartedAtMs: 9999 })),
    );
    releaseRecoveryLock(acquired);
    expect(existsSync(acquired.path)).toBe(true);
    expect(
      (JSON.parse(readFileSync(acquired.path, 'utf8')) as { processStartedAtMs: number })
        .processStartedAtMs,
    ).toBe(9999);
  });

  it('does not delete a replaced lock with a different runtimeStartedAt', () => {
    const directory = tempRecoveryDirectory();
    const acquired = acquireRecoveryLock({
      directory,
      pid: 11,
      processStartedAtMs: 1000,
      runtimeStartedAt: '2026-08-19T00:00:00.000Z',
      liveness: { isAlive: () => false },
    });
    writeFileSync(
      acquired.path,
      serializeRecoveryLock(
        lockRecord({
          pid: 11,
          processStartedAtMs: 1000,
          runtimeStartedAt: '2026-08-19T00:00:09.000Z',
        }),
      ),
    );
    releaseRecoveryLock(acquired);
    expect(existsSync(acquired.path)).toBe(true);
    expect(
      (JSON.parse(readFileSync(acquired.path, 'utf8')) as { runtimeStartedAt: string })
        .runtimeStartedAt,
    ).toBe('2026-08-19T00:00:09.000Z');
  });

  it('fails closed on malformed JSON and unknown identity', () => {
    const directory = tempRecoveryDirectory();
    const path = join(directory, RW0_LOCK_FILE_NAME);
    writeFileSync(path, '{not-json');
    expect(() =>
      acquireRecoveryLock({
        directory,
        pid: 1,
        processStartedAtMs: 1,
        runtimeStartedAt: '2026-08-19T00:00:00.000Z',
        liveness: { isAlive: () => false },
      }),
    ).toThrow(/malformed/);
    expect(readFileSync(path, 'utf8')).toBe('{not-json');
    const unknown = serializeRecoveryLock(lockRecord({ specVersion: 'rw0_v999' }));
    writeFileSync(path, unknown);
    expect(classifyRecoveryLock(unknown).kind).toBe('unknown_identity');
    expect(() =>
      acquireRecoveryLock({
        directory,
        pid: 2,
        processStartedAtMs: 2,
        runtimeStartedAt: '2026-08-19T00:00:01.000Z',
        liveness: { isAlive: () => false },
      }),
    ).toThrow(/unknown/);
    expect(readFileSync(path, 'utf8')).toBe(unknown);
  });

  it('does not unlink a replacement lock after classifying a stale file', () => {
    const directory = tempRecoveryDirectory();
    const path = join(directory, RW0_LOCK_FILE_NAME);
    const stale = lockRecord({
      pid: 8,
      processStartedAtMs: 1000,
      runtimeStartedAt: '2026-08-19T00:00:00.000Z',
    });
    writeFileSync(path, serializeRecoveryLock(stale));
    const inspected = inspectRecoveryLockFile(
      directory,
      { isAlive: () => false },
      {
        current: { pid: 9, processStartedAtMs: 2000 },
      },
    );
    expect(inspected.kind).toBe('stale');
    if (inspected.kind !== 'stale') {
      throw new Error('expected stale lock');
    }
    const replacement = serializeRecoveryLock(
      lockRecord({
        pid: 10,
        processStartedAtMs: 3000,
        runtimeStartedAt: '2026-08-19T00:00:03.000Z',
      }),
    );
    writeFileSync(path, replacement);
    expect(() => {
      removeStaleRecoveryLockIfUnchanged(path, {
        record: inspected.record,
        identity: inspected.identity,
      });
    }).toThrow(/replaced before deletion/);
    expect(readFileSync(path, 'utf8')).toBe(replacement);
  });
});
