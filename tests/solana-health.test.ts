import { describe, expect, it } from 'vitest';
import { checkSolanaHealth, formatSolanaStatusLines, SolanaConnectionError } from '../src/solana/index.js';
import type { SolanaRpcReader } from '../src/solana/types.js';
import { startApp, TradingSafetyError } from '../src/core/index.js';

function healthyReader(overrides: Partial<SolanaRpcReader> = {}): SolanaRpcReader {
  return {
    getHealth: () => Promise.resolve('ok'),
    getSlot: () => Promise.resolve(42n),
    getVersion: () => Promise.resolve({ 'feature-set': 99, 'solana-core': '2.3.4' }),
    ...overrides,
  };
}

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error('Aborted');
}

function hangUntilAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(asError(signal.reason));
      return;
    }

    signal.addEventListener('abort', () => {
      reject(asError(signal.reason));
    });
  });
}

describe('Solana health check', () => {
  it('creates a healthy result from valid mocked RPC responses', async () => {
    const result = await checkSolanaHealth(healthyReader(), {
      network: 'mainnet-beta',
      timeoutMs: 1000,
    });

    expect(result.ok).toBe(true);
    expect(result.network).toBe('mainnet-beta');
    expect(result.rpcHealth).toBe('ok');
    expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('parses and returns the current slot', async () => {
    const result = await checkSolanaHealth(healthyReader({ getSlot: () => Promise.resolve(987654n) }), {
      network: 'mainnet-beta',
      timeoutMs: 1000,
    });

    expect(result.slot).toBe(987654);
  });

  it('returns Solana node version information', async () => {
    const result = await checkSolanaHealth(
      healthyReader({
        getVersion: () => Promise.resolve({ 'feature-set': 7, 'solana-core': '2.2.14' }),
      }),
      { network: 'devnet', timeoutMs: 1000 },
    );

    expect(result.version).toBe('2.2.14');
  });

  it('handles a malformed RPC response cleanly', async () => {
    await expect(
      checkSolanaHealth(healthyReader({ getSlot: () => Promise.resolve('not-a-slot') }), {
        network: 'mainnet-beta',
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/unexpected slot value/);
  });

  it('handles RPC failure cleanly', async () => {
    const reader = healthyReader({
      getSlot: () => Promise.reject(new Error('fetch failed')),
    });

    await expect(
      checkSolanaHealth(reader, { network: 'mainnet-beta', timeoutMs: 1000 }),
    ).rejects.toBeInstanceOf(SolanaConnectionError);

    await expect(
      checkSolanaHealth(reader, { network: 'mainnet-beta', timeoutMs: 1000 }),
    ).rejects.toThrow(/Solana RPC is unavailable/);
  });

  it('handles timeout cleanly', async () => {
    const reader: SolanaRpcReader = {
      getHealth: hangUntilAbort,
      getSlot: hangUntilAbort,
      getVersion: hangUntilAbort,
    };

    await expect(
      checkSolanaHealth(reader, { network: 'mainnet-beta', timeoutMs: 25 }),
    ).rejects.toBeInstanceOf(SolanaConnectionError);

    await expect(
      checkSolanaHealth(reader, { network: 'mainnet-beta', timeoutMs: 25 }),
    ).rejects.toThrow(/timed out after 25ms/);
  });

  it('does not expose sensitive RPC query values when a check fails', async () => {
    const reader = healthyReader({
      getVersion: () =>
        Promise.reject(new Error('request to https://rpc.example/?api-key=supersecret failed')),
    });

    await expect(
      startApp(
        {
          SOLANA_RPC_URL: 'https://rpc.example/?api-key=supersecret',
          TRADING_ENABLED: 'false',
        },
        { solanaRpc: reader },
      ),
    ).rejects.toBeInstanceOf(SolanaConnectionError);

    try {
      await startApp(
        {
          SOLANA_RPC_URL: 'https://rpc.example/?api-key=supersecret',
          TRADING_ENABLED: 'false',
        },
        { solanaRpc: reader },
      );
    } catch (error: unknown) {
      const text = error instanceof Error ? error.message : String(error);
      expect(text).not.toContain('supersecret');
      expect(text).not.toContain('api-key=supersecret');
    }
  });

  it('does not print RPC URLs or query values in status lines', async () => {
    const result = await checkSolanaHealth(healthyReader(), {
      network: 'mainnet-beta',
      timeoutMs: 1000,
    });

    const output = formatSolanaStatusLines(result).join('\n');
    expect(output).not.toMatch(/https?:\/\//);
    expect(output).not.toContain('api-key');
  });

  it('still rejects TRADING_ENABLED=true', async () => {
    await expect(startApp({ TRADING_ENABLED: 'true' })).rejects.toBeInstanceOf(TradingSafetyError);
  });
});
