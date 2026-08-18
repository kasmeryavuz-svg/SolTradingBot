import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/load-config.js';
import { WalletIntelligenceError } from '../src/wallet-intelligence/errors.js';
import {
  formatWalletIntelligenceError,
  sanitizeWalletIntelligenceText,
} from '../src/wallet-intelligence/sanitize.js';
import { createHeliusWalletIntelligenceProvider } from '../src/wallet-intelligence/provider.js';
import { formatWalletIntelligenceStatusLines } from '../src/wallet-intelligence/format.js';
import { WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT } from '../src/wallet-intelligence/identity.js';
import { WI_SECRET } from './wallet-intelligence-fixtures.js';

function jsonBody(payload: unknown): ArrayBuffer {
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
}

describe('wallet intelligence secret sanitation', () => {
  it('never leaks the injected API key from HTTP, timeout, JSON, provider, database, or formatter paths', async () => {
    const authenticated = `https://mainnet.helius-rpc.com/?api-key=${WI_SECRET}`;
    const secrets = [WI_SECRET];

    const timeoutProvider = createHeliusWalletIntelligenceProvider({
      apiKey: WI_SECRET,
      fetchImpl: () => Promise.reject(new Error(`timeout contacting ${authenticated}`)),
    });
    try {
      await timeoutProvider.verifyMainnetIdentity();
      throw new Error('expected failure');
    } catch (error: unknown) {
      const message = formatWalletIntelligenceError(error, secrets);
      expect(error).toBeInstanceOf(WalletIntelligenceError);
      expect((error as Error).message).not.toContain(WI_SECRET);
      expect(message).not.toContain(WI_SECRET);
      expect(message).not.toContain(authenticated);
      expect(String(error)).not.toContain(WI_SECRET);
    }

    const httpProvider = createHeliusWalletIntelligenceProvider({
      apiKey: WI_SECRET,
      fetchImpl: () =>
        Promise.resolve({
          status: 500,
          headers: { get: () => 'application/json' },
          arrayBuffer: () => Promise.resolve(jsonBody({ error: WI_SECRET, url: authenticated })),
        }),
    });
    try {
      await httpProvider.verifyMainnetIdentity();
      throw new Error('expected failure');
    } catch (error: unknown) {
      expect(formatWalletIntelligenceError(error, secrets)).not.toContain(WI_SECRET);
      expect((error as Error).message).not.toContain(WI_SECRET);
    }

    const jsonProvider = createHeliusWalletIntelligenceProvider({
      apiKey: WI_SECRET,
      fetchImpl: () =>
        Promise.resolve({
          status: 200,
          headers: { get: () => 'application/json' },
          arrayBuffer: () => Promise.resolve(jsonBody({ error: { message: WI_SECRET } })),
        }),
    });
    try {
      await jsonProvider.verifyMainnetIdentity();
      throw new Error('expected failure');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(WalletIntelligenceError);
      expect(formatWalletIntelligenceError(error, secrets)).not.toContain(WI_SECRET);
      expect((error as Error).message).not.toContain(WI_SECRET);
    }

    let page = 0;
    const pagingProvider = createHeliusWalletIntelligenceProvider({
      apiKey: WI_SECRET,
      fetchImpl: () => {
        page += 1;
        return Promise.resolve({
          status: 500,
          headers: { get: () => 'application/json' },
          arrayBuffer: () =>
            Promise.resolve(jsonBody({ error: `${WI_SECRET} page ${String(page)} ${authenticated}` })),
        });
      },
    });
    for (const token of [null, '100', '200'] as const) {
      try {
        await pagingProvider.getRecentWalletHistoryPage({
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
          limit: token === '200' ? 1 : 100,
          paginationToken: token,
        });
        throw new Error('expected failure');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(WalletIntelligenceError);
        expect((error as Error).message).not.toContain(WI_SECRET);
        expect((error as Error).message).not.toContain(authenticated);
        expect(formatWalletIntelligenceError(error, secrets)).not.toContain(WI_SECRET);
      }
    }

    const malformedJsonProvider = createHeliusWalletIntelligenceProvider({
      apiKey: WI_SECRET,
      fetchImpl: () =>
        Promise.resolve({
          status: 200,
          headers: { get: () => 'application/json' },
          arrayBuffer: () =>
            Promise.resolve(new TextEncoder().encode(`not-json ${WI_SECRET} ${authenticated}`).buffer),
        }),
    });
    try {
      await malformedJsonProvider.verifyMainnetIdentity();
      throw new Error('expected failure');
    } catch (error: unknown) {
      expect(formatWalletIntelligenceError(error, secrets)).not.toContain(WI_SECRET);
    }

    const databaseError = new WalletIntelligenceError(`database failed ${WI_SECRET} ${authenticated}`, {
      code: 'persistence_failed',
    });
    const formatterError = new Error(`formatter failed ${WI_SECRET}`);
    expect(formatWalletIntelligenceError(databaseError, secrets)).not.toContain(WI_SECRET);
    expect(formatWalletIntelligenceError(formatterError, secrets)).not.toContain(WI_SECRET);

    const text = sanitizeWalletIntelligenceText(
      `HELIUS_API_KEY=${WI_SECRET} api_key=${WI_SECRET} api-key=${WI_SECRET} ${authenticated}`,
      secrets,
    );
    expect(text).not.toContain(WI_SECRET);
    expect(text).not.toMatch(/api-key=super-secret/i);
    expect(loadConfig({ HELIUS_API_KEY: WI_SECRET }).walletIntelligence.heliusApiKey).toBe(WI_SECRET);
    const publicText = formatWalletIntelligenceStatusLines().join('\n');
    expect(publicText).not.toContain(WI_SECRET);
    expect(publicText).not.toContain(authenticated);
    expect(WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT).not.toContain(WI_SECRET);
  });
});
