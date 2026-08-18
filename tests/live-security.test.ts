import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/index.js';
import { LiveError } from '../src/live/errors.js';
import { formatLiveStatusLines } from '../src/live/format.js';
import { assertLiveExecuteGates } from '../src/live/gates.js';
import { executeLiveStatus } from '../src/live/index.js';

function readSrc(dir: string): string {
  return readdirSync(join(process.cwd(), 'src', dir), { recursive: true })
    .filter((name): name is string => typeof name === 'string' && name.endsWith('.ts'))
    .map((name) => readFileSync(join(process.cwd(), 'src', dir, name), 'utf8'))
    .join('\n');
}

describe('live security', () => {
  it('refuses execute gates when either trading flag is false', () => {
    expect(() => {
      assertLiveExecuteGates(loadConfig({}));
    }).toThrow(LiveError);
    expect(() => {
      assertLiveExecuteGates(loadConfig({ TRADING_ENABLED: 'true', LIVE_BROADCAST_ENABLED: 'false' }));
    }).toThrow(LiveError);
  });

  it('does not print RPC URLs or secrets from live:status', () => {
    const text = formatLiveStatusLines(
      executeLiveStatus({
        TRADING_ENABLED: 'false',
        LIVE_BROADCAST_ENABLED: 'false',
        SOLANA_RPC_URL: 'https://secret-rpc.example/token',
      }),
    ).join('\n');
    expect(text).not.toContain('secret-rpc');
    expect(text).toContain('LIVE_BROADCAST_ENABLED: false');
  });

  it('keeps sendTransaction out of strategy, paper, research, dashboard, execution, and the wallet public barrel', () => {
    for (const dir of ['strategy', 'paper', 'research', 'dashboard', 'execution']) {
      expect(readSrc(dir), dir).not.toMatch(/\.sendTransaction\s*\(|\bsendTransaction\s*\(/);
    }
    const walletIndex = readFileSync(join(process.cwd(), 'src/wallet/index.ts'), 'utf8');
    expect(walletIndex).not.toContain('sendTransaction');
    expect(walletIndex).not.toContain('withInteractiveSigner');
  });
});
