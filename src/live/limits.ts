import { isBlockhashExpired } from '../execution/fee.js';
import type { ExecutionFeeEvidence } from '../execution/types.js';
import {
  LIVE_MAX_BROADCAST_ATTEMPTS_PER_UTC_DAY,
  LIVE_MAX_BROADCAST_INPUT_LAMPORTS_PER_UTC_DAY,
  LIVE_MAX_PRIORITY_COMPONENT_LAMPORTS,
  LIVE_MAX_RPC_TRANSACTION_FEE_LAMPORTS,
  LIVE_MIN_BLOCKHEIGHT_HEADROOM_BEFORE_CONFIRM,
  LIVE_MIN_BLOCKHEIGHT_HEADROOM_BEFORE_SEND,
  LIVE_MIN_SOL_BALANCE_BEFORE_LAMPORTS,
} from './constants.js';
import { LiveError } from './errors.js';
import type { LiveDailyUsage } from './types.js';

const MS_PER_UTC_DAY = 86_400_000;

export function utcDayStartMs(ms: number): number {
  if (!Number.isInteger(ms) || ms < 0) {
    throw new LiveError('UTC day calculations require a non-negative integer millisecond timestamp.', {
      code: 'live_operation_failed',
    });
  }
  return Math.floor(ms / MS_PER_UTC_DAY) * MS_PER_UTC_DAY;
}

export function utcDayEndMs(ms: number): number {
  return utcDayStartMs(ms) + MS_PER_UTC_DAY;
}

export function utcDayKey(ms: number): string {
  return new Date(utcDayStartMs(ms)).toISOString().slice(0, 10);
}

export function remainingBlockHeightHeadroom(
  currentHeight: bigint,
  lastValidBlockHeight: bigint,
): bigint {
  if (currentHeight > lastValidBlockHeight) {
    return 0n;
  }
  return lastValidBlockHeight - currentHeight;
}

export function assertLiveFeeCaps(fees: ExecutionFeeEvidence | null): ExecutionFeeEvidence {
  if (fees === null) {
    throw new LiveError('l16_v1 refuses to send when RPC fee evidence is missing.', {
      code: 'rpc_fee_unavailable',
    });
  }
  if (fees.calculatedPriorityFeeComponentLamports > LIVE_MAX_PRIORITY_COMPONENT_LAMPORTS) {
    throw new LiveError(
      `l16_v1 refuses a calculated priority component above ${LIVE_MAX_PRIORITY_COMPONENT_LAMPORTS.toString()} lamports.`,
      { code: 'priority_fee_over_cap' },
    );
  }
  if (fees.rpcEstimatedTransactionFeeLamports === null) {
    throw new LiveError('l16_v1 refuses to send when the RPC transaction-fee estimate is unavailable.', {
      code: 'rpc_fee_unavailable',
    });
  }
  if (fees.rpcEstimatedTransactionFeeLamports > LIVE_MAX_RPC_TRANSACTION_FEE_LAMPORTS) {
    throw new LiveError(
      `l16_v1 refuses an RPC transaction-fee estimate above ${LIVE_MAX_RPC_TRANSACTION_FEE_LAMPORTS.toString()} lamports.`,
      { code: 'rpc_fee_over_cap' },
    );
  }
  return fees;
}

export function assertLiveBalance(input: {
  balanceLamports: bigint;
  amountLamports: bigint;
  rpcFeeLamports: bigint;
}): void {
  if (input.balanceLamports < LIVE_MIN_SOL_BALANCE_BEFORE_LAMPORTS) {
    throw new LiveError(
      `l16_v1 requires a taker SOL balance of at least ${LIVE_MIN_SOL_BALANCE_BEFORE_LAMPORTS.toString()} lamports before a live attempt.`,
      { code: 'low_sol_balance' },
    );
  }
  if (input.balanceLamports <= input.amountLamports + input.rpcFeeLamports) {
    throw new LiveError(
      'l16_v1 refuses when taker SOL balance is not conservatively greater than input amount plus the RPC fee estimate.',
      { code: 'low_sol_balance' },
    );
  }
}

export function assertLiveHeadroom(input: {
  currentHeight: bigint;
  lastValidBlockHeight: bigint;
  minimum: bigint;
}): bigint {
  if (isBlockhashExpired(input.currentHeight, input.lastValidBlockHeight)) {
    throw new LiveError('The e14 blockhash is already expired. Re-run from the start. l16 does not rebuild.', {
      code: 'stale_live_candidate',
    });
  }
  const remaining = remainingBlockHeightHeadroom(input.currentHeight, input.lastValidBlockHeight);
  if (remaining < input.minimum) {
    throw new LiveError(
      `stale_live_candidate: l16_v1 requires at least ${input.minimum.toString()} remaining block-height headroom. Observed ${remaining.toString()}. Re-run from the start.`,
      { code: 'stale_live_candidate' },
    );
  }
  return remaining;
}

export function assertHeadroomBeforeConfirm(
  currentHeight: bigint,
  lastValidBlockHeight: bigint,
): bigint {
  return assertLiveHeadroom({
    currentHeight,
    lastValidBlockHeight,
    minimum: LIVE_MIN_BLOCKHEIGHT_HEADROOM_BEFORE_CONFIRM,
  });
}

export function assertHeadroomBeforeSend(
  currentHeight: bigint,
  lastValidBlockHeight: bigint,
): bigint {
  return assertLiveHeadroom({
    currentHeight,
    lastValidBlockHeight,
    minimum: LIVE_MIN_BLOCKHEIGHT_HEADROOM_BEFORE_SEND,
  });
}

export function assertDailyCaps(usage: LiveDailyUsage, nextAmountLamports: bigint): void {
  if (usage.attemptCount >= LIVE_MAX_BROADCAST_ATTEMPTS_PER_UTC_DAY) {
    throw new LiveError(
      `l16_v1 allows at most ${String(LIVE_MAX_BROADCAST_ATTEMPTS_PER_UTC_DAY)} broadcast-at-risk attempts per UTC day.`,
      { code: 'daily_attempt_cap' },
    );
  }
  if (usage.inputLamports + nextAmountLamports > LIVE_MAX_BROADCAST_INPUT_LAMPORTS_PER_UTC_DAY) {
    throw new LiveError(
      `l16_v1 allows at most ${LIVE_MAX_BROADCAST_INPUT_LAMPORTS_PER_UTC_DAY.toString()} lamports of broadcast-at-risk input per UTC day.`,
      { code: 'daily_input_cap' },
    );
  }
}
