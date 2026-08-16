import { describe, expect, it } from 'vitest';
import { DEFAULT_TRADING_ENABLED, loadConfig } from '../src/config/index.js';

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
    });
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
