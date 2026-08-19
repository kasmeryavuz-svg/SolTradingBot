import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROD20_LOCK_FILE_NAME, PROD20_SPEC_VERSION } from '../src/production/constants.js';
import { ProductionError } from '../src/production/errors.js';
import { PROD20_DEFINITION_FINGERPRINT } from '../src/production/identity.js';
import {
  acquireProductionLock,
  classifyProductionLock,
  releaseProductionLock,
  serializeProductionLock,
} from '../src/production/lock.js';
import { initTempDatabase, productionLockRecord } from './production-fixtures.js';

describe('production lock', () => {
  it('acquires for the first runtime', () => {
    const { directory } = initTempDatabase();
    const acquired = acquireProductionLock({
      directory,
      pid: 4242,
      processStartedAtMs: 1000,
      runtimeStartedAt: '2026-08-19T00:00:00.000Z',
      liveness: { isAlive: () => false },
    });
    expect(acquired.record.pid).toBe(4242);
    expect(acquired.record.processStartedAtMs).toBe(1000);
    expect(existsSync(join(directory, PROD20_LOCK_FILE_NAME))).toBe(true);
    releaseProductionLock(acquired);
    expect(existsSync(join(directory, PROD20_LOCK_FILE_NAME))).toBe(false);
  });

  it('fails when a different live PID already owns a valid lock', () => {
    const { directory } = initTempDatabase();
    acquireProductionLock({
      directory,
      pid: 99,
      processStartedAtMs: 1000,
      runtimeStartedAt: '2026-08-19T00:00:00.000Z',
      liveness: { isAlive: () => false },
    });
    expect(() =>
      acquireProductionLock({
        directory,
        pid: 100,
        processStartedAtMs: 2000,
        runtimeStartedAt: '2026-08-19T00:00:01.000Z',
        liveness: { isAlive: (pid) => pid === 99 },
      }),
    ).toThrow(/already running/);
    expect(existsSync(join(directory, PROD20_LOCK_FILE_NAME))).toBe(true);
  });

  it('treats same PID with a different process-start identity as stale reuse', () => {
    const { directory } = initTempDatabase();
    const path = join(directory, PROD20_LOCK_FILE_NAME);
    writeFileSync(path, serializeProductionLock(productionLockRecord({ pid: 7, processStartedAtMs: 1000 })));
    const acquired = acquireProductionLock({
      directory,
      pid: 7,
      processStartedAtMs: 2000,
      runtimeStartedAt: '2026-08-19T00:00:02.000Z',
      liveness: { isAlive: () => true },
    });
    expect(acquired.record.processStartedAtMs).toBe(2000);
    expect((JSON.parse(readFileSync(path, 'utf8')) as { processStartedAtMs: number }).processStartedAtMs).toBe(2000);
  });

  it('fails a same-process duplicate supervisor and does not remove the first lock', () => {
    const { directory } = initTempDatabase();
    const first = acquireProductionLock({
      directory,
      pid: 11,
      processStartedAtMs: 5000,
      runtimeStartedAt: '2026-08-19T00:00:00.000Z',
      liveness: { isAlive: () => true },
    });
    expect(() =>
      acquireProductionLock({
        directory,
        pid: 11,
        processStartedAtMs: 5000,
        runtimeStartedAt: '2026-08-19T00:00:01.000Z',
        liveness: { isAlive: () => true },
      }),
    ).toThrow(ProductionError);
    expect(existsSync(first.path)).toBe(true);
    expect((JSON.parse(readFileSync(first.path, 'utf8')) as { runtimeStartedAt: string }).runtimeStartedAt).toBe(
      '2026-08-19T00:00:00.000Z',
    );
  });

  it('recovers a crashed-container lock then refuses a live foreign PID', () => {
    const { directory } = initTempDatabase();
    const path = join(directory, PROD20_LOCK_FILE_NAME);
    writeFileSync(
      path,
      serializeProductionLock(productionLockRecord({ pid: 7, processStartedAtMs: 1000 })),
    );
    const runtimeB = acquireProductionLock({
      directory,
      pid: 7,
      processStartedAtMs: 2000,
      runtimeStartedAt: '2026-08-19T00:00:02.000Z',
      liveness: { isAlive: () => true },
    });
    expect(runtimeB.record.pid).toBe(7);
    expect(runtimeB.record.processStartedAtMs).toBe(2000);
    expect(() =>
      acquireProductionLock({
        directory,
        pid: 8,
        processStartedAtMs: 3000,
        runtimeStartedAt: '2026-08-19T00:00:03.000Z',
        liveness: { isAlive: (candidate) => candidate === 7 },
      }),
    ).toThrow(/already running/);
    expect((JSON.parse(readFileSync(path, 'utf8')) as { processStartedAtMs: number }).processStartedAtMs).toBe(2000);
  });

  it('fails closed on malformed JSON and keeps the file', () => {
    const { directory } = initTempDatabase();
    const path = join(directory, PROD20_LOCK_FILE_NAME);
    writeFileSync(path, '{not-json');
    expect(() =>
      acquireProductionLock({
        directory,
        pid: 1,
        processStartedAtMs: 1,
        runtimeStartedAt: '2026-08-19T00:00:00.000Z',
        liveness: { isAlive: () => false },
      }),
    ).toThrow(/malformed/);
    expect(readFileSync(path, 'utf8')).toBe('{not-json');
  });

  it('fails closed on unknown spec and keeps the file', () => {
    const { directory } = initTempDatabase();
    const path = join(directory, PROD20_LOCK_FILE_NAME);
    const body = serializeProductionLock(
      productionLockRecord({ specVersion: 'prod20_v2', pid: 1, processStartedAtMs: 1 }),
    );
    writeFileSync(path, body);
    expect(classifyProductionLock(body).kind).toBe('unknown_identity');
    expect(() =>
      acquireProductionLock({
        directory,
        pid: 2,
        processStartedAtMs: 2,
        runtimeStartedAt: '2026-08-19T00:00:01.000Z',
        liveness: { isAlive: () => false },
      }),
    ).toThrow(/unknown/);
    expect(readFileSync(path, 'utf8')).toBe(body);
  });

  it('does not delete a replaced lock with a different process start', () => {
    const { directory } = initTempDatabase();
    const acquired = acquireProductionLock({
      directory,
      pid: 11,
      processStartedAtMs: 1000,
      runtimeStartedAt: '2026-08-19T00:00:00.000Z',
      liveness: { isAlive: () => false },
    });
    writeFileSync(
      acquired.path,
      serializeProductionLock(
        productionLockRecord({
          pid: 11,
          processStartedAtMs: 9999,
          runtimeStartedAt: '2026-08-19T00:00:00.000Z',
        }),
      ),
    );
    releaseProductionLock(acquired);
    expect(existsSync(acquired.path)).toBe(true);
    expect((JSON.parse(readFileSync(acquired.path, 'utf8')) as { processStartedAtMs: number }).processStartedAtMs).toBe(
      9999,
    );
  });

  it('does not delete a replaced lock with a different runtimeStartedAt', () => {
    const { directory } = initTempDatabase();
    const acquired = acquireProductionLock({
      directory,
      pid: 11,
      processStartedAtMs: 1000,
      runtimeStartedAt: '2026-08-19T00:00:00.000Z',
      liveness: { isAlive: () => false },
    });
    writeFileSync(
      acquired.path,
      serializeProductionLock(
        productionLockRecord({
          pid: 11,
          processStartedAtMs: 1000,
          runtimeStartedAt: '2026-08-19T00:00:09.000Z',
        }),
      ),
    );
    releaseProductionLock(acquired);
    expect(existsSync(acquired.path)).toBe(true);
    expect((JSON.parse(readFileSync(acquired.path, 'utf8')) as { runtimeStartedAt: string }).runtimeStartedAt).toBe(
      '2026-08-19T00:00:09.000Z',
    );
  });

  it('classifies a four-field legacy lock as malformed', () => {
    const raw = JSON.stringify({
      specVersion: PROD20_SPEC_VERSION,
      specFingerprint: PROD20_DEFINITION_FINGERPRINT,
      pid: 1,
      startedAt: '2026-08-19T00:00:00.000Z',
    });
    expect(classifyProductionLock(raw).kind).toBe('malformed');
  });
});
