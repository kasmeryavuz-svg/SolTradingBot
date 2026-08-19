import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqlitePersistenceRepository } from '../src/persistence/sqlite/index.js';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/defaults.js';
import type { EnvSource } from '../src/config/env-source.js';
import { PROD20_SPEC_VERSION } from '../src/production/constants.js';
import { PROD20_DEFINITION_FINGERPRINT } from '../src/production/identity.js';
import type { ProductionClock, ProductionLockRecord } from '../src/production/types.js';
import {
  createRecoverableProviderFailure,
  createSqliteDatabaseFailure,
} from '../src/production/failure.js';

export const WSOL = WRAPPED_SOL_MINT;
export const USDC = USDC_MINT;

export function mintAt(index: number): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const suffix = alphabet[index];
  if (suffix === undefined) {
    throw new Error('mint index out of range');
  }
  return `1111111111111111111111111111111${suffix}`;
}

export function twentyMints(): string[] {
  return Array.from({ length: 20 }, (_, index) => mintAt(index));
}

export function productionEnv(overrides: EnvSource = {}): EnvSource {
  return {
    TRADING_ENABLED: 'false',
    LIVE_BROADCAST_ENABLED: 'false',
    PROD20_ENABLED: 'true',
    PROD20_COLLECTOR_ENABLED: 'true',
    PROD20_PAPER_ENABLED: 'false',
    DATABASE_ENABLED: 'true',
    DISCOVERY_ENABLED: 'true',
    ...overrides,
  };
}

export function initTempDatabase(): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'mtb-prod20-'));
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'market.sqlite');
  const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
  repository.initialize();
  repository.close();
  return { directory, path };
}

export function createFakeClock(startMs = 1_700_000_000_000): ProductionClock & {
  advance: (ms: number) => void;
  sleeps: number[];
} {
  let now = startMs;
  const sleeps: number[] = [];
  return {
    nowMs: () => now,
    nowIso: () => new Date(now).toISOString(),
    sleep: async (ms: number, signal: AbortSignal) => {
      sleeps.push(ms);
      if (signal.aborted) {
        return;
      }
      await new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        const done = (): void => {
          signal.removeEventListener('abort', done);
          resolve();
        };
        signal.addEventListener('abort', done, { once: true });
        queueMicrotask(() => {
          now += ms;
          done();
        });
      });
    },
    advance: (ms: number) => {
      now += ms;
    },
    sleeps,
  };
}

export function productionLockRecord(
  overrides: Partial<ProductionLockRecord> = {},
): ProductionLockRecord {
  return {
    specVersion: PROD20_SPEC_VERSION,
    specFingerprint: PROD20_DEFINITION_FINGERPRINT,
    pid: 7,
    processStartedAtMs: 1000,
    runtimeStartedAt: '2026-08-19T00:00:00.000Z',
    ...overrides,
  };
}

export { createRecoverableProviderFailure, createSqliteDatabaseFailure };

export async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (address === null || typeof address === 'string') {
          reject(new Error('no port'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}
