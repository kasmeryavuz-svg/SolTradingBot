import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TradingSafetyError } from '../src/core/index.js';
import { PersistenceError } from '../src/persistence/types.js';
import {
  prepareRiskCheckCommand,
  prepareRiskHistoryCommand,
  prepareRiskRecordCommand,
  requireRiskMintArgument,
} from '../src/risk/command.js';
import { scanTokenRisk } from '../src/risk/service.js';
import { RiskScanError } from '../src/risk/types.js';
import { WRAPPED_SOL_MINT } from '../src/config/index.js';
import { fakeRiskProvider, SCAN_TIME } from './risk-fixtures.js';

describe('risk commands', () => {
  it('allows risk:check when the database is disabled', () => {
    const config = prepareRiskCheckCommand({ DATABASE_ENABLED: 'false' });
    expect(config.database.enabled).toBe(false);
    expect(config.tradingEnabled).toBe(false);
  });

  it('does not create a SQLite file or open persistence for risk:check', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-risk-check-'));
    const dbPath = join(directory, 'missing-dir', 'risk-check.sqlite');

    try {
      const config = prepareRiskCheckCommand({
        DATABASE_ENABLED: 'false',
        DATABASE_PATH: dbPath,
      });
      expect(config.database.enabled).toBe(false);

      await scanTokenRisk({
        tokenMint: WRAPPED_SOL_MINT,
        provider: fakeRiskProvider(),
        commitment: 'confirmed',
        now: () => new Date(SCAN_TIME),
      });

      expect(existsSync(dbPath)).toBe(false);
      const source = readFileSync(new URL('../src/risk/check.ts', import.meta.url), 'utf8');
      expect(source).not.toMatch(/createSqlitePersistenceRepository|recordRiskReport/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('refuses risk:record and risk:history when the database is disabled', () => {
    expect(() => {
      prepareRiskRecordCommand({ DATABASE_ENABLED: 'false' });
    }).toThrow(PersistenceError);

    expect(() => {
      prepareRiskHistoryCommand({ DATABASE_ENABLED: 'false' });
    }).toThrow(/Persistence is disabled/);
  });

  it('rejects every risk command when trading is enabled', () => {
    expect(() => {
      prepareRiskCheckCommand({ TRADING_ENABLED: 'true' });
    }).toThrow(TradingSafetyError);

    expect(() => {
      prepareRiskRecordCommand({ TRADING_ENABLED: 'true' });
    }).toThrow(TradingSafetyError);

    expect(() => {
      prepareRiskHistoryCommand({ TRADING_ENABLED: 'true' });
    }).toThrow(TradingSafetyError);
  });

  it('validates the mint argument', () => {
    expect(() => {
      requireRiskMintArgument(['node', 'check.ts'], 'risk:check');
    }).toThrow(RiskScanError);

    expect(() => {
      requireRiskMintArgument(['node', 'check.ts', 'SOL'], 'risk:check');
    }).toThrow(/Invalid token mint/);

    expect(requireRiskMintArgument(['node', 'check.ts', WRAPPED_SOL_MINT], 'risk:check')).toBe(
      WRAPPED_SOL_MINT,
    );
  });
});
