import { secondsBetween } from '../features/numbers.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { OUTCOME_MAX_DELAY_SECONDS } from './constants.js';
import { outcomeWindow, selectOutcomeSnapshot } from './timeline.js';
import {
  BacktestError,
  type BacktestEvent,
  type BacktestOutcome,
  type ResolvedBacktestOutcome,
} from './types.js';

export function grossForwardReturnPct(referencePriceUsd: number, outcomePriceUsd: number): number {
  const value = ((outcomePriceUsd - referencePriceUsd) / referencePriceUsd) * 100;
  if (!Number.isFinite(value)) {
    throw new BacktestError('grossForwardReturnPct is not finite.');
  }
  return value;
}

export function resolveCandidateOutcome(
  event: Pick<BacktestEvent, 'tokenMint' | 'pairAddress' | 'asOf'>,
  referencePriceUsd: number,
  snapshots: readonly MarketSnapshot[],
): BacktestOutcome {
  if (typeof referencePriceUsd !== 'number' || !Number.isFinite(referencePriceUsd) || referencePriceUsd <= 0) {
    throw new BacktestError('ENTRY_CANDIDATE reference price must be a finite value greater than 0.');
  }

  const window = outcomeWindow(event.asOf);
  const selected = selectOutcomeSnapshot(
    event.tokenMint,
    event.pairAddress,
    window.targetAt,
    window.windowEndAt,
    snapshots,
  );

  if (selected === null) {
    return {
      status: 'unavailable',
      targetAt: window.targetAt,
      windowEndAt: window.windowEndAt,
      referencePriceUsd,
      reason: 'no_same_pair_snapshot_in_outcome_window',
    };
  }

  const outcomePriceUsd = selected.priceUsd;
  if (typeof outcomePriceUsd !== 'number' || !Number.isFinite(outcomePriceUsd) || outcomePriceUsd <= 0) {
    return {
      status: 'unavailable',
      targetAt: window.targetAt,
      windowEndAt: window.windowEndAt,
      referencePriceUsd,
      reason: 'outcome_price_unavailable',
    };
  }

  const actualHorizonSeconds = secondsBetween(selected.collectedAt, event.asOf, 'actualHorizonSeconds');
  const outcomeDelaySeconds = secondsBetween(selected.collectedAt, window.targetAt, 'outcomeDelaySeconds');
  if (actualHorizonSeconds < 900 || outcomeDelaySeconds < 0 || outcomeDelaySeconds > OUTCOME_MAX_DELAY_SECONDS) {
    throw new BacktestError('Resolved outcome is outside the b08_v1 horizon window.');
  }

  return {
    status: 'resolved',
    targetAt: window.targetAt,
    windowEndAt: window.windowEndAt,
    outcomeCollectedAt: selected.collectedAt,
    referencePriceUsd,
    outcomePriceUsd,
    actualHorizonSeconds,
    outcomeDelaySeconds,
    grossForwardReturnPct: grossForwardReturnPct(referencePriceUsd, outcomePriceUsd),
  };
}

export function assertResolvedOutcomeInvariants(
  event: Pick<BacktestEvent, 'tokenMint' | 'pairAddress' | 'asOf' | 'strategyDecision'>,
  outcome: ResolvedBacktestOutcome,
): void {
  if (event.strategyDecision !== 'entry_candidate') {
    throw new BacktestError('Resolved outcomes may only attach to ENTRY_CANDIDATE events.');
  }
  if (outcome.outcomeCollectedAt < outcome.targetAt || outcome.outcomeCollectedAt > outcome.windowEndAt) {
    throw new BacktestError('Resolved outcome collectedAt is outside the allowed window.');
  }
  if (outcome.actualHorizonSeconds < 900) {
    throw new BacktestError('Resolved outcome actualHorizonSeconds is below the 900-second horizon.');
  }
  if (outcome.outcomeDelaySeconds < 0 || outcome.outcomeDelaySeconds > OUTCOME_MAX_DELAY_SECONDS) {
    throw new BacktestError('Resolved outcome delay is outside 0..120 seconds.');
  }
  if (!Number.isFinite(outcome.grossForwardReturnPct)) {
    throw new BacktestError('Resolved outcome return is not finite.');
  }
  if (typeof outcome.referencePriceUsd !== 'number' || outcome.referencePriceUsd <= 0) {
    throw new BacktestError('Resolved outcome reference price is invalid.');
  }
  if (typeof outcome.outcomePriceUsd !== 'number' || outcome.outcomePriceUsd <= 0) {
    throw new BacktestError('Resolved outcome future price is invalid.');
  }
}
