import type { PaperEvaluation } from '../paper/types.js';
import {
  POSITION_ENTRY_NOTIONAL_USD,
  POSITION_SPEC_NAME,
  POSITION_SPEC_VERSION,
  REQUIRED_POSITION_PAPER_SPEC_VERSION,
} from './constants.js';
import {
  POSITION_DEFINITION_FINGERPRINT,
  paperSourceIdentityFromEvaluation,
  positionEntrySourceIdentity,
  positionEvaluationSourceIdentity,
} from './identity.js';
import {
  assertFrozenPaperEvaluation,
  assertOpenPaperPosition,
  assertPositionEvaluationInvariants,
  derivePaperQuantityTokens,
} from './invariants.js';
import {
  PositionError,
  type OpenPaperPosition,
  type PositionEvaluation,
  type PositionNoChangeReason,
} from './types.js';

export function evaluatePositionAction(input: {
  paperEvaluation: PaperEvaluation;
  currentOpenPosition: OpenPaperPosition | null;
}): PositionEvaluation {
  const { paperEvaluation, currentOpenPosition } = input;
  const paperIdentity = assertFrozenPaperEvaluation(paperEvaluation);
  if (currentOpenPosition !== null) {
    assertOpenPaperPosition(currentOpenPosition, paperEvaluation.tokenMint);
  }

  const priorOpenPositionSourceIdentity = currentOpenPosition?.positionSourceIdentity ?? null;
  const mapped = mapPaperAction(paperEvaluation, currentOpenPosition, paperIdentity);
  const sourceIdentity = positionEvaluationSourceIdentity({
    positionSpecVersion: POSITION_SPEC_VERSION,
    positionDefinitionFingerprint: POSITION_DEFINITION_FINGERPRINT,
    paperSourceIdentity: paperIdentity,
    priorOpenPositionSourceIdentity,
  });

  const evaluation: PositionEvaluation = {
    chain: 'solana',
    tokenMint: paperEvaluation.tokenMint,
    positionSpecVersion: POSITION_SPEC_VERSION,
    positionSpecName: POSITION_SPEC_NAME,
    positionDefinitionFingerprint: POSITION_DEFINITION_FINGERPRINT,
    paperSpecVersion: REQUIRED_POSITION_PAPER_SPEC_VERSION,
    paperDefinitionFingerprint: paperEvaluation.paperDefinitionFingerprint,
    paperSourceIdentity: paperSourceIdentityFromEvaluation(paperEvaluation),
    asOf: paperEvaluation.asOf,
    evaluatedAt: paperEvaluation.evaluatedAt,
    paperAction: paperEvaluation.paperAction,
    paperNoActionReason: paperEvaluation.noActionReason,
    priorOpenPositionSourceIdentity,
    positionAction: mapped.positionAction,
    positionReason: mapped.positionReason,
    entryPriceUsd: mapped.entryPriceUsd,
    entryNotionalUsd: mapped.entryNotionalUsd,
    quantityTokens: mapped.quantityTokens,
    positionSourceIdentity: mapped.positionSourceIdentity,
    sourceIdentity,
  };

  assertPositionEvaluationInvariants(evaluation, {
    paperEvaluation,
    currentOpenPosition,
  });
  return evaluation;
}

function mapPaperAction(
  paper: PaperEvaluation,
  currentOpenPosition: OpenPaperPosition | null,
  paperIdentity: string,
): {
  positionAction: PositionEvaluation['positionAction'];
  positionReason: PositionNoChangeReason | null;
  entryPriceUsd: number | null;
  entryNotionalUsd: number | null;
  quantityTokens: number | null;
  positionSourceIdentity: string | null;
} {
  if (paper.paperAction === 'no_action') {
    return {
      positionAction: 'no_change',
      positionReason:
        paper.noActionReason === 'strategy_no_entry'
          ? 'paper_strategy_no_entry'
          : 'paper_strategy_insufficient_data',
      entryPriceUsd: null,
      entryNotionalUsd: null,
      quantityTokens: null,
      positionSourceIdentity: null,
    };
  }

  if (currentOpenPosition !== null) {
    return {
      positionAction: 'no_change',
      positionReason: 'position_already_open',
      entryPriceUsd: null,
      entryNotionalUsd: null,
      quantityTokens: null,
      positionSourceIdentity: null,
    };
  }

  if (typeof paper.simulatedEntryPriceUsd !== 'number') {
    throw new PositionError('ENTRY_OBSERVATION requires a finite simulatedEntryPriceUsd greater than 0.');
  }
  const entryPriceUsd = paper.simulatedEntryPriceUsd;
  const quantityTokens = derivePaperQuantityTokens(entryPriceUsd);
  return {
    positionAction: 'open_position',
    positionReason: null,
    entryPriceUsd,
    entryNotionalUsd: POSITION_ENTRY_NOTIONAL_USD,
    quantityTokens,
    positionSourceIdentity: positionEntrySourceIdentity({
      positionSpecVersion: POSITION_SPEC_VERSION,
      positionDefinitionFingerprint: POSITION_DEFINITION_FINGERPRINT,
      openingPaperSourceIdentity: paperIdentity,
    }),
  };
}
