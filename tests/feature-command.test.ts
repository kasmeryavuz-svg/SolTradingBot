import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WRAPPED_SOL_MINT } from '../src/config/index.js';
import { TradingSafetyError } from '../src/core/index.js';
import {
  prepareFeatureCheckCommand,
  prepareFeatureHistoryCommand,
  prepareFeatureRecordCommand,
  requireFeatureMintArgument,
} from '../src/features/command.js';
import { RISK_REPORT_UNAVAILABLE_REASON } from '../src/features/risk-features.js';
import { generateLiveFeatureVector } from '../src/features/live.js';
import { FeatureEngineError } from '../src/features/types.js';
import { PersistenceError } from '../src/persistence/types.js';
import {
  createSqlitePersistenceRepository,
  SqlitePersistenceRepository,
} from '../src/persistence/index.js';
import { FEATURE_GENERATED_AT, failingMarketProvider, fakeMarketProvider, liveRiskProvider, sampleSnapshot } from './feature-fixtures.js';
import { featureValue } from './feature-fixtures.js';

const openRepos: SqlitePersistenceRepository[] = [];

afterEach(() => {
  while (openRepos.length > 0) {
    openRepos.pop()?.close();
  }
});

describe('feature commands', () => {
  it('allows feature:check when the database is disabled and creates no SQLite file', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-feature-check-'));
    const dbPath = join(directory, 'missing-dir', 'feature-check.sqlite');

    try {
      const config = prepareFeatureCheckCommand({
        DATABASE_ENABLED: 'false',
        DATABASE_PATH: dbPath,
      });
      expect(config.database.enabled).toBe(false);

      const vector = await generateLiveFeatureVector({
        tokenMint: WRAPPED_SOL_MINT,
        marketProvider: fakeMarketProvider(sampleSnapshot()),
        riskProvider: liveRiskProvider(),
        commitment: 'confirmed',
        now: () => new Date(FEATURE_GENERATED_AT),
      });

      expect(vector.previousMarketCollectedAt).toBeNull();
      expect(existsSync(dbPath)).toBe(false);
      const source = readFileSync(new URL('../src/features/check.ts', import.meta.url), 'utf8');
      expect(source).not.toMatch(/createSqlitePersistenceRepository|recordFeatureBundle/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps market-only features when the live risk scan fails', async () => {
    const vector = await generateLiveFeatureVector({
      tokenMint: WRAPPED_SOL_MINT,
      marketProvider: fakeMarketProvider(sampleSnapshot()),
      riskProvider: {
        getMintAccount: () => Promise.reject(new Error('rpc failed https://api.example.com/?api-key=supersecret')),
        getTokenSupply: () => Promise.reject(new Error('unused')),
        getLargestTokenAccounts: () => Promise.reject(new Error('unused')),
      },
      commitment: 'confirmed',
      now: () => new Date(FEATURE_GENERATED_AT),
    });

    expect(vector.featureCompleteness).toBe('partial');
    expect(featureValue(vector, 'market_price_usd').status).toBe('available');
    expect(featureValue(vector, 'risk_finding_mint_authority_active').status).toBe('unavailable');
    expect(featureValue(vector, 'risk_data_complete').unavailableReason).toBe(RISK_REPORT_UNAVAILABLE_REASON);
    expect(JSON.stringify(vector)).not.toContain('supersecret');
    expect(JSON.stringify(vector)).not.toContain('rpc failed');
  });

  it('fails feature generation when the live market snapshot fails', async () => {
    await expect(
      generateLiveFeatureVector({
        tokenMint: WRAPPED_SOL_MINT,
        marketProvider: failingMarketProvider('market unavailable'),
        riskProvider: liveRiskProvider(),
        commitment: 'confirmed',
      }),
    ).rejects.toThrow(/market unavailable/);
  });

  it('writes nothing when feature:record cannot obtain a market snapshot', async () => {
    const repository = createSqlitePersistenceRepository({
      path: ':memory:',
      busyTimeoutMs: 1000,
    });
    repository.initialize();
    openRepos.push(repository);

    await expect(
      generateLiveFeatureVector({
        tokenMint: WRAPPED_SOL_MINT,
        marketProvider: failingMarketProvider('market unavailable'),
        riskProvider: liveRiskProvider(),
        commitment: 'confirmed',
      }),
    ).rejects.toThrow(/market unavailable/);
    expect(repository.getStats().featureVectorCount).toBe(0);
    expect(repository.getStats().marketSnapshotCount).toBe(0);
    expect(repository.getStats().riskScanCount).toBe(0);
  });

  it('refuses feature:record and feature:history when the database is disabled', () => {
    expect(() => {
      prepareFeatureRecordCommand({ DATABASE_ENABLED: 'false' });
    }).toThrow(PersistenceError);
    expect(() => {
      prepareFeatureHistoryCommand({ DATABASE_ENABLED: 'false' });
    }).toThrow(/Persistence is disabled/);
  });

  it('rejects every feature command when trading is enabled', () => {
    expect(() => {
      prepareFeatureCheckCommand({ TRADING_ENABLED: 'true' });
    }).toThrow(TradingSafetyError);
    expect(() => {
      prepareFeatureRecordCommand({ TRADING_ENABLED: 'true' });
    }).toThrow(TradingSafetyError);
    expect(() => {
      prepareFeatureHistoryCommand({ TRADING_ENABLED: 'true' });
    }).toThrow(TradingSafetyError);
  });

  it('validates the mint argument', () => {
    expect(() => {
      requireFeatureMintArgument(['node', 'check.ts'], 'feature:check');
    }).toThrow(FeatureEngineError);
    expect(requireFeatureMintArgument(['node', 'check.ts', WRAPPED_SOL_MINT], 'feature:check')).toBe(
      WRAPPED_SOL_MINT,
    );
  });

  it('does not add a feature watcher or auto-wire collector/risk commands', () => {
    const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    expect(packageJson).toContain('feature:check');
    expect(packageJson).toContain('feature:record');
    expect(packageJson).toContain('feature:history');
    expect(packageJson).not.toContain('feature:watch');

    const collector = readFileSync(new URL('../src/collector/once.ts', import.meta.url), 'utf8');
    const collectorWatch = readFileSync(new URL('../src/collector/watch.ts', import.meta.url), 'utf8');
    const riskRecord = readFileSync(new URL('../src/risk/record.ts', import.meta.url), 'utf8');
    const history = readFileSync(new URL('../src/features/history.ts', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../src/core/app.ts', import.meta.url), 'utf8');
    const loadConfig = readFileSync(new URL('../src/config/load-config.ts', import.meta.url), 'utf8');
    expect(collector).not.toMatch(/generateFeatureVector|recordFeatureBundle/);
    expect(collectorWatch).not.toMatch(/generateFeatureVector|recordFeatureBundle/);
    expect(riskRecord).not.toMatch(/generateFeatureVector|recordFeatureBundle/);
    expect(history).not.toMatch(/recordFeatureBundle|recordMarketSnapshots|recordRiskReport/);
    expect(app).not.toMatch(/generateFeatureVector|recordFeatureBundle/);
    expect(loadConfig).not.toMatch(/FEATURE_SET_VERSION/);
  });
});
