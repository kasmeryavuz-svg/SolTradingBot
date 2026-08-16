import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISCOVERY_MAX_CANDIDATES,
  DEFAULT_DISCOVERY_POLL_INTERVAL_MS,
  DEFAULT_DISCOVERY_TIMEOUT_MS,
  DEFAULT_DATABASE_BUSY_TIMEOUT_MS,
  DEFAULT_DATABASE_PATH,
  DEFAULT_MARKET_DATA_POLL_INTERVAL_MS,
  DEFAULT_MARKET_DATA_TIMEOUT_MS,
  DEFAULT_TRADING_ENABLED,
  USDC_MINT,
  WRAPPED_SOL_MINT,
  loadConfig,
} from '../src/config/index.js';

describe('loadConfig', () => {
  it('defaults TRADING_ENABLED to false', () => {
    const config = loadConfig({});

    expect(DEFAULT_TRADING_ENABLED).toBe(false);
    expect(config.tradingEnabled).toBe(false);
  });

  it('loads valid development configuration', () => {
    const config = loadConfig({
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      TRADING_ENABLED: 'false',
    });

    expect(config).toEqual({
      nodeEnv: 'development',
      logLevel: 'info',
      tradingEnabled: false,
      solana: {
        network: 'mainnet-beta',
        rpcTimeoutMs: 10_000,
        rpcUrl: 'https://api.mainnet-beta.solana.com',
      },
      marketData: {
        tokenMints: [WRAPPED_SOL_MINT, USDC_MINT],
        timeoutMs: DEFAULT_MARKET_DATA_TIMEOUT_MS,
        pollIntervalMs: DEFAULT_MARKET_DATA_POLL_INTERVAL_MS,
      },
      discovery: {
        enabled: true,
        includeProfiles: true,
        includeBoosts: true,
        timeoutMs: DEFAULT_DISCOVERY_TIMEOUT_MS,
        pollIntervalMs: DEFAULT_DISCOVERY_POLL_INTERVAL_MS,
        maxCandidates: DEFAULT_DISCOVERY_MAX_CANDIDATES,
        enrichMarketData: true,
      },
      database: {
        enabled: true,
        path: DEFAULT_DATABASE_PATH,
        busyTimeoutMs: DEFAULT_DATABASE_BUSY_TIMEOUT_MS,
      },
    });
  });

  it('loads database settings from the environment', () => {
    const config = loadConfig({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: ':memory:',
      DATABASE_BUSY_TIMEOUT_MS: '2500',
    });

    expect(config.database).toEqual({
      enabled: true,
      path: ':memory:',
      busyTimeoutMs: 2500,
    });
  });

  it('accepts an in-memory database path', () => {
    expect(loadConfig({ DATABASE_PATH: ':memory:' }).database.path).toBe(':memory:');
  });

  it('rejects an empty DATABASE_PATH', () => {
    expect(() => {
      loadConfig({ DATABASE_PATH: '' });
    }).toThrow(/Invalid DATABASE_PATH/);
  });

  it('rejects an invalid database busy timeout', () => {
    expect(() => {
      loadConfig({ DATABASE_BUSY_TIMEOUT_MS: '0' });
    }).toThrow(/Invalid DATABASE_BUSY_TIMEOUT_MS/);
  });

  it('parses DATABASE_ENABLED=false without affecting trading', () => {
    const config = loadConfig({
      DATABASE_ENABLED: 'false',
      TRADING_ENABLED: 'false',
    });

    expect(config.database.enabled).toBe(false);
    expect(config.tradingEnabled).toBe(false);
  });

  it('loads market-data watchlist and polling settings', () => {
    const config = loadConfig({
      MARKET_DATA_TOKEN_MINTS: `${WRAPPED_SOL_MINT},${WRAPPED_SOL_MINT},${USDC_MINT}`,
      MARKET_DATA_TIMEOUT_MS: '8000',
      MARKET_DATA_POLL_INTERVAL_MS: '20000',
    });

    expect(config.marketData).toEqual({
      tokenMints: [WRAPPED_SOL_MINT, USDC_MINT],
      timeoutMs: 8000,
      pollIntervalMs: 20_000,
    });
  });

  it('rejects an invalid market-data poll interval', () => {
    expect(() => {
      loadConfig({ MARKET_DATA_POLL_INTERVAL_MS: '0' });
    }).toThrow(/Invalid MARKET_DATA_POLL_INTERVAL_MS/);
  });

  it('loads Solana RPC settings from the environment', () => {
    const config = loadConfig({
      SOLANA_NETWORK: 'devnet',
      SOLANA_RPC_TIMEOUT_MS: '2500',
      SOLANA_RPC_URL: 'https://api.devnet.solana.com',
    });

    expect(config.solana).toEqual({
      network: 'devnet',
      rpcTimeoutMs: 2500,
      rpcUrl: 'https://api.devnet.solana.com',
    });
  });

  it('rejects an invalid Solana RPC URL without echoing it', () => {
    expect(() => {
      loadConfig({ SOLANA_RPC_URL: 'ftp://example.com/?api-key=supersecret' });
    }).toThrow(/Invalid SOLANA_RPC_URL/);

    try {
      loadConfig({ SOLANA_RPC_URL: 'ftp://example.com/?api-key=supersecret' });
      throw new Error('expected config to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain('supersecret');
    }
  });

  it('loads discovery settings from the environment', () => {
    const config = loadConfig({
      DISCOVERY_ENABLED: 'true',
      DISCOVERY_INCLUDE_PROFILES: 'false',
      DISCOVERY_INCLUDE_BOOSTS: 'true',
      DISCOVERY_TIMEOUT_MS: '8000',
      DISCOVERY_POLL_INTERVAL_MS: '45000',
      DISCOVERY_MAX_CANDIDATES: '12',
      DISCOVERY_ENRICH_MARKET_DATA: 'false',
    });

    expect(config.discovery).toEqual({
      enabled: true,
      includeProfiles: false,
      includeBoosts: true,
      timeoutMs: 8000,
      pollIntervalMs: 45_000,
      maxCandidates: 12,
      enrichMarketData: false,
    });
  });

  it('rejects discovery with no enabled sources', () => {
    expect(() => {
      loadConfig({
        DISCOVERY_ENABLED: 'true',
        DISCOVERY_INCLUDE_PROFILES: 'false',
        DISCOVERY_INCLUDE_BOOSTS: 'false',
      });
    }).toThrow(/at least one discovery source/i);
  });

  it('allows both discovery sources to be off when discovery is disabled', () => {
    const config = loadConfig({
      DISCOVERY_ENABLED: 'false',
      DISCOVERY_INCLUDE_PROFILES: 'false',
      DISCOVERY_INCLUDE_BOOSTS: 'false',
    });

    expect(config.discovery.enabled).toBe(false);
  });

  it('rejects an invalid discovery timeout', () => {
    expect(() => {
      loadConfig({ DISCOVERY_TIMEOUT_MS: '0' });
    }).toThrow(/Invalid DISCOVERY_TIMEOUT_MS/);
  });

  it('rejects an invalid discovery poll interval', () => {
    expect(() => {
      loadConfig({ DISCOVERY_POLL_INTERVAL_MS: '-1' });
    }).toThrow(/Invalid DISCOVERY_POLL_INTERVAL_MS/);
  });

  it('rejects DISCOVERY_MAX_CANDIDATES that is not a positive integer', () => {
    expect(() => {
      loadConfig({ DISCOVERY_MAX_CANDIDATES: '0' });
    }).toThrow(/Invalid DISCOVERY_MAX_CANDIDATES/);
  });

  it('rejects DISCOVERY_MAX_CANDIDATES above the operational upper bound', () => {
    expect(() => {
      loadConfig({ DISCOVERY_MAX_CANDIDATES: '101' });
    }).toThrow(/Invalid DISCOVERY_MAX_CANDIDATES/);
  });

  it('does not read the process environment', () => {
    const previous = process.env['TRADING_ENABLED'];
    process.env['TRADING_ENABLED'] = 'true';

    try {
      const config = loadConfig({});
      expect(config.tradingEnabled).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env['TRADING_ENABLED'];
      } else {
        process.env['TRADING_ENABLED'] = previous;
      }
    }
  });
});
