import { afterEach, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/core/index.js';

describe('startup banner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints the Checkpoint 00 foundation message', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((message: unknown) => {
      lines.push(String(message));
    });

    startApp({
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      TRADING_ENABLED: 'false',
    });

    expect(lines).toEqual([
      'Meme Trading Bot',
      'Mode: development',
      'Trading capability: disabled',
    ]);
  });
});
