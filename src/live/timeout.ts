import { LiveError } from './errors.js';
import type { LiveErrorCode } from './errors.js';

export function raceTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  createError: () => Error,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = promise.then(
    (value) => value,
    (error: unknown) => {
      throw error;
    },
  );
  pending.catch(() => undefined);

  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      reject(createError());
    }, timeoutMs);
    pending.then(
      (value) => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        resolve(value);
      },
      (error: unknown) => {
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        reject(error instanceof Error ? error : new Error('Timed live RPC request failed.'));
      },
    );
  });
}

export function liveRequestTimeoutError(operation: string, timeoutMs: number): LiveError {
  return new LiveError(`Solana ${operation} timed out after ${String(timeoutMs)}ms.`, {
    code: 'provider_unavailable',
  });
}

export function liveSendTimeoutError(timeoutMs: number): LiveError {
  return new LiveError(`Solana sendTransaction timed out after ${String(timeoutMs)}ms.`, {
    code: 'broadcast_outcome_unknown',
  });
}

export async function withLiveRequestTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
  code: LiveErrorCode = 'provider_unavailable',
): Promise<T> {
  return raceTimeout(promise, timeoutMs, () => {
    if (code === 'broadcast_outcome_unknown') {
      return liveSendTimeoutError(timeoutMs);
    }
    return liveRequestTimeoutError(operation, timeoutMs);
  });
}
