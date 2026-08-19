import { describe, expect, it } from 'vitest';
import { loadProductionConfig } from '../src/production/config.js';
import { PROD20_HEALTH_HOST } from '../src/production/constants.js';
import { ProductionError } from '../src/production/errors.js';
import { parseProductionWatchlist } from '../src/production/watchlist.js';
import { mintAt, productionEnv, twentyMints, USDC, WSOL } from './production-fixtures.js';

describe('production config', () => {
  it('defaults to disabled paper/data supervisor settings', () => {
    const config = loadProductionConfig({});
    expect(config.enabled).toBe(false);
    expect(config.collectorEnabled).toBe(true);
    expect(config.paperEnabled).toBe(false);
    expect(config.intervalMs).toBe(300_000);
    expect(config.healthPort).toBe(4314);
    expect(config.healthHost).toBe('127.0.0.1');
    expect(config.paperMints).toEqual([]);
    expect(config.workMode).toBe('DATA_ONLY');
  });

  it('refuses prod:run when disabled', () => {
    expect(() => loadProductionConfig({ PROD20_ENABLED: 'false' }, { requireEnabled: true })).toThrow(
      ProductionError,
    );
    try {
      loadProductionConfig({ PROD20_ENABLED: 'false' }, { requireEnabled: true });
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ProductionError);
      expect((error as ProductionError).code).toBe('production_disabled');
    }
  });

  it('refuses collector=false and paper=false', () => {
    expect(() =>
      loadProductionConfig(
        productionEnv({ PROD20_COLLECTOR_ENABLED: 'false', PROD20_PAPER_ENABLED: 'false' }),
        { requireWork: true },
      ),
    ).toThrow(/no_production_work_enabled|both disabled/);
  });

  it('refuses paper=true with an empty watchlist', () => {
    expect(() =>
      loadProductionConfig(productionEnv({ PROD20_PAPER_ENABLED: 'true', PROD20_PAPER_MINTS: '' })),
    ).toThrow(/at least one valid Solana mint/);
  });

  it('allows 20 unique mints and refuses 21', () => {
    const twenty = twentyMints();
    expect(parseProductionWatchlist(twenty.join(','), true)).toHaveLength(20);
    expect(() => parseProductionWatchlist([...twenty, mintAt(20)].join(','), true)).toThrow(/At most 20/);
  });

  it('deduplicates and applies stable code-point order', () => {
    const reversed = `${USDC},${WSOL},${USDC}`;
    const normalized = parseProductionWatchlist(reversed, true);
    expect(normalized).toEqual(parseProductionWatchlist(`${WSOL},${USDC}`, true));
    const first = normalized[0];
    const second = normalized[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first !== undefined && second !== undefined) {
      expect(first < second).toBe(true);
    }
    expect(normalized).toHaveLength(2);
  });

  it('rejects empty interior values and symbols', () => {
    expect(() => parseProductionWatchlist(`${WSOL},,${USDC}`, true)).toThrow(/empty entries/);
    expect(() => parseProductionWatchlist('BONK', true)).toThrow(/mint address/);
  });

  it('rejects interval and health port outside bounds', () => {
    expect(() => loadProductionConfig(productionEnv({ PROD20_INTERVAL_MS: '59999' }))).toThrow(
      /PROD20_INTERVAL_MS/,
    );
    expect(loadProductionConfig(productionEnv({ PROD20_INTERVAL_MS: '60000' })).intervalMs).toBe(60_000);
    expect(loadProductionConfig(productionEnv({ PROD20_INTERVAL_MS: '3600000' })).intervalMs).toBe(
      3_600_000,
    );
    expect(() => loadProductionConfig(productionEnv({ PROD20_INTERVAL_MS: '3600001' }))).toThrow(
      /PROD20_INTERVAL_MS/,
    );
    expect(() => loadProductionConfig(productionEnv({ PROD20_HEALTH_PORT: '80' }))).toThrow(
      /PROD20_HEALTH_PORT/,
    );
    expect(loadProductionConfig(productionEnv({ PROD20_HEALTH_PORT: '4314' })).healthHost).toBe(
      '127.0.0.1',
    );
  });

  it('rejects env overrides of the loopback health host', () => {
    expect(PROD20_HEALTH_HOST).toBe('127.0.0.1');
    const config = loadProductionConfig(
      productionEnv({
        PROD20_HEALTH_HOST: '0.0.0.0',
        HEALTH_HOST: '::',
        HOST: '0.0.0.0',
      }),
    );
    expect(config.healthHost).toBe('127.0.0.1');
    expect(config.healthHost).not.toBe('0.0.0.0');
    expect(config.healthHost).not.toBe('::');
  });
});
