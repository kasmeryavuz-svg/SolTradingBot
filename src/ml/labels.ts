import { evaluateExitAction } from '../exit/evaluator.js';
import { requireUtcTimestamp } from '../features/numbers.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { buildCompletedTradeEconomics } from '../optimization/metrics.js';
import { optimizationMarketTimeIdentity } from '../optimization/identity.js';
import { pairKey, type OptimizationIndexes } from '../optimization/timeline.js';
import { POSITION_ENTRY_NOTIONAL_USD, POSITION_SPEC_VERSION } from '../position/constants.js';
import { POSITION_DEFINITION_FINGERPRINT, positionEntrySourceIdentity } from '../position/identity.js';
import { derivePaperQuantityTokens } from '../position/invariants.js';
import type { OpenPaperPosition } from '../position/types.js';
import { LABEL_MAX_HOLD_MS } from './constants.js';
import { MlError } from './errors.js';
import type { MlCensorReason, MlLabelOutcome } from './types.js';

export type LabelObservationBound = {
  startExclusiveMs: number;
  endInclusiveMs: number | null;
  endExclusiveMs: number | null;
};

export function openLabelPosition(snapshot: MarketSnapshot): OpenPaperPosition {
  const entryPriceUsd = snapshot.priceUsd;
  if (typeof entryPriceUsd !== 'number' || !Number.isFinite(entryPriceUsd) || !(entryPriceUsd > 0)) {
    throw new MlError('ML labeling requires a finite entry price greater than 0.');
  }
  const quantityTokens = derivePaperQuantityTokens(entryPriceUsd);
  const openingPaperSourceIdentity = JSON.stringify({
    kind: 'ml19_x11_label_position',
    tokenMint: snapshot.tokenMint,
    pairAddress: snapshot.pairAddress,
    collectedAt: snapshot.collectedAt,
    entryPriceUsd,
    quantityTokens,
  });
  return {
    chain: 'solana',
    tokenMint: snapshot.tokenMint,
    pairAddress: snapshot.pairAddress,
    positionSpecVersion: POSITION_SPEC_VERSION,
    positionDefinitionFingerprint: POSITION_DEFINITION_FINGERPRINT,
    openedAt: snapshot.collectedAt,
    entryMarketCollectedAt: snapshot.collectedAt,
    entryPriceUsd,
    entryNotionalUsd: POSITION_ENTRY_NOTIONAL_USD,
    quantityTokens,
    openingPaperSourceIdentity,
    positionSourceIdentity: positionEntrySourceIdentity({
      positionSpecVersion: POSITION_SPEC_VERSION,
      positionDefinitionFingerprint: POSITION_DEFINITION_FINGERPRINT,
      openingPaperSourceIdentity,
    }),
  };
}

export function labelWindowEndMs(entryMs: number): number {
  return entryMs + LABEL_MAX_HOLD_MS;
}

export function snapshotForSample(
  sample: { tokenMint: string; pairAddress: string; collectedAt: string },
  snapshots: readonly MarketSnapshot[],
): MarketSnapshot {
  const found = snapshots.find(
    (snapshot) =>
      snapshot.tokenMint === sample.tokenMint &&
      snapshot.pairAddress === sample.pairAddress &&
      snapshot.collectedAt === sample.collectedAt,
  );
  if (found === undefined) {
    throw new MlError('Decision sample is missing its entry market snapshot.');
  }
  return found;
}

function observationAllowed(collectedAtMs: number, bound: LabelObservationBound | null): boolean {
  if (bound === null) {
    return true;
  }
  if (!(collectedAtMs > bound.startExclusiveMs)) {
    return false;
  }
  if (bound.endExclusiveMs !== null && collectedAtMs >= bound.endExclusiveMs) {
    return false;
  }
  if (bound.endInclusiveMs !== null && collectedAtMs > bound.endInclusiveMs) {
    return false;
  }
  return true;
}

export function simulateX11Label(input: {
  entry: MarketSnapshot;
  indexes: OptimizationIndexes;
  bound?: LabelObservationBound | null;
  maxHoldMs?: number;
}): MlLabelOutcome {
  const maxHoldMs = input.maxHoldMs ?? LABEL_MAX_HOLD_MS;
  const entryMs = requireUtcTimestamp(input.entry.collectedAt, 'entry.collectedAt');
  const series = input.indexes.snapshotsByPair.get(pairKey(input.entry.tokenMint, input.entry.pairAddress)) ?? [];
  const open = openLabelPosition(input.entry);
  const windowEndMs = entryMs + maxHoldMs;
  const bound = input.bound ?? null;

  // Exit evidence is strictly after entry (collectedMs > T). The entry row
  // cannot be reused as a same-timestamp close. T+6h is included (x11 max hold).
  for (const snapshot of series) {
    const collectedMs = requireUtcTimestamp(snapshot.collectedAt, 'collectedAt');
    if (!(collectedMs > entryMs)) {
      continue;
    }
    if (collectedMs > windowEndMs) {
      break;
    }
    if (!observationAllowed(collectedMs, bound)) {
      continue;
    }
    const evaluation = evaluateExitAction({
      openPosition: open,
      marketSnapshot: snapshot,
    });
    if (evaluation.exitAction !== 'close_position' || evaluation.simulatedExitPriceUsd === null) {
      continue;
    }
    if (
      evaluation.exitReason !== 'stop_loss_threshold' &&
      evaluation.exitReason !== 'take_profit_threshold' &&
      evaluation.exitReason !== 'max_holding_time'
    ) {
      throw new MlError('x11 close produced an unexpected exit reason for ml19 labeling.');
    }
    const quantityTokens = open.quantityTokens;
    const economics = buildCompletedTradeEconomics({
      originalQuantityTokens: quantityTokens,
      entryReferencePriceUsd: open.entryPriceUsd,
      legs: [
        {
          reason: evaluation.exitReason,
          exitedAt: snapshot.collectedAt,
          exitMarketIdentity: optimizationMarketTimeIdentity(snapshot),
          quantityTokens,
          grossExitReferenceUsd: evaluation.simulatedExitPriceUsd,
          observedPriceUsd: evaluation.observedPriceUsd ?? evaluation.simulatedExitPriceUsd,
        },
      ],
    });
    const netBase = economics.netBasePnlUsd;
    return {
      state: netBase > 0 ? 'POSITIVE' : 'NON_POSITIVE',
      label: netBase > 0 ? 1 : 0,
      censorReason: null,
      completedAt: snapshot.collectedAt,
      completedAtMs: collectedMs,
      exitReason: evaluation.exitReason,
      grossExitReferenceUsd: evaluation.simulatedExitPriceUsd,
      observedExitPriceUsd: evaluation.observedPriceUsd ?? evaluation.simulatedExitPriceUsd,
      grossPnlUsd: economics.grossPnlUsd,
      netBasePnlUsd: netBase,
      netStressPnlUsd: economics.netStressPnlUsd,
      netLowPnlUsd: economics.netLowPnlUsd,
      holdingDurationMs: collectedMs - entryMs,
      quantityTokens,
    };
  }

  const censorReason: MlCensorReason =
    bound === null ? 'unresolved_no_closing_observation' : 'label_window_not_contained';
  return {
    state: 'CENSORED',
    label: null,
    censorReason,
    completedAt: null,
    completedAtMs: null,
    exitReason: null,
    grossExitReferenceUsd: null,
    observedExitPriceUsd: null,
    grossPnlUsd: null,
    netBasePnlUsd: null,
    netStressPnlUsd: null,
    netLowPnlUsd: null,
    holdingDurationMs: null,
    quantityTokens: null,
  };
}
