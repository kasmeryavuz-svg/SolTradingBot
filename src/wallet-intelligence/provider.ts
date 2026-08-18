import {
  FIRST_OBSERVED_ACTIVITY_LIMIT,
  GET_MULTIPLE_ACCOUNTS_CHUNK,
  HELIUS_MAINNET_RPC_HOST,
  HELIUS_MAINNET_RPC_ORIGIN,
  HELIUS_RPC_METHOD_GET_TRANSACTIONS_FOR_ADDRESS,
  HISTORY_FULL_PAGE_LIMIT,
  PROVIDER_MAX_ATTEMPTS,
  PROVIDER_MAX_RESPONSE_BYTES,
  PROVIDER_TIMEOUT_MS,
  SOLANA_MAINNET_GENESIS_HASH,
} from './constants.js';
import { parseTokenBalanceEvidence } from './deltas.js';
import { WalletIntelligenceError } from './errors.js';
import { parseJsonRpcResult } from './jsonrpc.js';
import { isRecord, parseSafeSlot, parseTransactionIndex } from './numbers.js';
import { formatWalletIntelligenceError, secretsFromApiKey } from './sanitize.js';
import type {
  LargestTokenAccount,
  RecentHistoryPageResult,
  WalletHistoryTransaction,
  WalletIntelligenceFetchLike,
  WalletIntelligenceProvider,
} from './types.js';

export function buildHeliusMainnetRpcUrl(apiKey: string): string {
  const params = new URLSearchParams({ 'api-key': apiKey });
  return `${HELIUS_MAINNET_RPC_ORIGIN}/?${params.toString()}`;
}

export function createHeliusWalletIntelligenceProvider(options: {
  apiKey: string;
  fetchImpl?: WalletIntelligenceFetchLike;
  timeoutMs?: number;
}): WalletIntelligenceProvider {
  const apiKey = options.apiKey.trim();
  if (apiKey === '') {
    throw new WalletIntelligenceError('HELIUS_API_KEY is required for wallet-intelligence network commands.', {
      code: 'missing_helius_api_key',
    });
  }
  const secrets = secretsFromApiKey(apiKey);
  const url = buildHeliusMainnetRpcUrl(apiKey);
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const timeoutMs = options.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  const rpc = createJsonRpcClient({ url, fetchImpl, timeoutMs, secrets });

  return {
    async verifyMainnetIdentity() {
      const result = await rpc.call('getGenesisHash', []);
      if (typeof result !== 'string' || result.trim() === '') {
        throw new WalletIntelligenceError('Provider genesis hash was missing.', {
          code: 'provider_integrity_failure',
        });
      }
      if (result !== SOLANA_MAINNET_GENESIS_HASH) {
        throw new WalletIntelligenceError(
          'Connected RPC genesis hash is not official Solana mainnet-beta. Wallet intelligence refuses to continue.',
          { code: 'cluster_mismatch' },
        );
      }
      return { genesisHash: result };
    },

    async getMintAccount(tokenMint) {
      const result = await rpc.call('getAccountInfo', [
        tokenMint,
        { encoding: 'jsonParsed', commitment: 'finalized' },
      ]);
      return parseContextValue(result, 'getAccountInfo');
    },

    async getTokenLargestAccounts(tokenMint) {
      const result = await rpc.call('getTokenLargestAccounts', [tokenMint, { commitment: 'finalized' }]);
      const parsed = parseContextValue(result, 'getTokenLargestAccounts');
      if (!Array.isArray(parsed.value)) {
        throw new WalletIntelligenceError('getTokenLargestAccounts did not return an account array.', {
          code: 'provider_invalid_response',
        });
      }
      const accounts: LargestTokenAccount[] = parsed.value.map((item) => {
        if (!isRecord(item)) {
          throw new WalletIntelligenceError('getTokenLargestAccounts item is malformed.', {
            code: 'provider_invalid_response',
          });
        }
        const address = item['address'];
        const amount = item['amount'];
        const decimals = item['decimals'];
        if (typeof address !== 'string' || typeof amount !== 'string' || typeof decimals !== 'number') {
          throw new WalletIntelligenceError('getTokenLargestAccounts item is malformed.', {
            code: 'provider_invalid_response',
          });
        }
        return { address, amountRaw: amount, decimals };
      });
      return { contextSlot: parsed.contextSlot, accounts };
    },

    async getMultipleParsedAccounts(addresses, options) {
      const values: unknown[] = [];
      let contextSlot = 0;
      for (let offset = 0; offset < addresses.length; offset += GET_MULTIPLE_ACCOUNTS_CHUNK) {
        const chunk = addresses.slice(offset, offset + GET_MULTIPLE_ACCOUNTS_CHUNK);
        const result = await rpc.call('getMultipleAccounts', [
          chunk,
          {
            encoding: 'jsonParsed',
            commitment: 'finalized',
            minContextSlot: options.minContextSlot,
          },
        ]);
        const parsed = parseContextValue(result, 'getMultipleAccounts');
        if (!Array.isArray(parsed.value)) {
          throw new WalletIntelligenceError('getMultipleAccounts result length mismatch.', {
            code: 'provider_invalid_response',
          });
        }
        const rows: unknown[] = parsed.value;
        if (rows.length !== chunk.length) {
          throw new WalletIntelligenceError('getMultipleAccounts result length mismatch.', {
            code: 'provider_invalid_response',
          });
        }
        contextSlot = parsed.contextSlot;
        values.push(...rows);
      }
      return { contextSlot, values };
    },

    async getRecentWalletHistoryPage(request) {
      assertFullHistoryPageLimit(request.limit);
      const result = await rpc.call(HELIUS_RPC_METHOD_GET_TRANSACTIONS_FOR_ADDRESS, [
        request.walletAddress,
        {
          transactionDetails: 'full',
          encoding: 'jsonParsed',
          maxSupportedTransactionVersion: 0,
          sortOrder: 'desc',
          limit: request.limit,
          commitment: 'finalized',
          ...(request.paginationToken === null ? {} : { paginationToken: request.paginationToken }),
          filters: {
            status: 'succeeded',
            tokenAccounts: 'balanceChanged',
            blockTime: { gte: request.blockTimeGte, lte: request.blockTimeLte },
            slot: { lte: request.slotLte },
          },
        },
      ]);
      return parseTransactionsForAddressPage(result, request.limit, 'full');
    },

    async getFirstObservedActivity(request) {
      const result = await rpc.call(HELIUS_RPC_METHOD_GET_TRANSACTIONS_FOR_ADDRESS, [
        request.walletAddress,
        {
          transactionDetails: 'signatures',
          sortOrder: 'asc',
          limit: FIRST_OBSERVED_ACTIVITY_LIMIT,
          commitment: 'finalized',
          filters: {
            status: 'succeeded',
            tokenAccounts: 'balanceChanged',
            slot: { lte: request.slotLte },
          },
        },
      ]);
      const page = parseTransactionsForAddressPage(result, FIRST_OBSERVED_ACTIVITY_LIMIT, 'signatures');
      return page.transactions[0] ?? null;
    },
  };
}

function assertFullHistoryPageLimit(limit: number): void {
  if (limit > HISTORY_FULL_PAGE_LIMIT) {
    throw new WalletIntelligenceError(
      `Refusing a full-history request with limit ${String(limit)}. Maximum full-page limit is ${String(HISTORY_FULL_PAGE_LIMIT)}.`,
      { code: 'provider_integrity_failure' },
    );
  }
}

function parseContextValue(result: unknown, method: string): { contextSlot: number; value: unknown } {
  if (!isRecord(result) || !isRecord(result['context'])) {
    throw new WalletIntelligenceError(`${method} omitted context.`, { code: 'provider_invalid_response' });
  }
  return {
    contextSlot: parseSafeSlot(result['context']['slot'], `${method} context.slot`),
    value: result['value'],
  };
}

function parseTransactionsForAddressPage(
  result: unknown,
  maxItems: number,
  mode: 'full' | 'signatures',
): RecentHistoryPageResult {
  if (!isRecord(result) || !Array.isArray(result['data'])) {
    throw new WalletIntelligenceError('getTransactionsForAddress did not return a data array.', {
      code: 'provider_invalid_response',
    });
  }
  const data: unknown[] = result['data'];
  if (data.length > maxItems) {
    throw new WalletIntelligenceError('getTransactionsForAddress returned more rows than requested.', {
      code: 'provider_integrity_failure',
    });
  }
  const paginationToken = parseOptionalPaginationToken(result['paginationToken']);
  const transactions = data.map((item) =>
    mode === 'full' ? parseFullWalletHistoryTransaction(item) : parseSignatureHistoryTransaction(item),
  );
  return { transactions, paginationToken };
}

function parseOptionalPaginationToken(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new WalletIntelligenceError('Provider returned a malformed pagination token. Provider integrity failure.', {
      code: 'provider_integrity_failure',
    });
  }
  return value;
}

export function parseFullWalletHistoryTransaction(value: unknown): WalletHistoryTransaction {
  if (!isRecord(value)) {
    throw new WalletIntelligenceError('Wallet history item is malformed.', {
      code: 'provider_invalid_response',
    });
  }
  const slot = parseSafeSlot(value['slot'], 'wallet history slot');
  const blockTime =
    value['blockTime'] === null || value['blockTime'] === undefined
      ? null
      : parseSafeSlot(value['blockTime'], 'wallet history blockTime');
  const transaction = isRecord(value['transaction']) ? value['transaction'] : null;
  const rawSignatures = transaction === null ? undefined : transaction['signatures'];
  const signatures: unknown[] = Array.isArray(rawSignatures) ? rawSignatures : [];
  const signature = signatures[0];
  if (typeof signature !== 'string' || signature.trim() === '') {
    throw new WalletIntelligenceError('Wallet history item omitted a canonical first signature.', {
      code: 'provider_invalid_response',
    });
  }
  const meta = value['meta'];
  if (!isRecord(meta)) {
    throw new WalletIntelligenceError('Wallet history item omitted meta.', {
      code: 'provider_invalid_response',
    });
  }
  return {
    signature,
    slot,
    transactionIndex: parseTransactionIndex(value['transactionIndex'], 'wallet history transactionIndex'),
    blockTime,
    err: meta['err'] ?? null,
    preTokenBalances: parseBalanceArray(meta['preTokenBalances'], 'preTokenBalances'),
    postTokenBalances: parseBalanceArray(meta['postTokenBalances'], 'postTokenBalances'),
  };
}

export function parseSignatureHistoryTransaction(value: unknown): WalletHistoryTransaction {
  if (!isRecord(value)) {
    throw new WalletIntelligenceError('Wallet history item is malformed.', {
      code: 'provider_invalid_response',
    });
  }
  const signature = value['signature'];
  if (typeof signature !== 'string' || signature.trim() === '') {
    throw new WalletIntelligenceError('Wallet history item omitted a signature.', {
      code: 'provider_invalid_response',
    });
  }
  return {
    signature,
    slot: parseSafeSlot(value['slot'], 'wallet history slot'),
    transactionIndex: parseTransactionIndex(value['transactionIndex'], 'wallet history transactionIndex'),
    blockTime:
      value['blockTime'] === null || value['blockTime'] === undefined
        ? null
        : parseSafeSlot(value['blockTime'], 'wallet history blockTime'),
    err: value['err'] ?? null,
    preTokenBalances: [],
    postTokenBalances: [],
  };
}

function parseBalanceArray(value: unknown, field: string): WalletHistoryTransaction['preTokenBalances'] {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new WalletIntelligenceError(`Invalid ${field} array.`, { code: 'provider_invalid_response' });
  }
  return value.map((item, index) => parseTokenBalanceEvidence(item, `${field}[${String(index)}]`));
}

function createJsonRpcClient(options: {
  url: string;
  fetchImpl: WalletIntelligenceFetchLike;
  timeoutMs: number;
  secrets: readonly string[];
}): { call(method: string, params: unknown[]): Promise<unknown> } {
  return {
    async call(method, params) {
      let lastError: unknown;
      for (let attempt = 1; attempt <= PROVIDER_MAX_ATTEMPTS; attempt += 1) {
        try {
          return await onceJsonRpc({ ...options, method, params });
        } catch (error: unknown) {
          lastError = error;
          if (!isTransientProviderError(error) || attempt === PROVIDER_MAX_ATTEMPTS) {
            throw sanitizeThrown(error, options.secrets);
          }
        }
      }
      throw sanitizeThrown(lastError, options.secrets);
    },
  };
}

async function onceJsonRpc(options: {
  url: string;
  fetchImpl: WalletIntelligenceFetchLike;
  timeoutMs: number;
  secrets: readonly string[];
  method: string;
  params: unknown[];
}): Promise<unknown> {
  assertHeliusUrl(options.url);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs);
  let response: Awaited<ReturnType<WalletIntelligenceFetchLike>>;
  try {
    response = await options.fetchImpl(options.url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: options.method, params: options.params }),
      signal: controller.signal,
      redirect: 'error',
    });
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw new WalletIntelligenceError('Wallet intelligence provider request timed out.', {
        code: 'provider_timeout',
        cause: error,
      });
    }
    throw new WalletIntelligenceError('Wallet intelligence provider network request failed.', {
      code: 'provider_unavailable',
      cause: error,
    });
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    throw new WalletIntelligenceError('Wallet intelligence provider rate-limited the request.', {
      code: 'provider_rate_limited',
    });
  }
  if (response.status === 401 || response.status === 403) {
    throw new WalletIntelligenceError('Wallet intelligence provider rejected the request authentication.', {
      code: 'provider_auth_failed',
    });
  }
  if (response.status >= 500) {
    throw new WalletIntelligenceError('Wallet intelligence provider is unavailable.', {
      code: 'provider_unavailable',
    });
  }
  if (response.status !== 200) {
    throw new WalletIntelligenceError('Wallet intelligence provider returned an unexpected HTTP status.', {
      code: 'provider_invalid_response',
    });
  }

  const body = await readBoundedBody(response);
  try {
    return parseJsonRpcResult(JSON.parse(body) as unknown, options.method);
  } catch (error: unknown) {
    if (error instanceof WalletIntelligenceError) {
      throw error;
    }
    throw new WalletIntelligenceError('Wallet intelligence provider returned a non-JSON body.', {
      code: 'provider_invalid_response',
      cause: error,
    });
  }
}

async function readBoundedBody(
  response: Awaited<ReturnType<WalletIntelligenceFetchLike>>,
): Promise<string> {
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > PROVIDER_MAX_RESPONSE_BYTES) {
    throw new WalletIntelligenceError('Wallet intelligence provider response exceeded the size bound.', {
      code: 'provider_invalid_response',
    });
  }
  return new TextDecoder().decode(buffer);
}

function assertHeliusUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== HELIUS_MAINNET_RPC_HOST) {
    throw new WalletIntelligenceError('Refusing a wallet-intelligence request that is not the code-defined Helius mainnet RPC host.', {
      code: 'provider_invalid_response',
    });
  }
}

function isTransientProviderError(error: unknown): boolean {
  return (
    error instanceof WalletIntelligenceError &&
    (error.code === 'provider_rate_limited' ||
      error.code === 'provider_unavailable' ||
      error.code === 'provider_timeout')
  );
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === 'AbortError') ||
    (error instanceof DOMException && error.name === 'AbortError')
  );
}

function sanitizeThrown(error: unknown, secrets: readonly string[]): WalletIntelligenceError {
  const message = formatWalletIntelligenceError(error, secrets);
  const code = error instanceof WalletIntelligenceError ? error.code : 'provider_unavailable';
  return new WalletIntelligenceError(message, { code });
}

async function defaultFetch(
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
    redirect: 'error';
  },
): ReturnType<WalletIntelligenceFetchLike> {
  const response = await fetch(url, init);
  return {
    status: response.status,
    headers: response.headers,
    arrayBuffer: () => response.arrayBuffer(),
  };
}
