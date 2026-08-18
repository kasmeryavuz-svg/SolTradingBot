import { describe, expect, it } from 'vitest';
import { SOLANA_MAINNET_GENESIS_HASH } from '../src/wallet-intelligence/constants.js';
import { WalletIntelligenceError } from '../src/wallet-intelligence/errors.js';
import { createHeliusWalletIntelligenceProvider } from '../src/wallet-intelligence/provider.js';
import { WI_SECRET } from './wallet-intelligence-fixtures.js';

describe('helius wallet intelligence provider', () => {
  it('constructs the official mainnet RPC URL internally and never requires a key inside a user URL', async () => {
    const urls: string[] = [];
    const provider = createHeliusWalletIntelligenceProvider({
      apiKey: WI_SECRET,
      fetchImpl: (url) => {
        urls.push(url);
        return Promise.resolve({
          status: 200,
          headers: { get: () => 'application/json' },
          arrayBuffer: () =>
            Promise.resolve(
              new TextEncoder().encode(
                JSON.stringify({ jsonrpc: '2.0', id: 1, result: SOLANA_MAINNET_GENESIS_HASH }),
              ).buffer,
            ),
        });
      },
    });
    await provider.verifyMainnetIdentity();
    expect(urls[0]).toContain('https://mainnet.helius-rpc.com/?api-key=');
    expect(urls[0]).toContain(WI_SECRET);
  });

  it('retries once on HTTP 429 and sanitizes the secret from thrown errors', async () => {
    let attempts = 0;
    const provider = createHeliusWalletIntelligenceProvider({
      apiKey: WI_SECRET,
      fetchImpl: () => {
        attempts += 1;
        return Promise.resolve({
          status: 429,
          headers: { get: () => 'application/json' },
          arrayBuffer: () =>
            Promise.resolve(new TextEncoder().encode(`rate limited ${WI_SECRET}`).buffer),
        });
      },
    });
    await expect(provider.verifyMainnetIdentity()).rejects.toBeInstanceOf(WalletIntelligenceError);
    expect(attempts).toBe(2);
    try {
      await provider.verifyMainnetIdentity();
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(WalletIntelligenceError);
      expect((error as Error).message).not.toContain(WI_SECRET);
    }
  });

  it('does not retry on HTTP 400', async () => {
    let attempts = 0;
    const provider = createHeliusWalletIntelligenceProvider({
      apiKey: WI_SECRET,
      fetchImpl: () => {
        attempts += 1;
        return Promise.resolve({
          status: 400,
          headers: { get: () => 'application/json' },
          arrayBuffer: () => Promise.resolve(new TextEncoder().encode('bad').buffer),
        });
      },
    });
    await expect(provider.verifyMainnetIdentity()).rejects.toThrow(/unexpected HTTP status/);
    expect(attempts).toBe(1);
  });

  it('sends bounded full-history pages and a signatures first-observed query', async () => {
    const bodies: string[] = [];
    const provider = createHeliusWalletIntelligenceProvider({
      apiKey: WI_SECRET,
      fetchImpl: (_url, init) => {
        bodies.push(init.body);
        return Promise.resolve({
          status: 200,
          headers: { get: () => 'application/json' },
          arrayBuffer: () =>
            Promise.resolve(
              new TextEncoder().encode(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { data: [], paginationToken: null } })).buffer,
            ),
        });
      },
    });
    await provider.getRecentWalletHistoryPage({
      walletAddress: 'FuTBoFUAqxgzC6wbG2PqFPVtsim3hvYMGTZbk5o9ufRU',
      transactionDetails: 'full',
      encoding: 'jsonParsed',
      maxSupportedTransactionVersion: 0,
      sortOrder: 'desc',
      commitment: 'finalized',
      status: 'succeeded',
      tokenAccounts: 'balanceChanged',
      blockTimeGte: 1,
      blockTimeLte: 2,
      slotLte: 3,
      limit: 100,
      paginationToken: null,
    });
    await provider.getFirstObservedActivity({
      walletAddress: 'FuTBoFUAqxgzC6wbG2PqFPVtsim3hvYMGTZbk5o9ufRU',
      transactionDetails: 'signatures',
      sortOrder: 'asc',
      limit: 1,
      commitment: 'finalized',
      status: 'succeeded',
      tokenAccounts: 'balanceChanged',
      slotLte: 3,
    });
    expect(bodies[0]).toContain('"transactionDetails":"full"');
    expect(bodies[0]).toContain('"limit":100');
    expect(bodies[0]).not.toContain('"limit":201');
    expect(bodies[1]).toContain('"transactionDetails":"signatures"');
    expect(bodies[1]).toContain('"sortOrder":"asc"');
    expect(bodies[1]).not.toContain('blockTime');
    await expect(
      provider.getRecentWalletHistoryPage({
        walletAddress: 'FuTBoFUAqxgzC6wbG2PqFPVtsim3hvYMGTZbk5o9ufRU',
        transactionDetails: 'full',
        encoding: 'jsonParsed',
        maxSupportedTransactionVersion: 0,
        sortOrder: 'desc',
        commitment: 'finalized',
        status: 'succeeded',
        tokenAccounts: 'balanceChanged',
        blockTimeGte: 1,
        blockTimeLte: 2,
        slotLte: 3,
        limit: 201,
        paginationToken: null,
      }),
    ).rejects.toThrow(/Maximum full-page limit is 100/);
  });
});
