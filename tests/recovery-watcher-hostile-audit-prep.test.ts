import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LATEST_SCHEMA_VERSION, migrationSqlDigest } from '../src/persistence/sqlite/migrations.js';
import { DEFAULT_RW0_DATABASE_PATH, RW0_LOCK_FILE_NAME } from '../src/recovery-watcher/constants.js';
import { RW0_MIGRATIONS } from '../src/recovery-watcher/db/migrations.js';
import { PROD20_LOCK_FILE_NAME } from '../src/production/constants.js';
import { REQUIRED_SCHEMA_VERSION as PRODUCTION_REQUIRED_SCHEMA_VERSION } from '../src/production/constants.js';

function readTree(root: string): string {
  return readdirSync(root, { recursive: true })
    .filter((name): name is string => typeof name === 'string' && name.endsWith('.ts'))
    .map((name) => readFileSync(join(root, name), 'utf8'))
    .join('\n');
}

describe('recovery watcher hostile audit prep', () => {
  it('leaves production schema at 9 with migration 010 absent', () => {
    expect(LATEST_SCHEMA_VERSION).toBe(9);
    expect(PRODUCTION_REQUIRED_SCHEMA_VERSION).toBe(9);
    expect(() => migrationSqlDigest(10)).toThrow();
    const productionMigrations = readFileSync(join(process.cwd(), 'src/persistence/sqlite/migrations.ts'), 'utf8');
    expect(productionMigrations).not.toMatch(/010_/);
    expect(productionMigrations).toContain("export const LATEST_SCHEMA_VERSION = WALLET_INTELLIGENCE_MIGRATION_VERSION");
  });

  it('does not number recovery migrations as 010', () => {
    expect(RW0_MIGRATIONS.map((item) => item.version)).toEqual([1]);
    expect(RW0_MIGRATIONS.map((item) => item.name)).toEqual(['rw0_001_initial']);
    const recoverySql = RW0_MIGRATIONS.map((item) => item.sql).join('\n');
    expect(recoverySql).not.toMatch(/\b010\b/);
  });

  it('keeps recovery lock and database path distinct from production', () => {
    expect(DEFAULT_RW0_DATABASE_PATH).toBe('./data/recovery-watcher.sqlite');
    expect(RW0_LOCK_FILE_NAME).toBe('.rw0-runtime.lock');
    expect(RW0_LOCK_FILE_NAME).not.toBe(PROD20_LOCK_FILE_NAME);
  });

  it('does not add live recovery commands', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['recovery:status']).toBeDefined();
    expect(pkg.scripts['recovery:run']).toBeDefined();
    expect(pkg.scripts['recovery:report']).toBeDefined();
    expect(pkg.scripts['recovery:execute']).toBeUndefined();
    expect(pkg.scripts['recovery:live']).toBeUndefined();
    expect(pkg.scripts['recovery:send']).toBeUndefined();
  });

  it('does not mention live trading as available in recovery sources', () => {
    const recovery = readTree(join(process.cwd(), 'src/recovery-watcher'));
    expect(recovery).toContain("automaticLiveTrading: false");
    expect(recovery).not.toMatch(/sendTransaction/);
  });
});
