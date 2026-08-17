import { afterEach, describe, expect, it, vi } from 'vitest';
import { startApp } from '../src/core/index.js';
import type { SolanaRpcReader } from '../src/solana/types.js';

const healthyRpc: SolanaRpcReader = {
  getHealth: () => Promise.resolve('ok'),
  getSlot: () => Promise.resolve(123456n),
  getVersion: () => Promise.resolve({ 'feature-set': 1, 'solana-core': '2.1.0' }),
};

describe('startup banner', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints the Checkpoint 06 capability status', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((message: unknown) => {
      lines.push(String(message));
    });

    await startApp(
      {
        NODE_ENV: 'development',
        LOG_LEVEL: 'info',
        TRADING_ENABLED: 'false',
      },
      { solanaRpc: healthyRpc },
    );

    expect(lines).toEqual([
      'Meme Trading Bot',
      'Mode: development',
      'Trading capability: disabled',
      '',
      'Solana:',
      'Network: mainnet-beta',
      'RPC: connected',
      'Slot: 123456',
      'Version: 2.1.0',
      'Health: ok',
      '',
      'Checkpoint: 06',
      'Blockchain capability: READ ONLY',
      'Local persistence: available',
      'Token risk scanner: available',
      'Feature engine: available',
      'Trading strategy: unavailable',
      'Trading capability: disabled',
    ]);
  });
});
