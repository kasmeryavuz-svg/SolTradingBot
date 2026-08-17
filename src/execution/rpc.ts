import {
  createSolanaRpc,
  type Base64EncodedWireTransaction,
  type TransactionMessageBytesBase64,
} from '@solana/kit';
import { sanitizeErrorText } from '../utils/sanitize-rpc-url.js';
import {
  COMPUTE_UNITS_CONSUMED_MAX,
  EXECUTION_MAX_SIMULATION_LOG_CHARS,
  EXECUTION_MAX_SIMULATION_LOGS,
} from './constants.js';
import { ExecutionError } from './errors.js';
import type { ExecutionRpc, ExecutionSimulationEvidence } from './types.js';

export function createExecutionRpc(rpcUrl: string, timeoutMs: number): ExecutionRpc {
  const rpc = createSolanaRpc(rpcUrl);

  return {
    async getGenesisHash(signal) {
      try {
        return await rpc.getGenesisHash().send(signal === undefined ? {} : { abortSignal: signal });
      } catch (error: unknown) {
        throw mapRpcError(error, timeoutMs, 'genesis hash');
      }
    },

    async getBlockHeight(signal) {
      try {
        return await rpc
          .getBlockHeight({ commitment: 'confirmed' })
          .send(signal === undefined ? {} : { abortSignal: signal });
      } catch (error: unknown) {
        throw mapRpcError(error, timeoutMs, 'block height');
      }
    },

    async simulateTransaction(wireTransactionBase64, options) {
      try {
        const result = await rpc
          .simulateTransaction(wireTransactionBase64 as Base64EncodedWireTransaction, {
            encoding: 'base64',
            commitment: 'confirmed',
            replaceRecentBlockhash: options.replaceRecentBlockhash,
            sigVerify: false,
          })
          .send(options.signal === undefined ? {} : { abortSignal: options.signal });
        return normalizeSimulationResult(result.value);
      } catch (error: unknown) {
        if (isTimeout(error)) {
          return {
            ok: false,
            unitsConsumed: null,
            errorSummary: `Solana simulation timed out after ${String(timeoutMs)}ms.`,
            logs: [],
            failureKind: 'timeout',
          };
        }
        throw mapRpcError(error, timeoutMs, 'simulation');
      }
    },

    async getFeeForMessage(messageBase64, signal) {
      try {
        const result = await rpc
          .getFeeForMessage(messageBase64 as TransactionMessageBytesBase64, { commitment: 'confirmed' })
          .send(signal === undefined ? {} : { abortSignal: signal });
        const value = result.value;
        if (value === null) {
          return null;
        }
        return BigInt(value);
      } catch (error: unknown) {
        if (isTimeout(error)) {
          return null;
        }
        const message = sanitizeErrorText(error instanceof Error ? error.message : '');
        if (/unavailable|fetch failed|econnrefused|enotfound/i.test(message)) {
          return null;
        }
        throw mapRpcError(error, timeoutMs, 'fee estimate');
      }
    },
  };
}

export function normalizeSimulationResult(value: {
  err: unknown;
  unitsConsumed?: bigint | number | string;
  logs?: readonly string[] | null;
}): ExecutionSimulationEvidence {
  const logs = boundLogs(value.logs ?? []);
  if (value.err !== null && value.err !== undefined) {
    const summary = summarizeSimulationError(value.err);
    return {
      ok: false,
      unitsConsumed: normalizeUnitsConsumed(value.unitsConsumed).units,
      errorSummary: summary.message,
      logs,
      failureKind: summary.kind,
    };
  }
  const units = normalizeUnitsConsumed(value.unitsConsumed);
  if (units.kind === 'missing') {
    return {
      ok: false,
      unitsConsumed: null,
      errorSummary: 'Simulation returned no consumed compute units.',
      logs,
      failureKind: 'null_units',
    };
  }
  if (units.kind === 'invalid') {
    return {
      ok: false,
      unitsConsumed: null,
      errorSummary: 'Simulation returned an invalid consumed compute-unit value.',
      logs,
      failureKind: 'null_units',
    };
  }
  if (units.units === 0n) {
    return {
      ok: false,
      unitsConsumed: 0n,
      errorSummary: 'Simulation returned zero consumed compute units.',
      logs,
      failureKind: 'zero_units',
    };
  }
  return {
    ok: true,
    unitsConsumed: units.units,
    errorSummary: null,
    logs,
    failureKind: 'none',
  };
}

function normalizeUnitsConsumed(value: unknown):
  | { kind: 'ok'; units: bigint }
  | { kind: 'missing'; units: null }
  | { kind: 'invalid'; units: null } {
  if (value === undefined || value === null) {
    return { kind: 'missing', units: null };
  }
  if (typeof value === 'bigint') {
    if (value < 0n || value > COMPUTE_UNITS_CONSUMED_MAX) {
      return { kind: 'invalid', units: null };
    }
    return { kind: 'ok', units: value };
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || !Number.isSafeInteger(value) || value < 0) {
      return { kind: 'invalid', units: null };
    }
    return { kind: 'ok', units: BigInt(value) };
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    try {
      const parsed = BigInt(value);
      if (parsed > COMPUTE_UNITS_CONSUMED_MAX) {
        return { kind: 'invalid', units: null };
      }
      return { kind: 'ok', units: parsed };
    } catch {
      return { kind: 'invalid', units: null };
    }
  }
  return { kind: 'invalid', units: null };
}

function boundLogs(logs: readonly string[]): string[] {
  return logs.slice(0, EXECUTION_MAX_SIMULATION_LOGS).map((line) =>
    line.length <= EXECUTION_MAX_SIMULATION_LOG_CHARS
      ? line
      : `${line.slice(0, EXECUTION_MAX_SIMULATION_LOG_CHARS)}…`,
  );
}

function summarizeSimulationError(error: unknown): {
  message: string;
  kind: ExecutionSimulationEvidence['failureKind'];
} {
  const text = sanitizeErrorText(typeof error === 'string' ? error : JSON.stringify(error)).slice(0, 240);
  if (/insufficient funds|insufficient lamports/i.test(text)) {
    return { message: 'Simulation failed because the public taker lacks funds.', kind: 'insufficient_funds' };
  }
  if (/blockhash|block height/i.test(text)) {
    return { message: 'Simulation failed because the blockhash is no longer valid.', kind: 'expired_blockhash' };
  }
  if (/account not found|could not find account/i.test(text)) {
    return { message: 'Simulation failed because an account was not found.', kind: 'account_not_found' };
  }
  return { message: `Simulation failed: ${text}`, kind: 'program_error' };
}

function mapRpcError(error: unknown, timeoutMs: number, operation: string): ExecutionError {
  if (error instanceof ExecutionError) {
    return error;
  }
  if (isTimeout(error)) {
    return new ExecutionError(`Solana ${operation} timed out after ${String(timeoutMs)}ms.`, {
      code: 'provider_unavailable',
    });
  }
  const message = sanitizeErrorText(error instanceof Error ? error.message : `Solana ${operation} failed.`);
  if (/429|too many requests/i.test(message)) {
    return new ExecutionError('Solana RPC rate-limited the request.', { code: 'provider_rate_limited' });
  }
  if (/fetch failed|econnrefused|enotfound|network|socket|econnreset|undici/i.test(message)) {
    return new ExecutionError('Solana RPC is unavailable.', { code: 'provider_unavailable' });
  }
  return new ExecutionError(`Solana ${operation} failed.`, { code: 'provider_unavailable' });
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}
