import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DASHBOARD_DEFINITION_FINGERPRINT } from '../src/dashboard/identity.js';
import { EXECUTION_DEFINITION_FINGERPRINT } from '../src/execution/identity.js';
import { LIVE_DEFINITION_FINGERPRINT } from '../src/live/identity.js';
import { WALLET_DEFINITION_FINGERPRINT } from '../src/wallet/identity.js';
import { LATEST_SCHEMA_VERSION, migrationSqlDigest } from '../src/persistence/sqlite/migrations.js';

function readTree(root: string, extensions: readonly string[]): string {
  return readdirSync(root, { recursive: true })
    .filter((name): name is string => typeof name === 'string' && extensions.some((ext) => name.endsWith(ext)))
    .map((name) => readFileSync(join(root, name), 'utf8'))
    .join('\n');
}

describe('live hostile audit prep', () => {
  it('freezes schema 9 and historical migration digests 001-008', () => {
    expect(LATEST_SCHEMA_VERSION).toBe(9);
    expect(migrationSqlDigest(1)).toBe('7c20b9f9799c65c1be718df10a8841dcb7486d35414fa4806ea77a6192ebda7a');
    expect(migrationSqlDigest(2)).toBe('c80bbcc691b4eb36c75a3a5fae303f694241152d2ab79679ec8328f9b267071e');
    expect(migrationSqlDigest(3)).toBe('891ed1347be25bcda40cc2219208789fd3af117f91d9d140367c241c087ece1c');
    expect(migrationSqlDigest(4)).toBe('eb21748b78a5ff33fb8bd6f590b24f9be098ff5a343107de74e50d528b84d308');
    expect(migrationSqlDigest(5)).toBe('5435dc4d919729f38474f6cbcdb18a5993b5688d6d97fd31b15fcd75ea26c629');
    expect(migrationSqlDigest(6)).toBe('ddffdd15c0ee0d67e2146854aa6a3adb87c0f0497999de9c80a9bfa4210bdbb0');
    expect(migrationSqlDigest(7)).toBe('d049cf6a2ba8b041f703fe15ab13f1b687a347e4eab6b2b8587a84cd67b404fa');
    expect(migrationSqlDigest(8)).toBe(
      'e4c5ee0d56a8ffe5d916da3bd68d3792f48ac4ffbcce004ababa983d792747d0',
    );
  });

  it('does not add a strategy live bridge or dashboard live controls', () => {
    const strategy = readTree(join(process.cwd(), 'src/strategy'), ['.ts']);
    const dashboard = readTree(join(process.cwd(), 'src/dashboard'), ['.ts', '.js', '.html', '.css']);
    expect(strategy).not.toContain('live:execute');
    expect(strategy).not.toContain('executeLiveBroadcast');
    expect(dashboard).not.toMatch(/\blive:execute\b/);
    expect(dashboard).not.toMatch(/>\s*SEND\s*</);
    expect(dashboard).not.toMatch(/UNLOCK WALLET/);
    expect(DASHBOARD_DEFINITION_FINGERPRINT).toBe(
      'd4a72c37b15c334171cbd0975cbb9534c3ca836f38923654e22e3685d02c5b18',
    );
  });

  it('does not change e14 or w15 fingerprints', () => {
    expect(EXECUTION_DEFINITION_FINGERPRINT).toBe(
      '6c9bf5bd42a6137b21b8ed2f4c8939085c7b999add2013efbf7d63a8fc306fd0',
    );
    expect(WALLET_DEFINITION_FINGERPRINT).toBe(
      '2caec72e3ea5fa2c141f9d00f689a23eadaa1f29b403605595abaf6e2d0a7855',
    );
    expect(LIVE_DEFINITION_FINGERPRINT).toBe(
      '57a6fc872f7e51f1e4b041ed5b93413efe0779dea61a88b9dc1b4ed9f05e395d',
    );
  });

  it('does not start live polling from npm run dev', () => {
    const app = readFileSync(join(process.cwd(), 'src/core/app.ts'), 'utf8');
    const index = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8');
    expect(app).not.toContain('live');
    expect(index).not.toContain('live');
    expect(app).not.toContain('wallet');
    expect(index).not.toContain('wallet');
  });

  it('does not mention Jito send endpoints in live runtime source', () => {
    const live = readTree(join(process.cwd(), 'src/live'), ['.ts']);
    expect(live).not.toContain('jito.wtf');
    expect(live).not.toMatch(/sendBundle\(/);
    expect(live).not.toContain('requestAirdrop');
  });
});
