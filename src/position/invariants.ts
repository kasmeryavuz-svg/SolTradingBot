import { FeatureEngineError } from '../features/types.js';
import {
  PAPER_COST_MODEL,
  PAPER_EXECUTION_MODEL,
  PAPER_EXIT_MODEL,
  PAPER_POSITION_MODEL,
  PAPER_QUANTITY_MODEL,
  PAPER_SPEC_NAME,
  PAPER_SPEC_VERSION,
} from '../paper/constants.js';
import { PAPER_DEFINITION_FINGERPRINT, paperSourceIdentity } from '../paper/identity.js';
import { PaperError, type PaperEvaluation } from '../paper/types.js';
import { FEATURE_SET_VERSION } from '../features/definitions.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../strategy/identity.js';
import { StrategyError } from '../strategy/types.js';
import {
  POSITION_ENTRY_NOTIONAL_USD,
  POSITION_SPEC_NAME,
  POSITION_SPEC_VERSION,
  REQUIRED_POSITION_STRATEGY_VERSION,
} from './constants.js';
import {
  POSITION_DEFINITION_FINGERPRINT,
  paperSourceIdentityFromEvaluation,
  positionEntrySourceIdentity,
  positionEvaluationSourceIdentity,
} from './identity.js';
import {
  PositionError,
  type OpenPaperPosition,
  type PositionEvaluation,
} from './types.js';

export function openPaperPositionFromEvaluation(
  evaluation: PositionEvaluation,
  paper: PaperEvaluation,
): OpenPaperPosition {
  if (evaluation.positionAction !== 'open_position') {
    throw new PositionError('Open paper position snapshot requires OPEN_POSITION.');
  }
  if (
    evaluation.entryPriceUsd === null ||
    evaluation.entryNotionalUsd === null ||
    evaluation.quantityTokens === null ||
    evaluation.positionSourceIdentity === null
  ) {
    throw new PositionError('OPEN_POSITION is missing entry fields.');
  }

  return {
    chain: 'solana',
    tokenMint: evaluation.tokenMint,
    pairAddress: paper.pairAddress,
    positionSpecVersion: evaluation.positionSpecVersion,
    positionDefinitionFingerprint: evaluation.positionDefinitionFingerprint,
    openedAt: paper.evaluatedAt,
    entryMarketCollectedAt: paper.marketCollectedAt,
    entryPriceUsd: evaluation.entryPriceUsd,
    entryNotionalUsd: evaluation.entryNotionalUsd,
    quantityTokens: evaluation.quantityTokens,
    openingPaperSourceIdentity: evaluation.paperSourceIdentity,
    positionSourceIdentity: evaluation.positionSourceIdentity,
  };
}

export function wrapPositionSourceError(error: unknown): never {
  if (error instanceof PositionError) {
    throw error;
  }
  if (error instanceof PaperError || error instanceof StrategyError || error instanceof FeatureEngineError) {
    throw new PositionError(error.message, { cause: error });
  }
  throw error;
}

export function derivePaperQuantityTokens(entryPriceUsd: number): number {
  if (typeof entryPriceUsd !== 'number' || !Number.isFinite(entryPriceUsd) || entryPriceUsd <= 0) {
    throw new PositionError('Position entry requires a finite entryPriceUsd greater than 0.');
  }
  const quantityTokens = POSITION_ENTRY_NOTIONAL_USD / entryPriceUsd;
  if (!Number.isFinite(quantityTokens) || quantityTokens <= 0) {
    throw new PositionError('Position quantityTokens must be a finite value greater than 0.');
  }
  return quantityTokens;
}

export function assertFrozenPaperEvaluation(paper: PaperEvaluation): string {
  if ((paper.chain as string) !== 'solana') {
    throw new PositionError('Position evaluation requires a solana paper evaluation.');
  }
  if (paper.paperSpecVersion !== PAPER_SPEC_VERSION) {
    throw new PositionError('Position evaluation requires paper spec p09_v1.');
  }
  if (paper.paperSpecName !== PAPER_SPEC_NAME) {
    throw new PositionError('Position evaluation requires paper spec live_reference_price_entry_observation.');
  }
  if (paper.paperDefinitionFingerprint !== PAPER_DEFINITION_FINGERPRINT) {
    throw new PositionError('Position evaluation requires the frozen p09_v1 paper definition fingerprint.');
  }
  if (paper.featureSetVersion !== FEATURE_SET_VERSION) {
    throw new PositionError('Position evaluation requires feature set c06_v1.');
  }
  if (paper.strategyVersion !== REQUIRED_POSITION_STRATEGY_VERSION) {
    throw new PositionError('Position evaluation requires strategy s07_v1.');
  }
  if (paper.strategyDefinitionFingerprint !== STRATEGY_DEFINITION_FINGERPRINT) {
    throw new PositionError('Position evaluation requires the frozen s07_v1 strategy definition fingerprint.');
  }
  if ((paper.executionModel as string) !== PAPER_EXECUTION_MODEL) {
    throw new PositionError('Position evaluation requires the p09_v1 execution model.');
  }
  if (
    (paper.costModel as string) !== PAPER_COST_MODEL ||
    (paper.quantityModel as string) !== PAPER_QUANTITY_MODEL ||
    (paper.positionModel as string) !== PAPER_POSITION_MODEL ||
    (paper.exitModel as string) !== PAPER_EXIT_MODEL
  ) {
    throw new PositionError('p09_v1 does not model costs, quantity, positions, or exits.');
  }

  const expectedIdentity = paperSourceIdentity({
    paperSpecVersion: PAPER_SPEC_VERSION,
    paperDefinitionFingerprint: PAPER_DEFINITION_FINGERPRINT,
    strategySourceIdentity: paper.strategySourceIdentity,
  });
  const actualIdentity = paperSourceIdentityFromEvaluation(paper);
  if (actualIdentity !== expectedIdentity) {
    throw new PositionError('Paper source identity does not match the canonical p09_v1 identity.');
  }

  if (paper.paperAction === 'entry_observation') {
    if (paper.strategyDecision !== 'entry_candidate' || paper.noActionReason !== null) {
      throw new PositionError('ENTRY_OBSERVATION paper input must map from ENTRY_CANDIDATE with a null no-action reason.');
    }
    if (
      typeof paper.referencePriceUsd !== 'number' ||
      !Number.isFinite(paper.referencePriceUsd) ||
      paper.referencePriceUsd <= 0
    ) {
      throw new PositionError('ENTRY_OBSERVATION requires a finite referencePriceUsd greater than 0.');
    }
    if (
      typeof paper.simulatedEntryPriceUsd !== 'number' ||
      !Number.isFinite(paper.simulatedEntryPriceUsd) ||
      paper.simulatedEntryPriceUsd <= 0
    ) {
      throw new PositionError('ENTRY_OBSERVATION requires a finite simulatedEntryPriceUsd greater than 0.');
    }
    if (!Object.is(paper.referencePriceUsd, paper.simulatedEntryPriceUsd)) {
      throw new PositionError('p09_v1 simulatedEntryPriceUsd must equal referencePriceUsd.');
    }
    return expectedIdentity;
  }

  if ((paper.paperAction as string) !== 'no_action') {
    throw new PositionError('Unknown p09_v1 paper action.');
  }
  if (paper.referencePriceUsd !== null || paper.simulatedEntryPriceUsd !== null) {
    throw new PositionError('NO_ACTION paper evaluations must not store a reference or simulated entry price.');
  }
  if (paper.strategyDecision === 'no_entry' && paper.noActionReason !== 'strategy_no_entry') {
    throw new PositionError('NO_ENTRY paper evaluations must use no-action reason strategy_no_entry.');
  }
  if (paper.strategyDecision === 'insufficient_data' && paper.noActionReason !== 'strategy_insufficient_data') {
    throw new PositionError(
      'INSUFFICIENT_DATA paper evaluations must use no-action reason strategy_insufficient_data.',
    );
  }
  if (paper.strategyDecision !== 'no_entry' && paper.strategyDecision !== 'insufficient_data') {
    throw new PositionError('NO_ACTION paper evaluations must come from NO_ENTRY or INSUFFICIENT_DATA.');
  }
  return expectedIdentity;
}

export function assertOpenPaperPosition(
  position: OpenPaperPosition,
  tokenMint: string,
): void {
  if ((position.chain as string) !== 'solana') {
    throw new PositionError('Open paper position chain must be solana.');
  }
  if (position.tokenMint !== tokenMint) {
    throw new PositionError('Current open paper position token mint does not match the paper evaluation.');
  }
  if (position.positionSpecVersion !== POSITION_SPEC_VERSION) {
    throw new PositionError('Current open paper position must use spec pm10_v1.');
  }
  if (position.positionDefinitionFingerprint !== POSITION_DEFINITION_FINGERPRINT) {
    throw new PositionError('Current open paper position definition fingerprint does not match pm10_v1.');
  }
  if (!Object.is(position.entryNotionalUsd, POSITION_ENTRY_NOTIONAL_USD)) {
    throw new PositionError('Current open paper position entryNotionalUsd must be 100.');
  }
  if (typeof position.entryPriceUsd !== 'number' || !Number.isFinite(position.entryPriceUsd) || position.entryPriceUsd <= 0) {
    throw new PositionError('Current open paper position entryPriceUsd must be finite and greater than 0.');
  }
  const expectedQuantity = derivePaperQuantityTokens(position.entryPriceUsd);
  if (!Object.is(position.quantityTokens, expectedQuantity)) {
    throw new PositionError('Current open paper position quantityTokens does not match 100 / entryPriceUsd.');
  }
  const expectedEntryIdentity = positionEntrySourceIdentity({
    positionSpecVersion: POSITION_SPEC_VERSION,
    positionDefinitionFingerprint: POSITION_DEFINITION_FINGERPRINT,
    openingPaperSourceIdentity: position.openingPaperSourceIdentity,
  });
  if (position.positionSourceIdentity !== expectedEntryIdentity) {
    throw new PositionError('Current open paper position source identity does not match the opening paper identity.');
  }
}

export function openPaperPositionsSemanticallyEqual(
  left: OpenPaperPosition,
  right: OpenPaperPosition,
): boolean {
  return (
    (left.chain as string) === (right.chain as string) &&
    left.tokenMint === right.tokenMint &&
    left.pairAddress === right.pairAddress &&
    left.positionSpecVersion === right.positionSpecVersion &&
    left.positionDefinitionFingerprint === right.positionDefinitionFingerprint &&
    left.openedAt === right.openedAt &&
    left.entryMarketCollectedAt === right.entryMarketCollectedAt &&
    Object.is(left.entryPriceUsd, right.entryPriceUsd) &&
    Object.is(left.entryNotionalUsd, right.entryNotionalUsd) &&
    Object.is(left.quantityTokens, right.quantityTokens) &&
    left.openingPaperSourceIdentity === right.openingPaperSourceIdentity &&
    left.positionSourceIdentity === right.positionSourceIdentity
  );
}

export function positionEvaluationsSemanticallyEqual(
  left: PositionEvaluation,
  right: PositionEvaluation,
): boolean {
  return (
    (left.chain as string) === (right.chain as string) &&
    left.tokenMint === right.tokenMint &&
    left.positionSpecVersion === right.positionSpecVersion &&
    left.positionSpecName === right.positionSpecName &&
    left.positionDefinitionFingerprint === right.positionDefinitionFingerprint &&
    left.paperSpecVersion === right.paperSpecVersion &&
    left.paperDefinitionFingerprint === right.paperDefinitionFingerprint &&
    left.paperSourceIdentity === right.paperSourceIdentity &&
    left.asOf === right.asOf &&
    left.evaluatedAt === right.evaluatedAt &&
    left.paperAction === right.paperAction &&
    left.paperNoActionReason === right.paperNoActionReason &&
    left.priorOpenPositionSourceIdentity === right.priorOpenPositionSourceIdentity &&
    left.positionAction === right.positionAction &&
    left.positionReason === right.positionReason &&
    Object.is(left.entryPriceUsd, right.entryPriceUsd) &&
    Object.is(left.entryNotionalUsd, right.entryNotionalUsd) &&
    Object.is(left.quantityTokens, right.quantityTokens) &&
    left.positionSourceIdentity === right.positionSourceIdentity &&
    left.sourceIdentity === right.sourceIdentity
  );
}

export function assertPositionEvaluationInvariants(
  evaluation: PositionEvaluation,
  sources: {
    paperEvaluation: PaperEvaluation;
    currentOpenPosition: OpenPaperPosition | null;
  },
): void {
  const paperIdentity = assertFrozenPaperEvaluation(sources.paperEvaluation);
  if ((evaluation.chain as string) !== 'solana') {
    throw new PositionError('Position evaluation chain must be solana.');
  }
  if (evaluation.positionSpecVersion !== POSITION_SPEC_VERSION) {
    throw new PositionError('Position evaluation spec version must be pm10_v1.');
  }
  if (evaluation.positionSpecName !== POSITION_SPEC_NAME) {
    throw new PositionError('Position evaluation spec name must be single_open_position_fixed_usd_notional.');
  }
  if (evaluation.positionDefinitionFingerprint !== POSITION_DEFINITION_FINGERPRINT) {
    throw new PositionError('Position definition fingerprint does not match the current pm10_v1 definition.');
  }
  if (evaluation.tokenMint !== sources.paperEvaluation.tokenMint) {
    throw new PositionError('Position evaluation token mint does not match the paper evaluation.');
  }
  if (evaluation.paperSpecVersion !== PAPER_SPEC_VERSION || evaluation.paperDefinitionFingerprint !== PAPER_DEFINITION_FINGERPRINT) {
    throw new PositionError('Position evaluation paper spec does not match frozen p09_v1.');
  }
  if (evaluation.paperSourceIdentity !== paperIdentity) {
    throw new PositionError('Position evaluation paperSourceIdentity does not match the recomputed p09_v1 identity.');
  }
  if (evaluation.asOf !== sources.paperEvaluation.asOf || evaluation.evaluatedAt !== sources.paperEvaluation.evaluatedAt) {
    throw new PositionError('Position evaluation timestamps must equal the paper evaluation timestamps.');
  }
  if (evaluation.paperAction !== sources.paperEvaluation.paperAction) {
    throw new PositionError('Position evaluation paperAction does not match the paper evaluation.');
  }
  if (evaluation.paperNoActionReason !== sources.paperEvaluation.noActionReason) {
    throw new PositionError('Position evaluation paperNoActionReason does not match the paper evaluation.');
  }

  const priorIdentity = sources.currentOpenPosition?.positionSourceIdentity ?? null;
  if (evaluation.priorOpenPositionSourceIdentity !== priorIdentity) {
    throw new PositionError('Position evaluation priorOpenPositionSourceIdentity does not match the supplied open position.');
  }

  const expectedSourceIdentity = positionEvaluationSourceIdentity({
    positionSpecVersion: POSITION_SPEC_VERSION,
    positionDefinitionFingerprint: POSITION_DEFINITION_FINGERPRINT,
    paperSourceIdentity: paperIdentity,
    priorOpenPositionSourceIdentity: priorIdentity,
  });
  if (evaluation.sourceIdentity !== expectedSourceIdentity) {
    throw new PositionError('Position evaluation source identity does not match the canonical pm10_v1 identity.');
  }

  if (evaluation.positionAction === 'open_position') {
    if (sources.currentOpenPosition !== null) {
      throw new PositionError('OPEN_POSITION is not allowed when a current open paper position already exists.');
    }
    if (evaluation.positionReason !== null) {
      throw new PositionError('OPEN_POSITION must use a null position reason.');
    }
    if (evaluation.paperAction !== 'entry_observation') {
      throw new PositionError('OPEN_POSITION requires a p09_v1 entry_observation.');
    }
    if (
      typeof evaluation.entryPriceUsd !== 'number' ||
      !Object.is(evaluation.entryPriceUsd, sources.paperEvaluation.simulatedEntryPriceUsd)
    ) {
      throw new PositionError('OPEN_POSITION entryPriceUsd must equal the paper simulatedEntryPriceUsd.');
    }
    if (!Object.is(evaluation.entryNotionalUsd, POSITION_ENTRY_NOTIONAL_USD)) {
      throw new PositionError('OPEN_POSITION entryNotionalUsd must be 100.');
    }
    const expectedQuantity = derivePaperQuantityTokens(evaluation.entryPriceUsd);
    if (!Object.is(evaluation.quantityTokens, expectedQuantity)) {
      throw new PositionError('OPEN_POSITION quantityTokens must equal 100 / entryPriceUsd.');
    }
    const expectedPositionIdentity = positionEntrySourceIdentity({
      positionSpecVersion: POSITION_SPEC_VERSION,
      positionDefinitionFingerprint: POSITION_DEFINITION_FINGERPRINT,
      openingPaperSourceIdentity: paperIdentity,
    });
    if (evaluation.positionSourceIdentity !== expectedPositionIdentity) {
      throw new PositionError('OPEN_POSITION positionSourceIdentity does not match the opening paper identity.');
    }
    return;
  }

  if ((evaluation.positionAction as string) !== 'no_change') {
    throw new PositionError('Unknown pm10_v1 position action.');
  }
  if (
    evaluation.entryPriceUsd !== null ||
    evaluation.entryNotionalUsd !== null ||
    evaluation.quantityTokens !== null ||
    evaluation.positionSourceIdentity !== null
  ) {
    throw new PositionError('NO_CHANGE position evaluations must not look like a new position.');
  }
  if (evaluation.paperAction === 'entry_observation') {
    if (sources.currentOpenPosition === null || evaluation.positionReason !== 'position_already_open') {
      throw new PositionError('ENTRY_OBSERVATION with an existing open position must use position_already_open.');
    }
    return;
  }
  if (evaluation.paperNoActionReason === 'strategy_no_entry' && evaluation.positionReason !== 'paper_strategy_no_entry') {
    throw new PositionError('NO_ENTRY paper evaluations must map to paper_strategy_no_entry.');
  }
  if (
    evaluation.paperNoActionReason === 'strategy_insufficient_data' &&
    evaluation.positionReason !== 'paper_strategy_insufficient_data'
  ) {
    throw new PositionError('INSUFFICIENT_DATA paper evaluations must map to paper_strategy_insufficient_data.');
  }
}
