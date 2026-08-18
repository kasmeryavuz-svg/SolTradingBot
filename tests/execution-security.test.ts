import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LATEST_SCHEMA_VERSION, migrationSqlDigest } from '../src/persistence/sqlite/migrations.js';
import {
  EXECUTION_TRADING_ENABLED_REFUSAL,
  ExecutionError,
  executeExecutionBuild,
  executeExecutionStatus,
  formatExecutionBuildLines,
  formatExecutionSimulateLines,
  formatExecutionStatusLines,
  prepareExecutionCommand,
  runExecutionBuild,
  sanitizeExecutionText,
} from '../src/execution/index.js';
import {
  JUPITER_SECRET,
  executionIntent,
  publicExecutionEnv,
  validJupiterBuild,
} from './execution-fixtures.js';

function executionSourceFiles(): string[] {
  const root = join(process.cwd(), 'src', 'execution');
  return readdirSync(root)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => join(root, name));
}

describe('execution security', () => {
  it('has no secret-loading or signing APIs in production execution source', () => {
    const forbidden = [
      'fromSecretKey',
      'createKeyPairFromBytes',
      'createKeyPairSignerFromBytes',
      'signTransaction(',
      'signTransactionMessage',
      'signBytes',
      'PRIVATE_KEY',
      'SECRET_KEY',
      'SEED_PHRASE',
      'mnemonic',
      'readFileSync',
      'readFile(',
    ];
    for (const file of executionSourceFiles()) {
      const text = readFileSync(file, 'utf8');
      for (const token of forbidden) {
        expect(text, `${file} contains ${token}`).not.toContain(token);
      }
    }
  });

  it('refuses TRADING_ENABLED=true at the execution command layer', () => {
    expect(() => prepareExecutionCommand({ TRADING_ENABLED: 'true' })).toThrow(ExecutionError);
    expect(() => prepareExecutionCommand({ TRADING_ENABLED: 'true' })).toThrow(
      EXECUTION_TRADING_ENABLED_REFUSAL,
    );
  });

  it('refuses non-mainnet build/simulate and missing public config before network', async () => {
    await expect(
      runExecutionBuild({
        ...publicExecutionEnv(),
        SOLANA_NETWORK: 'devnet',
      }),
    ).rejects.toThrow(/mainnet-beta/);

    let fetched = false;
    await expect(
      executeExecutionBuild({
        intent: executionIntent(),
        jupiter: {
          build: () => {
            fetched = true;
            return Promise.resolve(validJupiterBuild());
          },
        },
      }),
    ).resolves.toMatchObject({ status: 'build_validated' });
    expect(fetched).toBe(true);

    expect(() =>
      executeExecutionStatus({
        TRADING_ENABLED: 'false',
      }),
    ).not.toThrow();
  });

  it('never includes the Jupiter API key in formatted output or sanitized errors', () => {
    const status = formatExecutionStatusLines(
      executeExecutionStatus({
        TRADING_ENABLED: 'false',
        JUPITER_API_KEY: JUPITER_SECRET,
      }),
    ).join('\n');
    expect(status).toContain('Jupiter API key: configured');
    expect(status).not.toContain(JUPITER_SECRET);
    expect(sanitizeExecutionText(`failed ${JUPITER_SECRET}`, [JUPITER_SECRET])).not.toContain(
      JUPITER_SECRET,
    );
    expect(formatExecutionBuildLines).toBeTypeOf('function');
    expect(formatExecutionSimulateLines).toBeTypeOf('function');
  });

  it('keeps frozen migration hashes 001-007 and allows live migration 008', () => {
    expect(LATEST_SCHEMA_VERSION).toBe(8);
    expect(migrationSqlDigest(1)).toBe(
      '7c20b9f9799c65c1be718df10a8841dcb7486d35414fa4806ea77a6192ebda7a',
    );
    expect(migrationSqlDigest(2)).toBe(
      'c80bbcc691b4eb36c75a3a5fae303f694241152d2ab79679ec8328f9b267071e',
    );
    expect(migrationSqlDigest(3)).toBe(
      '891ed1347be25bcda40cc2219208789fd3af117f91d9d140367c241c087ece1c',
    );
    expect(migrationSqlDigest(4)).toBe(
      'eb21748b78a5ff33fb8bd6f590b24f9be098ff5a343107de74e50d528b84d308',
    );
    expect(migrationSqlDigest(5)).toBe(
      '5435dc4d919729f38474f6cbcdb18a5993b5688d6d97fd31b15fcd75ea26c629',
    );
    expect(migrationSqlDigest(6)).toBe(
      'ddffdd15c0ee0d67e2146854aa6a3adb87c0f0497999de9c80a9bfa4210bdbb0',
    );
    expect(migrationSqlDigest(7)).toBe(
      'd049cf6a2ba8b041f703fe15ab13f1b687a347e4eab6b2b8587a84cd67b404fa',
    );
    expect(migrationSqlDigest(8)).toMatch(/^[a-f0-9]{64}$/);
    const migrations = readFileSync(join(process.cwd(), 'src/persistence/sqlite/migrations.ts'), 'utf8');
    expect(migrations).toMatch(/008_live_execution_attempts/);
    expect(migrations).not.toMatch(/CREATE TABLE wallets|wallet_keys|signed_transactions/);
  });

  it('keeps the dashboard observation-only with no execution actions', () => {
    const dashboardRoot = join(process.cwd(), 'src', 'dashboard');
    const text = readdirSync(dashboardRoot, { recursive: true })
      .filter((name): name is string => typeof name === 'string' && /\.(ts|js|html|css)$/.test(name))
      .map((name) => readFileSync(join(dashboardRoot, name), 'utf8'))
      .join('\n');
    expect(text).not.toMatch(/\bexecution:build\b/);
    expect(text).not.toMatch(/\bexecution:simulate\b/);
    expect(text).not.toMatch(/CONNECT WALLET/);
    expect(text).not.toMatch(/>\s*SIGN\s*</);
    expect(text).not.toMatch(/>\s*SEND\s*</);
    expect(text).not.toMatch(/>\s*BUILD\s*</);
    expect(text).not.toMatch(/>\s*SIMULATE\s*</);
  });

  it('refuses missing public config before any Jupiter call', async () => {
    await expect(
      runExecutionBuild({
        TRADING_ENABLED: 'false',
        SOLANA_NETWORK: 'mainnet-beta',
      }),
    ).rejects.toThrow(/required public execution config/);
  });
});
