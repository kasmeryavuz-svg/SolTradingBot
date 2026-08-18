import { isBlockhashExpired } from '../execution/fee.js';
import {
  LIVE_CONFIRMATION_POLL_INTERVAL_MS,
  LIVE_CONFIRMATION_TIMEOUT_MS,
  LIVE_RPC_REQUEST_TIMEOUT_MS,
  LIVE_TRACKER_SEARCH_TRANSACTION_HISTORY,
} from './constants.js';
import { withLiveRequestTimeout } from './timeout.js';
import type {
  LiveAttemptStatus,
  LiveClock,
  LiveConfirmationLevel,
  LiveConfirmationRpc,
  LiveSignatureStatus,
} from './types.js';

export type TrackerOutcome = {
  readonly status: LiveAttemptStatus;
  readonly confirmationStatus: LiveConfirmationLevel | null;
  readonly slot: string | null;
  readonly err: unknown;
  readonly message: string;
};

export const DEFAULT_LIVE_CLOCK: LiveClock = {
  nowMs: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export async function trackExpectedSignature(input: {
  rpc: LiveConfirmationRpc;
  expectedSignature: string;
  lastValidBlockHeight: bigint;
  searchTransactionHistory?: boolean;
  intervalMs?: number;
  timeoutMs?: number;
  requestTimeoutMs?: number;
  clock?: LiveClock;
  signal?: AbortSignal;
}): Promise<TrackerOutcome> {
  const clock = input.clock ?? DEFAULT_LIVE_CLOCK;
  const intervalMs = input.intervalMs ?? LIVE_CONFIRMATION_POLL_INTERVAL_MS;
  const timeoutMs = input.timeoutMs ?? LIVE_CONFIRMATION_TIMEOUT_MS;
  const requestTimeoutMs = input.requestTimeoutMs ?? LIVE_RPC_REQUEST_TIMEOUT_MS;
  const search = input.searchTransactionHistory ?? LIVE_TRACKER_SEARCH_TRANSACTION_HISTORY;
  const deadline = clock.nowMs() + timeoutMs;

  while (clock.nowMs() < deadline) {
    if (input.signal?.aborted === true) {
      return pendingOutcome(null, 'Confirmation tracking was aborted. Use live:reconcile. Do not resend.');
    }
    const remaining = deadline - clock.nowMs();
    const observed = await readStatus(
      input.rpc,
      input.expectedSignature,
      search,
      Math.min(requestTimeoutMs, Math.max(1, remaining)),
      input.signal,
    );
    const terminal = classifyObservedStatus(observed);
    if (terminal !== null) {
      return terminal;
    }
    const sleepFor = Math.min(intervalMs, deadline - clock.nowMs());
    if (sleepFor <= 0) {
      break;
    }
    await clock.sleep(sleepFor);
  }

  const last = await readStatus(
    input.rpc,
    input.expectedSignature,
    search,
    requestTimeoutMs,
    input.signal,
  );
  const terminal = classifyObservedStatus(last);
  if (terminal !== null) {
    return terminal;
  }

  let currentHeight: bigint;
  try {
    currentHeight = await withLiveRequestTimeout(
      input.rpc.getBlockHeight(input.signal),
      requestTimeoutMs,
      'block height',
    );
  } catch {
    return pendingOutcome(
      last,
      'Confirmation timed out and block height could not be rechecked. Use live:reconcile. Do not resend.',
    );
  }

  if (!isBlockhashExpired(currentHeight, input.lastValidBlockHeight)) {
    return pendingOutcome(
      last,
      'Confirmation was not reached within 30 seconds while the blockhash is still valid. Use live:reconcile. Do not resend.',
    );
  }

  if (last === null) {
    return {
      status: 'expired_unconfirmed',
      confirmationStatus: null,
      slot: null,
      err: null,
      message:
        'The blockhash expired and the expected signature was never observed. This is unresolved, not proof of an unsent transaction.',
    };
  }

  return {
    status: 'expired_after_submission',
    confirmationStatus: last.confirmationStatus,
    slot: last.slot,
    err: last.err,
    message:
      'The blockhash expired after the expected signature was observed but before confirmed/finalized. Use live:reconcile. Do not resend.',
  };
}

export function classifyObservedStatus(status: LiveSignatureStatus | null): TrackerOutcome | null {
  if (status === null) {
    return null;
  }
  if (status.err !== null && status.err !== undefined) {
    return {
      status: 'failed_on_chain',
      confirmationStatus: status.confirmationStatus,
      slot: status.slot,
      err: status.err,
      message:
        'The expected transaction landed with a program or runtime error. A failed transaction may still charge a fee.',
    };
  }
  if (status.confirmationStatus === 'finalized') {
    return {
      status: 'finalized',
      confirmationStatus: 'finalized',
      slot: status.slot,
      err: null,
      message: 'The expected transaction is finalized with err=null.',
    };
  }
  if (status.confirmationStatus === 'confirmed') {
    return {
      status: 'confirmed',
      confirmationStatus: 'confirmed',
      slot: status.slot,
      err: null,
      message: 'The expected transaction is confirmed with err=null. This is not a profit result.',
    };
  }
  return null;
}

function pendingOutcome(last: LiveSignatureStatus | null, message: string): TrackerOutcome {
  return {
    status: 'broadcast_pending',
    confirmationStatus: last?.confirmationStatus ?? null,
    slot: last?.slot ?? null,
    err: last?.err ?? null,
    message,
  };
}

async function readStatus(
  rpc: LiveConfirmationRpc,
  expectedSignature: string,
  searchTransactionHistory: boolean,
  requestTimeoutMs: number,
  signal?: AbortSignal,
): Promise<LiveSignatureStatus | null> {
  try {
    const values = await withLiveRequestTimeout(
      rpc.getSignatureStatuses([expectedSignature], {
        searchTransactionHistory,
        ...(signal === undefined ? {} : { signal }),
      }),
      requestTimeoutMs,
      'signature statuses',
    );
    return values[0] ?? null;
  } catch {
    return null;
  }
}
