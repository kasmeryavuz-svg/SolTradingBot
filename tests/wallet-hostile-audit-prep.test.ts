import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LATEST_SCHEMA_VERSION, migrationSqlDigest } from '../src/persistence/sqlite/migrations.js';
import { DASHBOARD_DEFINITION_FINGERPRINT } from '../src/dashboard/identity.js';
import { EXECUTION_DEFINITION_FINGERPRINT } from '../src/execution/identity.js';
import { FORBIDDEN_ENV_SECRET_NAMES, WALLET_SIGNING_PURPOSES } from '../src/wallet/constants.js';
import { executeWalletStatus } from '../src/wallet/index.js';

function readTree(root: string, extensions: readonly string[]): string {
  return readdirSync(root, { recursive: true })
    .filter((name): name is string => typeof name === 'string' && extensions.some((ext) => name.endsWith(ext)))
    .map((name) => readFileSync(join(root, name), 'utf8'))
    .join('\n');
}

describe('wallet hostile audit prep', () => {
  it('keeps frozen migration hashes 001-007 and allows live migration 008', () => {
    expect(LATEST_SCHEMA_VERSION).toBe(9);
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
  });

  it('does not add wallet tables or secret persistence', () => {
    const migrations = readFileSync(join(process.cwd(), 'src/persistence/sqlite/migrations.ts'), 'utf8');
    expect(migrations).toMatch(/008_live_execution_attempts/);
    expect(migrations).not.toMatch(/CREATE TABLE wallets|wallet_keys|wallet_secrets|signed_transactions/);
  });

  it('does not load env or file secrets in production wallet source', () => {
    const text = readTree(join(process.cwd(), 'src', 'wallet'), ['.ts']);
    for (const name of FORBIDDEN_ENV_SECRET_NAMES) {
      expect(text).not.toMatch(new RegExp(`process\\.env\\['${name}'\\]`));
      expect(text).not.toMatch(new RegExp(`readOptionalEnv\\([^,]+, '${name}'\\)`));
    }
    expect(text).not.toContain('readFileSync');
    expect(text).not.toContain('readFile(');
    expect(text).not.toContain('.config/solana/id.json');
    expect(text).not.toContain('bip39');
    expect(text).not.toMatch(/mnemonicToSeed|fromMnemonic|generateMnemonic/);
    expect(text).not.toContain('wallet:sign-message');
    expect(text).not.toContain('getGlobalWallet');
    expect(text).not.toContain('exportSecret');
    expect(WALLET_SIGNING_PURPOSES).toEqual([
      'w15_self_test_challenge',
      'exact_e14_final_preflight_candidate',
    ]);
  });

  it('does not add dashboard signing controls', () => {
    const text = readTree(join(process.cwd(), 'src', 'dashboard'), ['.ts', '.js', '.html', '.css']);
    expect(text).not.toMatch(/UNLOCK WALLET/);
    expect(text).not.toMatch(/CONNECT WALLET/);
    expect(text).not.toMatch(/wallet:sign-preflight/);
    expect(text).not.toMatch(/wallet:verify/);
    expect(DASHBOARD_DEFINITION_FINGERPRINT).toBe(
      'd4a72c37b15c334171cbd0975cbb9534c3ca836f38923654e22e3685d02c5b18',
    );
  });

  it('does not insert a signer into the e14 definition', () => {
    expect(EXECUTION_DEFINITION_FINGERPRINT).toBe(
      '6c9bf5bd42a6137b21b8ed2f4c8939085c7b999add2013efbf7d63a8fc306fd0',
    );
    const execution = readTree(join(process.cwd(), 'src', 'execution'), ['.ts']);
    expect(execution).not.toContain('withInteractiveSigner');
    expect(execution).not.toContain('createKeyPairSignerFromBytes');
  });

  it('does not prompt from npm run dev', () => {
    const app = readFileSync(join(process.cwd(), 'src/core/app.ts'), 'utf8');
    const index = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8');
    expect(app).not.toContain('wallet');
    expect(index).not.toContain('wallet');
  });

  it('does not put a test secret into docs or README', async () => {
    const { loadTestWalletFixture } = await import('./wallet-fixtures.js');
    const fixture = await loadTestWalletFixture();
    const docs = readTree(join(process.cwd(), 'docs'), ['.md']);
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    expect(docs).not.toContain(fixture.secretBase58);
    expect(readme).not.toContain(fixture.secretBase58);
  });

  it('status stays local and does not mention live trading', () => {
    const text = [
      ...Object.values(
        executeWalletStatus({
          TRADING_ENABLED: 'false',
        }),
      ),
    ].join(' ');
    expect(text).not.toMatch(/live trading available/i);
  });
});
