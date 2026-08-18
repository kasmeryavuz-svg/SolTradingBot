import {
  address,
  createSolanaRpc,
  type Base64EncodedWireTransaction,
  type Signature,
} from '@solana/kit';
import { U64_MAX } from '../execution/constants.js';
import { sanitizeErrorText } from '../utils/sanitize-rpc-url.js';
import {
  LIVE_BALANCE_COMMITMENT,
  LIVE_BLOCK_HEIGHT_COMMITMENT,
  LIVE_GET_TRANSACTION_COMMITMENT,
  LIVE_GET_TRANSACTION_ENCODING,
  LIVE_GET_TRANSACTION_MAX_SUPPORTED_VERSION,
  LIVE_MAX_RETRIES,
  LIVE_PREFLIGHT_COMMITMENT,
  LIVE_RPC_REQUEST_TIMEOUT_MS,
  LIVE_SEND_ENCODING,
  LIVE_SEND_TIMEOUT_MS,
  LIVE_SKIP_PREFLIGHT,
} from './constants.js';
import { LiveError } from './errors.js';
import { firstSignatureFromWireBase64 } from './signature.js';
import { withLiveRequestTimeout } from './timeout.js';
import type {
  LiveRpc,
  LiveSendTransactionConfig,
  LiveSignatureStatus,
  LiveTokenBalance,
  LiveTransactionReceipt,
} from './types.js';

export const LIVE_SEND_TRANSACTION_CONFIG: LiveSendTransactionConfig = {
  encoding: LIVE_SEND_ENCODING,
  skipPreflight: LIVE_SKIP_PREFLIGHT,
  preflightCommitment: LIVE_PREFLIGHT_COMMITMENT,
  maxRetries: LIVE_MAX_RETRIES,
};

export function createLiveRpc(rpcUrl: string, timeoutMs: number): LiveRpc {
  const rpc = createSolanaRpc(rpcUrl);
  const readTimeoutMs = Math.min(timeoutMs, LIVE_RPC_REQUEST_TIMEOUT_MS);

  return {
    async getGenesisHash(signal) {
      try {
        return await withLiveRequestTimeout(
          rpc.getGenesisHash().send(sendOptions(signal)),
          readTimeoutMs,
          'genesis hash',
        );
      } catch (error: unknown) {
        throw mapLiveRpcError(error, readTimeoutMs, 'genesis hash');
      }
    },

    async getBlockHeight(signal) {
      try {
        const height = await withLiveRequestTimeout(
          rpc.getBlockHeight({ commitment: LIVE_BLOCK_HEIGHT_COMMITMENT }).send(sendOptions(signal)),
          readTimeoutMs,
          'block height',
        );
        return requireU64('block height', height);
      } catch (error: unknown) {
        throw mapLiveRpcError(error, readTimeoutMs, 'block height');
      }
    },

    async getBalance(pubkey, signal) {
      try {
        const result = await withLiveRequestTimeout(
          rpc.getBalance(address(pubkey), { commitment: LIVE_BALANCE_COMMITMENT }).send(sendOptions(signal)),
          readTimeoutMs,
          'balance',
        );
        return requireU64('balance', result.value);
      } catch (error: unknown) {
        throw mapLiveRpcError(error, readTimeoutMs, 'balance');
      }
    },

    async sendTransaction(wireTransactionBase64, signal) {
      try {
        return await withLiveRequestTimeout(
          rpc
            .sendTransaction(wireTransactionBase64 as Base64EncodedWireTransaction, {
              encoding: LIVE_SEND_TRANSACTION_CONFIG.encoding,
              skipPreflight: LIVE_SEND_TRANSACTION_CONFIG.skipPreflight,
              preflightCommitment: LIVE_SEND_TRANSACTION_CONFIG.preflightCommitment,
              maxRetries: BigInt(LIVE_SEND_TRANSACTION_CONFIG.maxRetries),
            })
            .send(sendOptions(signal)),
          LIVE_SEND_TIMEOUT_MS,
          'sendTransaction',
          'broadcast_outcome_unknown',
        );
      } catch (error: unknown) {
        throw mapSendError(error, LIVE_SEND_TIMEOUT_MS);
      }
    },

    async getSignatureStatuses(signatures, options = {}) {
      try {
        const result = await withLiveRequestTimeout(
          rpc
            .getSignatureStatuses(signatures as Signature[], {
              searchTransactionHistory: options.searchTransactionHistory === true,
            })
            .send(sendOptions(options.signal)),
          readTimeoutMs,
          'signature statuses',
        );
        return result.value.map(normalizeSignatureStatus);
      } catch (error: unknown) {
        throw mapLiveRpcError(error, readTimeoutMs, 'signature statuses');
      }
    },

    async getTransaction(signature, options = {}) {
      try {
        const result = await withLiveRequestTimeout(
          rpc
            .getTransaction(signature as Signature, {
              encoding: LIVE_GET_TRANSACTION_ENCODING,
              commitment: options.commitment ?? LIVE_GET_TRANSACTION_COMMITMENT,
              maxSupportedTransactionVersion: LIVE_GET_TRANSACTION_MAX_SUPPORTED_VERSION,
            })
            .send(sendOptions(options.signal)),
          readTimeoutMs,
          'transaction',
        );
        if (result === null) {
          return null;
        }
        return normalizeTransactionReceipt(result);
      } catch (error: unknown) {
        throw mapLiveRpcError(error, readTimeoutMs, 'transaction');
      }
    },
  };
}

function sendOptions(signal?: AbortSignal): { abortSignal?: AbortSignal } {
  return signal === undefined ? {} : { abortSignal: signal };
}

function requireU64(label: string, value: unknown): bigint {
  if (typeof value === 'bigint') {
    if (value < 0n || value > U64_MAX) {
      throw new LiveError(`Solana ${label} is outside the u64 range.`, { code: 'provider_unavailable' });
    }
    return value;
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    const parsed = BigInt(value);
    if (parsed > U64_MAX) {
      throw new LiveError(`Solana ${label} is outside the u64 range.`, { code: 'provider_unavailable' });
    }
    return parsed;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = BigInt(value);
    if (parsed > U64_MAX) {
      throw new LiveError(`Solana ${label} is outside the u64 range.`, { code: 'provider_unavailable' });
    }
    return parsed;
  }
  throw new LiveError(`Solana ${label} was malformed.`, { code: 'provider_unavailable' });
}

function normalizeSignatureStatus(value: unknown): LiveSignatureStatus | null {
  if (value === null || value === undefined || typeof value !== 'object') {
    return null;
  }
  const record = value as {
    slot?: bigint | number | string;
    err?: unknown;
    confirmationStatus?: string | null;
  };
  const confirmation = record.confirmationStatus;
  return {
    slot: record.slot === undefined ? '0' : String(record.slot),
    err: record.err ?? null,
    confirmationStatus:
      confirmation === 'processed' || confirmation === 'confirmed' || confirmation === 'finalized'
        ? confirmation
        : null,
  };
}

function normalizeTransactionReceipt(value: unknown): LiveTransactionReceipt {
  const record = asRecord(value);
  const meta = asRecord(record['meta']);
  const transaction = record['transaction'];
  const transactionBase64 = extractBase64Transaction(transaction);
  return {
    slot: stringifyPublicSlot(record['slot']),
    err: meta['err'] ?? null,
    feeLamports: parseFee(meta['fee']),
    transactionBase64,
    firstSignature: transactionBase64 === null ? null : firstSignatureFromWireBase64(transactionBase64),
    preTokenBalances: readTokenBalances(meta['preTokenBalances']),
    postTokenBalances: readTokenBalances(meta['postTokenBalances']),
  };
}

function extractBase64Transaction(transaction: unknown): string | null {
  if (Array.isArray(transaction) && typeof transaction[0] === 'string' && transaction[1] === 'base64') {
    return transaction[0];
  }
  if (transaction !== null && typeof transaction === 'object') {
    const record = transaction as { data?: unknown };
    if (Array.isArray(record.data) && typeof record.data[0] === 'string' && record.data[1] === 'base64') {
      return record.data[0];
    }
  }
  return null;
}

function readTokenBalances(value: unknown): LiveTokenBalance[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const balances: LiveTokenBalance[] = [];
  for (const item of value) {
    const record = asRecord(item);
    const mint = record['mint'];
    const amount = asRecord(record['uiTokenAmount'])['amount'];
    if (typeof mint !== 'string' || typeof amount !== 'string') {
      continue;
    }
    const owner = record['owner'];
    const accountIndex = record['accountIndex'];
    balances.push({
      mint,
      owner: typeof owner === 'string' ? owner : null,
      amountRaw: amount,
      accountIndex:
        typeof accountIndex === 'number' && Number.isInteger(accountIndex) && accountIndex >= 0
          ? accountIndex
          : typeof accountIndex === 'bigint' && accountIndex >= 0n
            ? Number(accountIndex)
            : null,
    });
  }
  return balances;
}

function stringifyPublicSlot(value: unknown): string {
  if (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'string') {
    return value.toString();
  }
  return '0';
}

function parseFee(value: unknown): bigint | null {
  if (typeof value === 'bigint') {
    return value >= 0n ? value : null;
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mapSendError(error: unknown, timeoutMs: number): LiveError {
  if (error instanceof LiveError) {
    return error;
  }
  if (isTimeout(error)) {
    return new LiveError(`Solana sendTransaction timed out after ${String(timeoutMs)}ms.`, {
      code: 'broadcast_outcome_unknown',
    });
  }
  const message = sanitizeErrorText(error instanceof Error ? error.message : 'Solana sendTransaction failed.');
  if (/preflight|simulation|blockhash not found|invalid|transaction signature verification/i.test(message)) {
    return new LiveError('Solana RPC rejected the transaction during preflight.', {
      code: 'broadcast_rejected',
    });
  }
  if (/429|too many requests/i.test(message)) {
    return new LiveError('Solana RPC rate-limited sendTransaction. Treat as ambiguous; do not resend.', {
      code: 'broadcast_outcome_unknown',
    });
  }
  if (/500|502|503|504|fetch failed|econnrefused|econnreset|enotfound|network|socket|undici/i.test(message)) {
    return new LiveError('Solana sendTransaction ended ambiguously. The node may have accepted the bytes.', {
      code: 'broadcast_outcome_unknown',
    });
  }
  return new LiveError('Solana sendTransaction ended ambiguously. The node may have accepted the bytes.', {
    code: 'broadcast_outcome_unknown',
  });
}

function mapLiveRpcError(error: unknown, timeoutMs: number, operation: string): LiveError {
  if (error instanceof LiveError) {
    return error;
  }
  if (isTimeout(error)) {
    return new LiveError(`Solana ${operation} timed out after ${String(timeoutMs)}ms.`, {
      code: 'provider_unavailable',
    });
  }
  const message = sanitizeErrorText(error instanceof Error ? error.message : `Solana ${operation} failed.`);
  if (/429|too many requests/i.test(message)) {
    return new LiveError('Solana RPC rate-limited the request.', { code: 'provider_unavailable' });
  }
  return new LiveError(`Solana ${operation} failed.`, { code: 'provider_unavailable' });
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError' || error instanceof LiveError && (error.code === 'provider_unavailable' || error.code === 'broadcast_outcome_unknown') && /timed out/i.test(error.message));
}
