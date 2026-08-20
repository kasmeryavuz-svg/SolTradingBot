import { describe, expect, it, vi } from 'vitest';
import { evaluateSafetyPayload } from '../src/recovery-watcher/safety.js';
import { collectTokenRights } from '../src/recovery-watcher/token-rights-collector.js';
import { SPL_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '../src/risk/constants.js';
import type { RiskDataProvider } from '../src/risk/provider.js';
import { RiskProviderUnavailableError, RiskScanError } from '../src/risk/types.js';

const MINT = 'So11111111111111111111111111111111111111112';
const AUTHORITY = '11111111111111111111111111111111';
const now = () => new Date('2026-08-20T12:00:00.000Z');

function provider(value: unknown): RiskDataProvider {
  return {
    getMintAccount: vi.fn(() => Promise.resolve({ contextSlot: 42, value })),
    getTokenSupply: vi.fn(() => Promise.reject(new Error('supply must not be called'))),
    getLargestTokenAccounts: vi.fn(() => Promise.reject(new Error('largest accounts must not be called'))),
  };
}

function mintValue(owner: string, info: Record<string, unknown> = {}): unknown {
  return {
    owner,
    data: { parsed: { type: 'mint', info: { isInitialized: true, decimals: 9, ...info } } },
  };
}

describe('recovery token-rights collector', () => {
  it('collects complete SPL facts that can PASS', async () => {
    const result = await collectTokenRights({
      provider: provider(mintValue(SPL_TOKEN_PROGRAM_ID)),
      tokenMint: MINT,
      now,
    });
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;
    expect(result.payload.factsComplete).toBe(true);
    expect(evaluateSafetyPayload(result.payload).status).toBe('PASS');
    expect(result.provenance).toMatchObject({ contextSlot: 42, commitment: 'finalized' });
  });

  it('preserves active mint authority and evaluates FAIL', async () => {
    const result = await collectTokenRights({
      provider: provider(mintValue(SPL_TOKEN_PROGRAM_ID, { mintAuthority: AUTHORITY })),
      tokenMint: MINT,
      now,
    });
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;
    expect(result.payload.mintAuthority).toBe(AUTHORITY);
    expect(evaluateSafetyPayload(result.payload).status).toBe('FAIL');
  });

  it('preserves active freeze authority and evaluates FAIL', async () => {
    const result = await collectTokenRights({
      provider: provider(mintValue(SPL_TOKEN_PROGRAM_ID, { freezeAuthority: AUTHORITY })),
      tokenMint: MINT,
      now,
    });
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;
    expect(result.payload.freezeAuthority).toBe(AUTHORITY);
    expect(evaluateSafetyPayload(result.payload).status).toBe('FAIL');
  });

  it('preserves dangerous Token-2022 extension facts', async () => {
    const result = await collectTokenRights({
      provider: provider(
        mintValue(TOKEN_2022_PROGRAM_ID, {
          extensions: [{ extension: 'nonTransferable', state: {} }],
        }),
      ),
      tokenMint: MINT,
      now,
    });
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;
    expect(result.payload.extensions[0]?.name).toBe('NonTransferable');
    expect(evaluateSafetyPayload(result.payload).status).toBe('FAIL');
  });

  it('keeps unsupported programs incomplete and UNKNOWN', async () => {
    const result = await collectTokenRights({
      provider: provider(mintValue('BPFLoaderUpgradeab1e11111111111111111111111')),
      tokenMint: MINT,
      now,
    });
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;
    expect(result.payload).toMatchObject({
      tokenProgram: 'unsupported',
      mintAuthority: null,
      freezeAuthority: null,
      extensions: [],
      factsComplete: false,
    });
    expect(evaluateSafetyPayload(result.payload).status).toBe('UNKNOWN');
  });

  it('rejects malformed unsupported-owner accounts and context slots', async () => {
    await expect(
      collectTokenRights({
        provider: provider({ owner: 'BPFLoaderUpgradeab1e11111111111111111111111', data: {} }),
        tokenMint: MINT,
        now,
      }),
    ).rejects.toThrow('Account is not a parsed mint.');
    await expect(
      collectTokenRights({
        provider: {
          getMintAccount: vi.fn(() =>
            Promise.resolve({
              contextSlot: Number.NaN,
              value: mintValue('BPFLoaderUpgradeab1e11111111111111111111111'),
            }),
          ),
        },
        tokenMint: MINT,
        now,
      }),
    ).rejects.toThrow('mintContextSlot');
  });

  it('keeps unclassified extensions incomplete', async () => {
    const result = await collectTokenRights({
      provider: provider(
        mintValue(TOKEN_2022_PROGRAM_ID, {
          extensions: [{ extension: 'futureExtension', state: {} }],
        }),
      ),
      tokenMint: MINT,
      now,
    });
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;
    expect(result.payload.factsComplete).toBe(false);
    expect(evaluateSafetyPayload(result.payload).status).toBe('UNKNOWN');
  });

  it('keeps known authority danger FAIL even with an unclassified extension', async () => {
    const result = await collectTokenRights({
      provider: provider(
        mintValue(TOKEN_2022_PROGRAM_ID, {
          mintAuthority: AUTHORITY,
          extensions: [{ extension: 'futureExtension', state: {} }],
        }),
      ),
      tokenMint: MINT,
      now,
    });
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') return;
    expect(result.payload.factsComplete).toBe(false);
    expect(evaluateSafetyPayload(result.payload).status).toBe('FAIL');
  });

  it('returns unavailable for provider outage and keeps malformed responses fatal', async () => {
    const outage = await collectTokenRights({
      provider: {
        getMintAccount: vi.fn(() =>
          Promise.reject(new RiskProviderUnavailableError('RPC unavailable')),
        ),
      },
      tokenMint: MINT,
      now,
    });
    expect(outage).toMatchObject({ kind: 'unavailable', payload: null });

    await expect(
      collectTokenRights({
        provider: { getMintAccount: vi.fn(() => Promise.reject(new Error('programming bug'))) },
        tokenMint: MINT,
        now,
      }),
    ).rejects.toThrow('programming bug');

    await expect(
      collectTokenRights({
        provider: {
          getMintAccount: vi.fn(() => Promise.reject(new RiskScanError('integrity failure'))),
        },
        tokenMint: MINT,
        now,
      }),
    ).rejects.toThrow('integrity failure');

    await expect(
      collectTokenRights({ provider: provider({}), tokenMint: MINT, now }),
    ).rejects.toThrow('Mint account payload is malformed.');
  });

  it('never calls supply or largest-account methods', async () => {
    const p = provider(mintValue(SPL_TOKEN_PROGRAM_ID));
    await collectTokenRights({ provider: p, tokenMint: MINT, now });
    // These are injected spies; reading them here is the assertion under test.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(vi.mocked(p.getMintAccount)).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(vi.mocked(p.getTokenSupply)).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(vi.mocked(p.getLargestTokenAccounts)).not.toHaveBeenCalled();
  });
});
