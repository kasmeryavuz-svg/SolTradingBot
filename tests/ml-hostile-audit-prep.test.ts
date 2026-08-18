import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LATEST_SCHEMA_VERSION, migrationSqlDigest } from '../src/persistence/sqlite/migrations.js';
import { ML_DEFINITION_FINGERPRINT } from '../src/ml/identity.js';
import { MODEL_SIGNAL_THRESHOLD } from '../src/ml/constants.js';
import { formatMlStatusLines } from '../src/ml/format.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../src/strategy/identity.js';
import { OPTIMIZATION_DEFINITION_FINGERPRINT } from '../src/optimization/identity.js';
import { WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT } from '../src/wallet-intelligence/identity.js';

function readTree(root: string): string {
  return readdirSync(root, { recursive: true })
    .filter((name): name is string => typeof name === 'string' && name.endsWith('.ts'))
    .map((name) => readFileSync(join(root, name), 'utf8'))
    .join('\n');
}

describe('ml hostile audit prep', () => {
  it('freezes schema 9, migration 009, no 010, and upstream fingerprints', () => {
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
    expect(migrationSqlDigest(9)).toBe(
      'f9f12785034c3181350b279a20e6baa7676fd8c48fb19dd02ce9ead922d12720',
    );
    expect(() => migrationSqlDigest(10)).toThrow();
    expect(readFileSync(join(process.cwd(), 'src/persistence/sqlite/migrations.ts'), 'utf8')).not.toMatch(
      /010_/,
    );
    expect(STRATEGY_DEFINITION_FINGERPRINT).toBe(
      'b4560629e6a58331e9046f13bad78b73b3bdc1bb7349fc6173ba158b4db067cd',
    );
    expect(OPTIMIZATION_DEFINITION_FINGERPRINT).toBe(
      '3c2171dc1aee3b0a31bae185e156f0a7236d56d11fe381e83364e8c326c4b979',
    );
    expect(WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT).toBe(
      '61e341190e1b8b19a47ed11101932acfebc904b664ee00db7cefff0284d67f32',
    );
    expect(ML_DEFINITION_FINGERPRINT).toMatch(/^[0-9a-f]{64}$/);
    expect(MODEL_SIGNAL_THRESHOLD).toBe(0.65);
  });

  it('contains no randomness, no threshold search, and no live language', () => {
    const ml = readTree(join(process.cwd(), 'src/ml'));
    expect(ml).not.toMatch(/Math\.random|crypto\.random|shuffle\(/);
    expect(ml).not.toMatch(/MODEL_SIGNAL_THRESHOLD\s*=\s*0\.(55|60|70)/);
    expect(ml).toMatch(/MODEL_SIGNAL_THRESHOLD = 0\.65/);
    expect(ml).not.toMatch(/LIVE_READY|AUTO_ENABLE|PROFITABLE_AI|WINNER/);
    expect(formatMlStatusLines().join('\n')).not.toMatch(/PROFITABLE|READY FOR LIVE/);
  });
});
