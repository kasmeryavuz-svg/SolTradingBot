import {
  exitEvaluationSourceIdentity,
  exitEvidenceSourceIdentity,
  marketSourceIdentity,
} from '../exit/identity.js';
import {
  deriveHoldingAgeMs,
  deriveStopTriggerPriceUsd,
  deriveTakeProfitTriggerPriceUsd,
} from '../exit/invariants.js';
import { EXIT_MAX_HOLDING_MS } from '../exit/constants.js';
import { ExitError } from '../exit/types.js';
import { paperSourceIdentity } from '../paper/identity.js';
import {
  positionEntrySourceIdentity,
  positionEvaluationSourceIdentity,
} from '../position/identity.js';
import { derivePaperQuantityTokens } from '../position/invariants.js';
import { PositionError } from '../position/types.js';
import {
  CLOSED_EXIT_REASONS,
  PerformanceError,
  REJECTED_EXIT_REASONS,
  type ClosedExitReason,
  type CompletedPaperTrade,
  type CompletedPaperTradeEvidence,
} from './types.js';
import {
  ENTRY_REFERENCE_NOTIONAL_USD,
  FROZEN_C06_V1_FEATURE_SET_VERSION,
  FROZEN_P09_V1_DEFINITION_FINGERPRINT,
  FROZEN_PM10_V1_DEFINITION_FINGERPRINT,
  FROZEN_S07_V1_DEFINITION_FINGERPRINT,
  FROZEN_X11_V1_DEFINITION_FINGERPRINT,
  PERFORMANCE_SPEC_VERSION,
  REQUIRED_PERFORMANCE_EXIT_SPEC_VERSION,
  REQUIRED_PERFORMANCE_PAPER_SPEC_VERSION,
  REQUIRED_PERFORMANCE_POSITION_SPEC_VERSION,
  REQUIRED_PERFORMANCE_STRATEGY_VERSION,
} from './constants.js';
import { PERFORMANCE_DEFINITION_FINGERPRINT } from './identity.js';
import { requireFiniteNumber, requireUtcMillis } from './numbers.js';
import { calculateGrossTradeMetrics } from './trade.js';

export function assertCompletedTradeEvidence(evidence: CompletedPaperTradeEvidence): void {
  assertTokenAndPair(evidence);
  assertFrozenUpstream(evidence);
  assertOpeningChain(evidence);
  assertSourceIdentitiesBindFacts(evidence);
  assertNumericFacts(evidence);
  assertPm10StoredQuantityFormula(evidence);
  assertExitChain(evidence);
  assertTiming(evidence);
  assertCloseAction(evidence);
  assertCurrentOpenContradiction(evidence);
}

export function normalizeCompletedPaperTrade(
  evidence: CompletedPaperTradeEvidence,
): CompletedPaperTrade {
  assertCompletedTradeEvidence(evidence);
  const openedAtMs = requireUtcMillis(evidence.openedAt, 'openedAt');
  const exitedAtMs = requireUtcMillis(evidence.exitedAt, 'exitedAt');
  const metrics = calculateGrossTradeMetrics({
    entryPriceUsd: evidence.entryPriceUsd,
    entryReferenceNotionalUsd: evidence.entryNotionalUsd,
    quantityTokens: evidence.positionQuantityTokens,
    exitPriceUsd: evidence.exitPriceUsd,
    openedAtMs,
    exitedAtMs,
  });

  return {
    performanceSpecVersion: PERFORMANCE_SPEC_VERSION,
    performanceDefinitionFingerprint: PERFORMANCE_DEFINITION_FINGERPRINT,
    tokenMint: evidence.tokenMint,
    pairAddress: evidence.positionPairAddress,
    positionSourceIdentity: evidence.positionSourceIdentity,
    exitEvaluationSourceIdentity: evidence.exitEvaluationSourceIdentity,
    exitEvidenceSourceIdentity: evidence.exitEvidenceSourceIdentity,
    openedAt: evidence.openedAt,
    exitedAt: evidence.exitedAt,
    holdingDurationMs: metrics.holdingDurationMs,
    entryPriceUsd: evidence.entryPriceUsd,
    entryReferenceNotionalUsd: evidence.entryNotionalUsd,
    quantityTokens: evidence.positionQuantityTokens,
    exitPriceUsd: evidence.exitPriceUsd,
    grossExitValueUsd: metrics.grossExitValueUsd,
    grossPnlUsd: metrics.grossPnlUsd,
    grossReturnPct: metrics.grossReturnPct,
    outcome: metrics.outcome,
    exitReason: evidence.exitReason as ClosedExitReason,
  };
}

function assertTokenAndPair(evidence: CompletedPaperTradeEvidence): void {
  if (evidence.tokenMint.trim() === '') {
    throw new PerformanceError('Completed paper trade evidence has an empty token mint.');
  }
  if (evidence.positionPairAddress.trim() === '') {
    throw new PerformanceError(
      'Completed paper trade evidence has an empty position pair address.',
    );
  }
  if (evidence.positionPairAddress !== evidence.exitPairAddress) {
    throw new PerformanceError(
      'Completed paper trade evidence pair does not match between the position and exit evidence.',
    );
  }
  if (evidence.positionPairAddress !== evidence.exitEvaluationPairAddress) {
    throw new PerformanceError(
      'Completed paper trade evidence pair does not match between the position and exit evaluation.',
    );
  }
  if (evidence.positionPairAddress !== evidence.openingPaperPairAddress) {
    throw new PerformanceError(
      'Completed paper trade evidence pair does not match the opening paper evaluation pair.',
    );
  }
  if (evidence.positionPairAddress !== evidence.exitMarketSnapshotPairAddress) {
    throw new PerformanceError(
      'Completed paper trade evidence pair does not match the exit market snapshot pair.',
    );
  }
  if (
    evidence.positionTokenId !== evidence.exitTokenId ||
    evidence.positionTokenId !== evidence.exitEvaluationTokenId ||
    evidence.positionTokenId !== evidence.openingPaperTokenId ||
    evidence.positionTokenId !== evidence.strategyTokenId ||
    evidence.positionTokenId !== evidence.positionEvaluationTokenId
  ) {
    throw new PerformanceError(
      'Completed paper trade evidence token ids do not match across the frozen chain.',
    );
  }
}

function assertFrozenUpstream(evidence: CompletedPaperTradeEvidence): void {
  if (evidence.positionSpecVersion !== REQUIRED_PERFORMANCE_POSITION_SPEC_VERSION) {
    throw new PerformanceError('Completed paper trade evidence requires position spec pm10_v1.');
  }
  if (evidence.positionDefinitionFingerprint !== FROZEN_PM10_V1_DEFINITION_FINGERPRINT) {
    throw new PerformanceError(
      'Completed paper trade evidence requires the frozen pm10_v1 position definition fingerprint.',
    );
  }
  if (evidence.positionEvaluationSpecVersion !== REQUIRED_PERFORMANCE_POSITION_SPEC_VERSION) {
    throw new PerformanceError(
      'Completed paper trade opening position evaluation requires position spec pm10_v1.',
    );
  }
  if (evidence.positionEvaluationDefinitionFingerprint !== FROZEN_PM10_V1_DEFINITION_FINGERPRINT) {
    throw new PerformanceError(
      'Completed paper trade opening position evaluation requires the frozen pm10_v1 position definition fingerprint.',
    );
  }
  if (
    evidence.exitEvidencePositionDefinitionFingerprint !== FROZEN_PM10_V1_DEFINITION_FINGERPRINT
  ) {
    throw new PerformanceError(
      'Completed paper trade exit evidence requires the frozen pm10_v1 position definition fingerprint.',
    );
  }
  if (
    evidence.exitEvaluationPositionDefinitionFingerprint !== FROZEN_PM10_V1_DEFINITION_FINGERPRINT
  ) {
    throw new PerformanceError(
      'Completed paper trade exit evaluation requires the frozen pm10_v1 position definition fingerprint.',
    );
  }
  if (
    evidence.exitEvidenceSpecVersion !== REQUIRED_PERFORMANCE_EXIT_SPEC_VERSION ||
    evidence.exitEvaluationSpecVersion !== REQUIRED_PERFORMANCE_EXIT_SPEC_VERSION
  ) {
    throw new PerformanceError('Completed paper trade evidence requires exit spec x11_v1.');
  }
  if (
    evidence.exitEvidenceDefinitionFingerprint !== FROZEN_X11_V1_DEFINITION_FINGERPRINT ||
    evidence.exitEvaluationDefinitionFingerprint !== FROZEN_X11_V1_DEFINITION_FINGERPRINT
  ) {
    throw new PerformanceError(
      'Completed paper trade evidence requires the frozen x11_v1 exit definition fingerprint.',
    );
  }
  if (evidence.openingPaperSpecVersion !== REQUIRED_PERFORMANCE_PAPER_SPEC_VERSION) {
    throw new PerformanceError('Completed paper trade evidence requires paper spec p09_v1.');
  }
  if (evidence.openingPaperDefinitionFingerprint !== FROZEN_P09_V1_DEFINITION_FINGERPRINT) {
    throw new PerformanceError(
      'Completed paper trade evidence requires the frozen p09_v1 paper definition fingerprint.',
    );
  }
  if (evidence.strategyVersion !== REQUIRED_PERFORMANCE_STRATEGY_VERSION) {
    throw new PerformanceError('Completed paper trade evidence requires strategy s07_v1.');
  }
  if (
    evidence.strategyDefinitionFingerprint !== FROZEN_S07_V1_DEFINITION_FINGERPRINT ||
    evidence.openingPaperStrategyDefinitionFingerprint !== FROZEN_S07_V1_DEFINITION_FINGERPRINT
  ) {
    throw new PerformanceError(
      'Completed paper trade evidence requires the frozen s07_v1 strategy definition fingerprint.',
    );
  }
  if (
    evidence.openingPaperFeatureSetVersion !== FROZEN_C06_V1_FEATURE_SET_VERSION ||
    evidence.strategyFeatureSetVersion !== FROZEN_C06_V1_FEATURE_SET_VERSION
  ) {
    throw new PerformanceError('Completed paper trade evidence requires feature set c06_v1.');
  }
}

function assertOpeningChain(evidence: CompletedPaperTradeEvidence): void {
  if (evidence.openingPaperEvaluationId !== evidence.positionEvaluationPaperEvaluationId) {
    throw new PerformanceError(
      'Completed paper trade opening paper evaluation does not match the position evaluation chain.',
    );
  }
  if (evidence.openingPaperAction !== 'entry_observation') {
    throw new PerformanceError(
      'Completed paper trade evidence requires an opening paper_action of entry_observation.',
    );
  }
  if (evidence.openingPaperStrategyDecision !== 'entry_candidate') {
    throw new PerformanceError(
      'Completed paper trade evidence requires an opening strategy_decision of entry_candidate.',
    );
  }
  if (evidence.strategyDecision !== 'entry_candidate') {
    throw new PerformanceError(
      'Completed paper trade evidence requires an opening strategy evaluation decision of entry_candidate.',
    );
  }
  if (evidence.positionEvaluationAction !== 'open_position') {
    throw new PerformanceError(
      'Completed paper trade evidence requires an opening position_action of open_position.',
    );
  }
  if (evidence.positionEvaluationPaperAction !== 'entry_observation') {
    throw new PerformanceError(
      'Completed paper trade opening position evaluation requires paper_action entry_observation.',
    );
  }
  if (
    evidence.positionEvaluationPriorOpenPositionId !== null ||
    evidence.positionEvaluationPriorOpenPositionSourceIdentity !== null
  ) {
    throw new PerformanceError(
      'Completed paper trade opening position evaluation cannot have a prior open position.',
    );
  }
  if (evidence.openingPaperSimulatedEntryPriceUsd === null) {
    throw new PerformanceError(
      'Completed paper trade opening paper evaluation is missing simulatedEntryPriceUsd.',
    );
  }
  if (evidence.openingPaperReferencePriceUsd === null) {
    throw new PerformanceError(
      'Completed paper trade opening paper evaluation is missing referencePriceUsd.',
    );
  }
  if (
    !Object.is(evidence.openingPaperSimulatedEntryPriceUsd, evidence.openingPaperReferencePriceUsd)
  ) {
    throw new PerformanceError(
      'Completed paper trade opening simulated entry price must equal the paper reference price.',
    );
  }
  if (!Object.is(evidence.openingPaperSimulatedEntryPriceUsd, evidence.entryPriceUsd)) {
    throw new PerformanceError(
      'Completed paper trade position entry price does not match the opening paper simulated entry price.',
    );
  }
  if (evidence.positionEvaluationEntryPriceUsd === null) {
    throw new PerformanceError(
      'Completed paper trade opening position evaluation is missing entryPriceUsd.',
    );
  }
  if (!Object.is(evidence.positionEvaluationEntryPriceUsd, evidence.entryPriceUsd)) {
    throw new PerformanceError(
      'Completed paper trade position entry price does not match the opening position evaluation.',
    );
  }
  if (evidence.positionEvaluationEntryNotionalUsd === null) {
    throw new PerformanceError(
      'Completed paper trade opening position evaluation is missing entryNotionalUsd.',
    );
  }
  if (!Object.is(evidence.positionEvaluationEntryNotionalUsd, evidence.entryNotionalUsd)) {
    throw new PerformanceError(
      'Completed paper trade position notional does not match the opening position evaluation.',
    );
  }
  if (evidence.positionEvaluationQuantityTokens === null) {
    throw new PerformanceError(
      'Completed paper trade opening position evaluation is missing quantityTokens.',
    );
  }
  if (!Object.is(evidence.positionEvaluationQuantityTokens, evidence.positionQuantityTokens)) {
    throw new PerformanceError(
      'Completed paper trade position quantity does not match the opening position evaluation.',
    );
  }
  if (evidence.openedAt !== evidence.openingPaperEvaluatedAt) {
    throw new PerformanceError(
      'Completed paper trade openedAt must equal the opening paper evaluatedAt.',
    );
  }
  if (evidence.entryMarketCollectedAt !== evidence.openingPaperMarketCollectedAt) {
    throw new PerformanceError(
      'Completed paper trade entryMarketCollectedAt must equal the opening paper marketCollectedAt.',
    );
  }
  if (evidence.openingPaperEvaluatedAt !== evidence.strategyEvaluatedAt) {
    throw new PerformanceError(
      'Completed paper trade opening paper evaluatedAt must equal the strategy evaluatedAt.',
    );
  }
  if (evidence.openingPaperAsOf !== evidence.strategyAsOf) {
    throw new PerformanceError(
      'Completed paper trade opening paper asOf must equal the strategy asOf.',
    );
  }
}

function assertSourceIdentitiesBindFacts(evidence: CompletedPaperTradeEvidence): void {
  if (
    evidence.positionSourceIdentity.trim() === '' ||
    evidence.exitEvidenceSourceIdentity.trim() === '' ||
    evidence.openingPaperSourceIdentity.trim() === '' ||
    evidence.strategySourceIdentity.trim() === '' ||
    evidence.positionEvaluationSourceIdentity.trim() === ''
  ) {
    throw new PerformanceError(
      'Completed paper trade evidence is missing a required source identity.',
    );
  }

  const expectedPaperIdentity = paperSourceIdentity({
    paperSpecVersion: evidence.openingPaperSpecVersion,
    paperDefinitionFingerprint: evidence.openingPaperDefinitionFingerprint,
    strategySourceIdentity: evidence.strategySourceIdentity,
  });
  if (evidence.openingPaperEvaluationSourceIdentity !== expectedPaperIdentity) {
    throw new PerformanceError(
      'Completed paper trade opening paper source identity does not match the frozen p09 identity of the stored paper facts.',
    );
  }
  if (evidence.openingPaperSourceIdentity !== expectedPaperIdentity) {
    throw new PerformanceError(
      'Completed paper trade paper_positions.opening_paper_source_identity does not match the frozen p09 identity of the stored paper facts.',
    );
  }

  const expectedPositionIdentity = positionEntrySourceIdentity({
    positionSpecVersion: evidence.positionSpecVersion,
    positionDefinitionFingerprint: evidence.positionDefinitionFingerprint,
    openingPaperSourceIdentity: expectedPaperIdentity,
  });
  if (evidence.positionSourceIdentity !== expectedPositionIdentity) {
    throw new PerformanceError(
      'Completed paper trade position source identity does not match the frozen pm10 identity of the stored opening facts.',
    );
  }
  if (evidence.closingPositionSourceIdentity !== expectedPositionIdentity) {
    throw new PerformanceError(
      'Completed paper trade closing_position_source_identity does not match the frozen pm10 identity of the stored opening facts.',
    );
  }
  if (evidence.exitEvaluationPositionSourceIdentity !== expectedPositionIdentity) {
    throw new PerformanceError(
      'Completed paper trade exit evaluation position source identity does not match the frozen pm10 identity of the stored opening facts.',
    );
  }
  if (evidence.positionEvaluationPositionSourceIdentity !== expectedPositionIdentity) {
    throw new PerformanceError(
      'Completed paper trade opening position evaluation position_source_identity does not match the frozen pm10 identity of the stored opening facts.',
    );
  }

  const expectedPositionEvaluationIdentity = positionEvaluationSourceIdentity({
    positionSpecVersion: evidence.positionEvaluationSpecVersion,
    positionDefinitionFingerprint: evidence.positionEvaluationDefinitionFingerprint,
    paperSourceIdentity: expectedPaperIdentity,
    priorOpenPositionSourceIdentity: null,
  });
  if (evidence.positionEvaluationSourceIdentity !== expectedPositionEvaluationIdentity) {
    throw new PerformanceError(
      'Completed paper trade position evaluation source identity does not match the frozen pm10 evaluation identity of the stored opening facts.',
    );
  }

  const expectedMarketIdentity = marketSourceIdentity({
    tokenMint: evidence.tokenMint,
    pairAddress: evidence.positionPairAddress,
    collectedAt: evidence.exitMarketSnapshotCollectedAt,
  });
  const expectedExitEvaluationIdentity = exitEvaluationSourceIdentity({
    exitSpecVersion: evidence.exitEvaluationSpecVersion,
    exitDefinitionFingerprint: evidence.exitEvaluationDefinitionFingerprint,
    positionSourceIdentity: expectedPositionIdentity,
    marketSourceIdentity: expectedMarketIdentity,
  });
  if (evidence.exitEvaluationSourceIdentity !== expectedExitEvaluationIdentity) {
    throw new PerformanceError(
      'Completed paper trade exit evaluation source identity does not match the frozen x11 identity of the stored exit market facts.',
    );
  }

  const expectedExitEvidenceIdentity = exitEvidenceSourceIdentity({
    exitSpecVersion: evidence.exitEvidenceSpecVersion,
    exitDefinitionFingerprint: evidence.exitEvidenceDefinitionFingerprint,
    positionSourceIdentity: expectedPositionIdentity,
    exitEvaluationSourceIdentity: expectedExitEvaluationIdentity,
  });
  if (evidence.exitEvidenceSourceIdentity !== expectedExitEvidenceIdentity) {
    throw new PerformanceError(
      'Completed paper trade exit evidence source identity does not match the frozen x11 identity of the stored exit facts.',
    );
  }
}

function assertNumericFacts(evidence: CompletedPaperTradeEvidence): void {
  requireFiniteNumber(evidence.entryPriceUsd, 'entryPriceUsd');
  requireFiniteNumber(evidence.entryNotionalUsd, 'entryNotionalUsd');
  requireFiniteNumber(evidence.positionQuantityTokens, 'quantityTokens');
  requireFiniteNumber(evidence.exitPriceUsd, 'exitPriceUsd');
  requireFiniteNumber(evidence.exitQuantityTokens, 'exitQuantityTokens');

  if (!(evidence.entryPriceUsd > 0)) {
    throw new PerformanceError(
      'Completed paper trade evidence requires a finite entry price greater than 0.',
    );
  }
  if (!Object.is(evidence.entryNotionalUsd, ENTRY_REFERENCE_NOTIONAL_USD)) {
    throw new PerformanceError(
      'Completed paper trade evidence requires the frozen $100 reference notional. This is not a wallet balance.',
    );
  }
  if (!(evidence.positionQuantityTokens > 0)) {
    throw new PerformanceError(
      'Completed paper trade evidence requires a finite position quantity greater than 0.',
    );
  }
  if (evidence.exitPriceUsd < 0) {
    throw new PerformanceError('Completed paper trade evidence cannot have a negative exit price.');
  }
  if (!(evidence.exitQuantityTokens > 0)) {
    throw new PerformanceError(
      'Completed paper trade evidence requires a finite exit quantity greater than 0.',
    );
  }
  if (!Object.is(evidence.exitQuantityTokens, evidence.positionQuantityTokens)) {
    throw new PerformanceError(
      'Completed paper trade exit quantity does not exactly equal the immutable position quantity.',
    );
  }
  if (evidence.exitEvaluationClosedQuantityTokens === null) {
    throw new PerformanceError(
      'Completed paper trade exit evaluation is missing closedQuantityTokens.',
    );
  }
  if (!Object.is(evidence.exitEvaluationClosedQuantityTokens, evidence.positionQuantityTokens)) {
    throw new PerformanceError(
      'Completed paper trade exit evaluation closed quantity does not exactly equal the immutable position quantity.',
    );
  }
}

function assertPm10StoredQuantityFormula(evidence: CompletedPaperTradeEvidence): void {
  let expectedQuantity: number;
  try {
    expectedQuantity = derivePaperQuantityTokens(evidence.entryPriceUsd);
  } catch (error: unknown) {
    wrapUpstream(error, 'Completed paper trade stored quantity could not be checked against frozen pm10_v1.');
  }

  if (!Object.is(evidence.positionQuantityTokens, expectedQuantity)) {
    throw new PerformanceError(
      'Completed paper trade stored quantity does not exactly equal the frozen pm10_v1 quantity 100 / entryPriceUsd.',
    );
  }
}

function assertExitChain(evidence: CompletedPaperTradeEvidence): void {
  if (evidence.exitEvaluationPositionId !== evidence.positionId) {
    throw new PerformanceError(
      'Completed paper trade exit evaluation references a different position.',
    );
  }
  if (evidence.exitEvaluationSimulatedExitPriceUsd === null) {
    throw new PerformanceError(
      'Completed paper trade exit evaluation is missing simulatedExitPriceUsd.',
    );
  }
  if (!Object.is(evidence.exitEvaluationSimulatedExitPriceUsd, evidence.exitPriceUsd)) {
    throw new PerformanceError(
      'Completed paper trade exit evidence price does not exactly equal the exit evaluation simulated exit price.',
    );
  }
  if (evidence.exitEvaluationObservedPriceUsd === null) {
    throw new PerformanceError(
      'Completed paper trade exit evaluation is missing observedPriceUsd.',
    );
  }
  if (!Object.is(evidence.exitEvaluationObservedPriceUsd, evidence.exitPriceUsd)) {
    throw new PerformanceError(
      'Completed paper trade exit evidence price does not exactly equal the exit evaluation observed price.',
    );
  }
  if (evidence.exitMarketSnapshotPriceUsd === null) {
    throw new PerformanceError(
      'Completed paper trade exit market snapshot is missing priceUsd.',
    );
  }
  if (!Object.is(evidence.exitMarketSnapshotPriceUsd, evidence.exitPriceUsd)) {
    throw new PerformanceError(
      'Completed paper trade exit evidence price does not exactly equal the linked market snapshot priceUsd.',
    );
  }
  if (!Object.is(evidence.exitEvaluationEntryPriceUsd, evidence.entryPriceUsd)) {
    throw new PerformanceError(
      'Completed paper trade exit evaluation entryPriceUsd does not exactly equal the immutable position entry price.',
    );
  }

  let expectedStop: number;
  let expectedTake: number;
  let expectedAge: number;
  try {
    expectedStop = deriveStopTriggerPriceUsd(evidence.entryPriceUsd);
    expectedTake = deriveTakeProfitTriggerPriceUsd(evidence.entryPriceUsd);
    expectedAge = deriveHoldingAgeMs(evidence.exitMarketSnapshotCollectedAt, evidence.openedAt);
  } catch (error: unknown) {
    wrapUpstream(error, 'Completed paper trade exit evaluation does not match frozen x11_v1 formulas.');
  }

  if (!Object.is(evidence.exitEvaluationStopTriggerPriceUsd, expectedStop)) {
    throw new PerformanceError(
      'Completed paper trade exit evaluation stopTriggerPriceUsd does not match the frozen x11_v1 formula.',
    );
  }
  if (!Object.is(evidence.exitEvaluationTakeProfitTriggerPriceUsd, expectedTake)) {
    throw new PerformanceError(
      'Completed paper trade exit evaluation takeProfitTriggerPriceUsd does not match the frozen x11_v1 formula.',
    );
  }
  if (evidence.exitEvaluationHoldingAgeMs !== expectedAge) {
    throw new PerformanceError(
      'Completed paper trade exit evaluation holdingAgeMs does not match frozen x11_v1 marketSnapshot.collectedAt - openedAt.',
    );
  }
  if (evidence.exitEvaluationMaxHoldingMs !== EXIT_MAX_HOLDING_MS) {
    throw new PerformanceError(
      'Completed paper trade exit evaluation maxHoldingMs must be 21600000.',
    );
  }
}

function assertTiming(evidence: CompletedPaperTradeEvidence): void {
  const openedAtMs = requireUtcMillis(evidence.openedAt, 'openedAt');
  const exitedAtMs = requireUtcMillis(evidence.exitedAt, 'exitedAt');
  requireUtcMillis(evidence.entryMarketCollectedAt, 'entryMarketCollectedAt');
  requireUtcMillis(evidence.exitMarketCollectedAt, 'exitMarketCollectedAt');
  requireUtcMillis(evidence.exitEvaluationMarketCollectedAt, 'exit evaluation marketCollectedAt');
  requireUtcMillis(evidence.exitEvaluationEvaluatedAt, 'exit evaluation evaluatedAt');
  requireUtcMillis(evidence.exitEvaluationAsOf, 'exit evaluation asOf');
  requireUtcMillis(evidence.exitMarketSnapshotCollectedAt, 'exit market snapshot collectedAt');
  requireUtcMillis(evidence.openingPaperEvaluatedAt, 'opening paper evaluatedAt');
  requireUtcMillis(evidence.openingPaperAsOf, 'opening paper asOf');
  requireUtcMillis(evidence.openingPaperMarketCollectedAt, 'opening paper marketCollectedAt');
  requireUtcMillis(evidence.strategyEvaluatedAt, 'strategy evaluatedAt');
  requireUtcMillis(evidence.strategyAsOf, 'strategy asOf');

  if (exitedAtMs < openedAtMs) {
    throw new PerformanceError('Completed paper trade evidence has exitedAt before openedAt.');
  }
  if (
    evidence.exitedAt !== evidence.exitMarketCollectedAt ||
    evidence.exitedAt !== evidence.exitEvaluationEvaluatedAt ||
    evidence.exitedAt !== evidence.exitEvaluationAsOf ||
    evidence.exitedAt !== evidence.exitEvaluationMarketCollectedAt ||
    evidence.exitedAt !== evidence.exitMarketSnapshotCollectedAt
  ) {
    throw new PerformanceError(
      'Completed paper trade x11 timestamps must be exactly equal: exitedAt, exitMarketCollectedAt, asOf, evaluatedAt, and the linked snapshot collectedAt.',
    );
  }
}

function assertCloseAction(evidence: CompletedPaperTradeEvidence): void {
  if (evidence.exitAction !== 'close_position') {
    throw new PerformanceError(
      'Completed paper trade evidence requires exit evaluation action close_position. A no_change evaluation is not a completed trade.',
    );
  }
  if ((REJECTED_EXIT_REASONS as readonly string[]).includes(evidence.exitReason)) {
    throw new PerformanceError(
      `Completed paper trade evidence cannot use exit reason ${evidence.exitReason}.`,
    );
  }
  if (!(CLOSED_EXIT_REASONS as readonly string[]).includes(evidence.exitReason)) {
    throw new PerformanceError(
      `Completed paper trade evidence has an unknown close reason ${evidence.exitReason}.`,
    );
  }
}

function assertCurrentOpenContradiction(evidence: CompletedPaperTradeEvidence): void {
  if (
    evidence.openPointerTokenId !== null &&
    evidence.openPointerTokenId !== evidence.positionTokenId
  ) {
    throw new PerformanceError(
      'Completed paper trade evidence has a paper_open_positions pointer whose token_id does not match the closed position.',
    );
  }
  if (evidence.currentlyOpen) {
    throw new PerformanceError(
      'Completed paper trade evidence is still marked as the current paper_open_positions row.',
    );
  }
}

function wrapUpstream(error: unknown, message: string): never {
  if (error instanceof PerformanceError) {
    throw error;
  }
  if (error instanceof PositionError || error instanceof ExitError) {
    throw new PerformanceError(message, { cause: error });
  }
  throw error;
}
