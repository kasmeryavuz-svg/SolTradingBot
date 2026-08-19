import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LATEST_SCHEMA_VERSION, migrationSqlDigest } from '../src/persistence/sqlite/migrations.js';
import { formatProductionStatusLines } from '../src/production/format.js';
import { PROD20_DEFINITION_FINGERPRINT } from '../src/production/identity.js';
import { PROD20_SPEC_NAME, PROD20_SPEC_VERSION } from '../src/production/constants.js';

function readTree(root: string): string {
  return readdirSync(root, { recursive: true })
    .filter((name): name is string => typeof name === 'string' && name.endsWith('.ts'))
    .map((name) => readFileSync(join(root, name), 'utf8'))
    .join('\n');
}

describe('production hostile audit prep', () => {
  it('freezes schema 9, migration 009, no 010, and prod20 identity', () => {
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
    expect(PROD20_SPEC_VERSION).toBe('prod20_v1');
    expect(PROD20_SPEC_NAME).toBe('paper_only_production_supervisor_and_release_readiness');
    expect(PROD20_DEFINITION_FINGERPRINT).toMatch(/^[0-9a-f]{64}$/);
    const status = formatProductionStatusLines().join('\n');
    expect(status).toContain('automatic live trading: UNAVAILABLE');
    expect(status).toContain('ML production input: NO');
  });

  it('does not add live production commands or clone strategy constants', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['prod:status']).toBeDefined();
    expect(pkg.scripts['prod:plan']).toBeDefined();
    expect(pkg.scripts['prod:preflight']).toBeDefined();
    expect(pkg.scripts['prod:run']).toBeDefined();
    expect(pkg.scripts['prod:live']).toBeUndefined();
    expect(pkg.scripts['prod:trade']).toBeUndefined();
    expect(pkg.scripts['prod:execute']).toBeUndefined();
    expect(pkg.scripts['prod:send']).toBeUndefined();
    expect(pkg.scripts['prod:auto-live']).toBeUndefined();
    expect(pkg.scripts['prod:wallet']).toBeUndefined();
    expect(pkg.scripts['prod:sign']).toBeUndefined();
    expect(pkg.scripts['prod:deploy-live']).toBeUndefined();
    const production = readTree(join(process.cwd(), 'src/production'));
    expect(production).not.toMatch(/Promise\.all\(/);
    expect(production).not.toMatch(/Math\.random\s*\(/);
  });
});
