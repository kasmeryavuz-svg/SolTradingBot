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
    });
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
