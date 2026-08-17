import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { EXIT_MAX_HOLDING_MS } from '../src/exit/constants.js';
import {
  exitEvaluationSourceIdentity,
  exitEvidenceSourceIdentity,
  marketSourceIdentity,
} from '../src/exit/identity.js';
import { evaluateExitAction } from '../src/exit/evaluator.js';
import { paperSourceIdentity } from '../src/paper/identity.js';
import {
  FROZEN_P09_V1_DEFINITION_FINGERPRINT,
  FROZEN_PM10_V1_DEFINITION_FINGERPRINT,
  FROZEN_S07_V1_DEFINITION_FINGERPRINT,
  FROZEN_X11_V1_DEFINITION_FINGERPRINT,
  PERFORMANCE_DEFINITION_FINGERPRINT,
  PERFORMANCE_SPEC_VERSION,
  calculateGrossTradeMetrics,
} from '../src/performance/index.js';
import type {
  ClosedExitReason,
  CompletedPaperTrade,
  CompletedPaperTradeEvidence,
} from '../src/performance/types.js';
import { requireUtcMillis } from '../src/performance/numbers.js';
import type { SqlitePersistenceRepository } from '../src/persistence/index.js';
import {
  positionEntrySourceIdentity,
  positionEvaluationSourceIdentity,
} from '../src/position/identity.js';
import { PAIR_ADDRESS, T_10_00 } from './feature-fixtures.js';
import { addMs, exitMarketSnapshot, positionBundleAt } from './exit-fixtures.js';

export const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
export const WIF_MINT = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm';
export const POPCAT_MINT = '7GCihgDB8fe6KNjn2MYtkzZcRjQy3p9WVrRgGNVPua7A';
export const TRUMP_MINT = '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN';

export function paperTrade(input: {
  positionSourceIdentity: string;
  exitEvidenceSourceIdentity?: string;
  exitEvaluationSourceIdentity?: string;
  tokenMint?: string;
  pairAddress?: string;
  openedAt: string;
  exitedAt: string;
  entryPriceUsd: number;
  entryReferenceNotionalUsd?: number;
  quantityTokens: number;
  exitPriceUsd: number;
  exitReason?: ClosedExitReason;
}): CompletedPaperTrade {
  const metrics = calculateGrossTradeMetrics({
    entryPriceUsd: input.entryPriceUsd,
    entryReferenceNotionalUsd: input.entryReferenceNotionalUsd ?? 100,
    quantityTokens: input.quantityTokens,
    exitPriceUsd: input.exitPriceUsd,
    openedAtMs: requireUtcMillis(input.openedAt, 'openedAt'),
    exitedAtMs: requireUtcMillis(input.exitedAt, 'exitedAt'),
  });

  return {
    performanceSpecVersion: PERFORMANCE_SPEC_VERSION,
    performanceDefinitionFingerprint: PERFORMANCE_DEFINITION_FINGERPRINT,
    tokenMint: input.tokenMint ?? WRAPPED_SOL_MINT,
    pairAddress: input.pairAddress ?? PAIR_ADDRESS,
    positionSourceIdentity: input.positionSourceIdentity,
    exitEvaluationSourceIdentity:
      input.exitEvaluationSourceIdentity ?? `${input.positionSourceIdentity}:eval`,
    exitEvidenceSourceIdentity:
      input.exitEvidenceSourceIdentity ?? `${input.positionSourceIdentity}:exit`,
    openedAt: input.openedAt,
    exitedAt: input.exitedAt,
    holdingDurationMs: metrics.holdingDurationMs,
    entryPriceUsd: input.entryPriceUsd,
    entryReferenceNotionalUsd: input.entryReferenceNotionalUsd ?? 100,
    quantityTokens: input.quantityTokens,
    exitPriceUsd: input.exitPriceUsd,
    grossExitValueUsd: metrics.grossExitValueUsd,
    grossPnlUsd: metrics.grossPnlUsd,
    grossReturnPct: metrics.grossReturnPct,
    outcome: metrics.outcome,
    exitReason: input.exitReason ?? 'take_profit_threshold',
  };
}

export const TRADE_A = paperTrade({
  positionSourceIdentity: 'pos-a',
  openedAt: T_10_00,
  exitedAt: addMs(T_10_00, 60_000),
  entryPriceUsd: 100,
  quantityTokens: 1,
  exitPriceUsd: 120,
  exitReason: 'take_profit_threshold',
});

export const TRADE_B = paperTrade({
  positionSourceIdentity: 'pos-b',
  openedAt: T_10_00,
  exitedAt: addMs(T_10_00, 120_000),
  entryPriceUsd: 100,
  quantityTokens: 1,
  exitPriceUsd: 90,
  exitReason: 'stop_loss_threshold',
});

export const TRADE_C = paperTrade({
  positionSourceIdentity: 'pos-c',
  openedAt: T_10_00,
  exitedAt: addMs(T_10_00, 180_000),
  entryPriceUsd: 100,
  quantityTokens: 1,
  exitPriceUsd: 100,
  exitReason: 'max_holding_time',
});

export const TRADE_ZERO = paperTrade({
  positionSourceIdentity: 'pos-zero',
  openedAt: T_10_00,
  exitedAt: addMs(T_10_00, 240_000),
  entryPriceUsd: 100,
  quantityTokens: 1,
  exitPriceUsd: 0,
  exitReason: 'stop_loss_threshold',
});

export const TRADE_Q = paperTrade({
  positionSourceIdentity: 'pos-q',
  openedAt: T_10_00,
  exitedAt: addMs(T_10_00, 300_000),
  entryPriceUsd: 50,
  quantityTokens: 2,
  exitPriceUsd: 100,
  exitReason: 'take_profit_threshold',
});

export function validEvidence(
  overrides: Partial<CompletedPaperTradeEvidence> = {},
): CompletedPaperTradeEvidence {
  const openedAt = overrides.openedAt ?? T_10_00;
  const exitedAt = overrides.exitedAt ?? addMs(T_10_00, 60_000);
  const entryPriceUsd = overrides.entryPriceUsd ?? 100;
  const exitPriceUsd = overrides.exitPriceUsd ?? 120;
  const quantityTokens = overrides.positionQuantityTokens ?? 1;
  const holdingAgeMs = Number.isFinite(Date.parse(exitedAt) - Date.parse(openedAt))
    ? Date.parse(exitedAt) - Date.parse(openedAt)
    : 60_000;

  const facts: CompletedPaperTradeEvidence = {
    tokenMint: WRAPPED_SOL_MINT,
    positionPairAddress: PAIR_ADDRESS,
    exitPairAddress: PAIR_ADDRESS,
    exitEvaluationPairAddress: PAIR_ADDRESS,
    openingPaperPairAddress: PAIR_ADDRESS,
    positionId: 1,
    exitEvaluationPositionId: 1,
    positionTokenId: 1,
    exitTokenId: 1,
    exitEvaluationTokenId: 1,
    openingPaperTokenId: 1,
    strategyTokenId: 1,
    positionEvaluationTokenId: 1,
    currentlyOpen: false,
    openPointerTokenId: null,
    openedAt,
    entryMarketCollectedAt: openedAt,
    entryPriceUsd,
    entryNotionalUsd: 100,
    positionQuantityTokens: quantityTokens,
    positionSpecVersion: 'pm10_v1',
    positionDefinitionFingerprint: FROZEN_PM10_V1_DEFINITION_FINGERPRINT,
    positionSourceIdentity: 'unbound-position',
    openingPaperSourceIdentity: 'unbound-paper',
    openingPaperEvaluationSourceIdentity: 'unbound-paper',
    openingPaperSpecVersion: 'p09_v1',
    openingPaperDefinitionFingerprint: FROZEN_P09_V1_DEFINITION_FINGERPRINT,
    openingPaperStrategyDefinitionFingerprint: FROZEN_S07_V1_DEFINITION_FINGERPRINT,
    openingPaperFeatureSetVersion: 'c06_v1',
    openingPaperAction: 'entry_observation',
    openingPaperStrategyDecision: 'entry_candidate',
    openingPaperSimulatedEntryPriceUsd: entryPriceUsd,
    openingPaperReferencePriceUsd: entryPriceUsd,
    openingPaperEvaluatedAt: openedAt,
    openingPaperAsOf: openedAt,
    openingPaperMarketCollectedAt: openedAt,
    openingPaperEvaluationId: 1,
    positionEvaluationPaperEvaluationId: 1,
    positionEvaluationSourceIdentity: 'unbound-position-eval',
    positionEvaluationPositionSourceIdentity: 'unbound-position',
    positionEvaluationAction: 'open_position',
    positionEvaluationPaperAction: 'entry_observation',
    positionEvaluationPriorOpenPositionId: null,
    positionEvaluationPriorOpenPositionSourceIdentity: null,
    positionEvaluationEntryPriceUsd: entryPriceUsd,
    positionEvaluationEntryNotionalUsd: 100,
    positionEvaluationQuantityTokens: quantityTokens,
    positionEvaluationSpecVersion: 'pm10_v1',
    positionEvaluationDefinitionFingerprint: FROZEN_PM10_V1_DEFINITION_FINGERPRINT,
    strategyVersion: 's07_v1',
    strategyDefinitionFingerprint: FROZEN_S07_V1_DEFINITION_FINGERPRINT,
    strategyFeatureSetVersion: 'c06_v1',
    strategySourceIdentity: 'strategy-source',
    strategyDecision: 'entry_candidate',
    strategyEvaluatedAt: openedAt,
    strategyAsOf: openedAt,
    exitEvidenceId: 1,
    exitEvaluationId: 1,
    exitEvidenceSpecVersion: 'x11_v1',
    exitEvidenceDefinitionFingerprint: FROZEN_X11_V1_DEFINITION_FINGERPRINT,
    exitEvidencePositionDefinitionFingerprint: FROZEN_PM10_V1_DEFINITION_FINGERPRINT,
    exitEvaluationSpecVersion: 'x11_v1',
    exitEvaluationDefinitionFingerprint: FROZEN_X11_V1_DEFINITION_FINGERPRINT,
    exitEvaluationPositionDefinitionFingerprint: FROZEN_PM10_V1_DEFINITION_FINGERPRINT,
    exitEvaluationPositionSourceIdentity: 'unbound-position',
    exitAction: 'close_position',
    exitReason: 'take_profit_threshold',
    exitedAt,
    exitMarketCollectedAt: exitedAt,
    exitEvaluationMarketCollectedAt: exitedAt,
    exitEvaluationEvaluatedAt: exitedAt,
    exitEvaluationAsOf: exitedAt,
    exitPriceUsd,
    exitQuantityTokens: quantityTokens,
    exitEvaluationSimulatedExitPriceUsd: exitPriceUsd,
    exitEvaluationClosedQuantityTokens: quantityTokens,
    exitEvaluationObservedPriceUsd: exitPriceUsd,
    exitEvaluationEntryPriceUsd: entryPriceUsd,
    exitEvaluationStopTriggerPriceUsd: entryPriceUsd > 0 ? entryPriceUsd * (1 - 1000 / 10_000) : 0,
    exitEvaluationTakeProfitTriggerPriceUsd:
      entryPriceUsd > 0 ? entryPriceUsd * (1 + 2000 / 10_000) : 0,
    exitEvaluationHoldingAgeMs: holdingAgeMs,
    exitEvaluationMaxHoldingMs: EXIT_MAX_HOLDING_MS,
    exitMarketSnapshotId: 1,
    exitMarketSnapshotPairAddress: PAIR_ADDRESS,
    exitMarketSnapshotPriceUsd: exitPriceUsd,
    exitMarketSnapshotCollectedAt: exitedAt,
    closingPositionSourceIdentity: 'unbound-position',
    exitEvidenceSourceIdentity: 'unbound-exit-evidence',
    exitEvaluationSourceIdentity: 'unbound-exit-evaluation',
    ...overrides,
  };

  const bound = bindFrozenSourceIdentities(facts);
  return {
    ...facts,
    ...bound,
    ...identityOverrides(overrides),
  };
}

function bindFrozenSourceIdentities(
  evidence: CompletedPaperTradeEvidence,
): Pick<
  CompletedPaperTradeEvidence,
  | 'openingPaperSourceIdentity'
  | 'openingPaperEvaluationSourceIdentity'
  | 'positionSourceIdentity'
  | 'positionEvaluationSourceIdentity'
  | 'positionEvaluationPositionSourceIdentity'
  | 'closingPositionSourceIdentity'
  | 'exitEvaluationPositionSourceIdentity'
  | 'exitEvaluationSourceIdentity'
  | 'exitEvidenceSourceIdentity'
> {
  const openingPaperSourceIdentity = paperSourceIdentity({
    paperSpecVersion: evidence.openingPaperSpecVersion,
    paperDefinitionFingerprint: evidence.openingPaperDefinitionFingerprint,
    strategySourceIdentity: evidence.strategySourceIdentity,
  });
  const positionSourceIdentity = positionEntrySourceIdentity({
    positionSpecVersion: evidence.positionSpecVersion,
    positionDefinitionFingerprint: evidence.positionDefinitionFingerprint,
    openingPaperSourceIdentity,
  });
  const positionEvaluationSourceIdentityValue = positionEvaluationSourceIdentity({
    positionSpecVersion: evidence.positionEvaluationSpecVersion,
    positionDefinitionFingerprint: evidence.positionEvaluationDefinitionFingerprint,
    paperSourceIdentity: openingPaperSourceIdentity,
    priorOpenPositionSourceIdentity: null,
  });
  const expectedMarketIdentity = marketSourceIdentity({
    tokenMint: evidence.tokenMint,
    pairAddress: evidence.positionPairAddress,
    collectedAt: evidence.exitMarketSnapshotCollectedAt,
  });
  const exitEvaluationSourceIdentityValue = exitEvaluationSourceIdentity({
    exitSpecVersion: evidence.exitEvaluationSpecVersion,
    exitDefinitionFingerprint: evidence.exitEvaluationDefinitionFingerprint,
    positionSourceIdentity,
    marketSourceIdentity: expectedMarketIdentity,
  });
  const exitEvidenceSourceIdentityValue = exitEvidenceSourceIdentity({
    exitSpecVersion: evidence.exitEvidenceSpecVersion,
    exitDefinitionFingerprint: evidence.exitEvidenceDefinitionFingerprint,
    positionSourceIdentity,
    exitEvaluationSourceIdentity: exitEvaluationSourceIdentityValue,
  });

  return {
    openingPaperSourceIdentity,
    openingPaperEvaluationSourceIdentity: openingPaperSourceIdentity,
    positionSourceIdentity,
    positionEvaluationSourceIdentity: positionEvaluationSourceIdentityValue,
    positionEvaluationPositionSourceIdentity: positionSourceIdentity,
    closingPositionSourceIdentity: positionSourceIdentity,
    exitEvaluationPositionSourceIdentity: positionSourceIdentity,
    exitEvaluationSourceIdentity: exitEvaluationSourceIdentityValue,
    exitEvidenceSourceIdentity: exitEvidenceSourceIdentityValue,
  };
}

function identityOverrides(
  overrides: Partial<CompletedPaperTradeEvidence>,
): Partial<CompletedPaperTradeEvidence> {
  const keys = [
    'openingPaperSourceIdentity',
    'openingPaperEvaluationSourceIdentity',
    'positionSourceIdentity',
    'positionEvaluationSourceIdentity',
    'positionEvaluationPositionSourceIdentity',
    'closingPositionSourceIdentity',
    'exitEvaluationPositionSourceIdentity',
    'exitEvaluationSourceIdentity',
    'exitEvidenceSourceIdentity',
    'strategySourceIdentity',
  ] as const;
  const selected: Partial<CompletedPaperTradeEvidence> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      selected[key] = overrides[key] as never;
    }
  }
  return selected;
}

export function seedClosedPaperTrade(
  repository: SqlitePersistenceRepository,
  options: {
    tokenMint: string;
    openedAt: string;
    exitedAt: string;
    entryPriceUsd: number;
    exitPriceUsd: number;
    pairAddress?: string;
  },
): void {
  repository.recordPositionBundle(
    positionBundleAt(options.openedAt, {
      tokenMint: options.tokenMint,
      ...(options.pairAddress === undefined ? {} : { pairAddress: options.pairAddress }),
      priceUsd: options.entryPriceUsd,
    }),
  );
  const open = repository.getOpenPaperPosition(options.tokenMint);
  if (open === null) {
    throw new Error(`expected an open paper position for ${options.tokenMint}`);
  }

  const marketSnapshot = exitMarketSnapshot(open, {
    priceUsd: options.exitPriceUsd,
    collectedAt: options.exitedAt,
  });
  const exitEvaluation = evaluateExitAction({ openPosition: open, marketSnapshot });
  if (exitEvaluation.exitAction !== 'close_position') {
    throw new Error(
      `expected x11 close_position, got ${exitEvaluation.exitAction}/${exitEvaluation.exitReason}`,
    );
  }

  repository.recordExitBundle({
    openPosition: open,
    marketSnapshot,
    exitEvaluation,
  });
}

export { USDC_MINT, WRAPPED_SOL_MINT, PAIR_ADDRESS, T_10_00, addMs };
