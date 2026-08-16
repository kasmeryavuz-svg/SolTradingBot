import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/index.js';
import { assertTradingDisabled, startApp, TradingSafetyError } from '../src/core/index.js';

describe('trading safety guard', () => {
  it('rejects TRADING_ENABLED=true', () => {
    const config = loadConfig({ TRADING_ENABLED: 'true' });

    expect(() => {
      assertTradingDisabled(config);
    }).toThrow(TradingSafetyError);

    expect(() => {
      assertTradingDisabled(config);
    }).toThrow(/live trading capability has not been implemented/i);
  });

  it('allows the app to start when trading is disabled', () => {
    const config = loadConfig({
      NODE_ENV: 'development',
      TRADING_ENABLED: 'false',
    });

    expect(() => {
      assertTradingDisabled(config);
    }).not.toThrow();
  });

  it('prevents startApp from running when trading is enabled', async () => {
    await expect(startApp({ TRADING_ENABLED: 'true' })).rejects.toThrow(TradingSafetyError);
  });
});
