import type { MarketSnapshot } from '../market-data/types.js';
import type { OpenPaperPosition } from '../position/types.js';
import {
  EXIT_MAX_HOLDING_MS,
  EXIT_SPEC_NAME,
  EXIT_SPEC_VERSION,
} from './constants.js';
import {
  EXIT_DEFINITION_FINGERPRINT,
  exitEvaluationSourceIdentity,
  marketSourceIdentity,
} from './identity.js';
import {
  assertExitEvaluationInvariants,
  assertExitMarketSnapshot,
  assertFrozenOpenPaperPosition,
  deriveHoldingAgeMs,
  deriveStopTriggerPriceUsd,
  deriveTakeProfitTriggerPriceUsd,
} from './invariants.js';
import type { ExitEvaluation, ExitReason } from './types.js';

export function evaluateExitAction(input: {
  openPosition: OpenPaperPosition;
  marketSnapshot: MarketSnapshot;
}): ExitEvaluation {
  const { openPosition, marketSnapshot } = input;
  assertFrozenOpenPaperPosition(openPosition);
  assertExitMarketSnapshot(marketSnapshot, openPosition);

  const stopTriggerPriceUsd = deriveStopTriggerPriceUsd(openPosition.entryPriceUsd);
  const takeProfitTriggerPriceUsd = deriveTakeProfitTriggerPriceUsd(openPosition.entryPriceUsd);
  const holdingAgeMs = deriveHoldingAgeMs(marketSnapshot.collectedAt, openPosition.openedAt);
  const decision = decideExit({
    observedPriceUsd: marketSnapshot.priceUsd,
    stopTriggerPriceUsd,
    takeProfitTriggerPriceUsd,
    holdingAgeMs,
  });

  const sourceIdentity = exitEvaluationSourceIdentity({
    exitSpecVersion: EXIT_SPEC_VERSION,
    exitDefinitionFingerprint: EXIT_DEFINITION_FINGERPRINT,
    positionSourceIdentity: openPosition.positionSourceIdentity,
    marketSourceIdentity: marketSourceIdentity({
      tokenMint: marketSnapshot.tokenMint,
      pairAddress: marketSnapshot.pairAddress,
      collectedAt: marketSnapshot.collectedAt,
    }),
  });

  const evaluation: ExitEvaluation = {
    chain: 'solana',
    tokenMint: openPosition.tokenMint,
    exitSpecVersion: EXIT_SPEC_VERSION,
    exitSpecName: EXIT_SPEC_NAME,
    exitDefinitionFingerprint: EXIT_DEFINITION_FINGERPRINT,
    positionSpecVersion: openPosition.positionSpecVersion,
    positionDefinitionFingerprint: openPosition.positionDefinitionFingerprint,
    positionSourceIdentity: openPosition.positionSourceIdentity,
    pairAddress: openPosition.pairAddress,
    asOf: marketSnapshot.collectedAt,
    evaluatedAt: marketSnapshot.collectedAt,
    marketCollectedAt: marketSnapshot.collectedAt,
    observedPriceUsd: marketSnapshot.priceUsd,
    entryPriceUsd: openPosition.entryPriceUsd,
    stopTriggerPriceUsd,
    takeProfitTriggerPriceUsd,
    holdingAgeMs,
    maxHoldingMs: EXIT_MAX_HOLDING_MS,
    exitAction: decision.exitAction,
    exitReason: decision.exitReason,
    simulatedExitPriceUsd: decision.exitAction === 'close_position' ? marketSnapshot.priceUsd : null,
    closedQuantityTokens: decision.exitAction === 'close_position' ? openPosition.quantityTokens : null,
    sourceIdentity,
  };

  assertExitEvaluationInvariants(evaluation, { openPosition, marketSnapshot });
  return evaluation;
}

function decideExit(input: {
  observedPriceUsd: number | null;
  stopTriggerPriceUsd: number;
  takeProfitTriggerPriceUsd: number;
  holdingAgeMs: number;
}): { exitAction: ExitEvaluation['exitAction']; exitReason: ExitReason } {
  if (input.observedPriceUsd === null) {
    return { exitAction: 'no_change', exitReason: 'market_price_unavailable' };
  }
  if (input.observedPriceUsd <= input.stopTriggerPriceUsd) {
    return { exitAction: 'close_position', exitReason: 'stop_loss_threshold' };
  }
  if (input.observedPriceUsd >= input.takeProfitTriggerPriceUsd) {
    return { exitAction: 'close_position', exitReason: 'take_profit_threshold' };
  }
  if (input.holdingAgeMs >= EXIT_MAX_HOLDING_MS) {
    return { exitAction: 'close_position', exitReason: 'max_holding_time' };
  }
  return { exitAction: 'no_change', exitReason: 'exit_conditions_not_met' };
}
