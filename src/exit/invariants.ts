import { FeatureEngineError } from '../features/types.js';
import { requireUtcTimestamp } from '../features/numbers.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { POSITION_SPEC_VERSION } from '../position/constants.js';
import { POSITION_DEFINITION_FINGERPRINT } from '../position/identity.js';
import { assertOpenPaperPosition } from '../position/invariants.js';
import { PositionError, type OpenPaperPosition } from '../position/types.js';
import {
  EXIT_MAX_HOLDING_MS,
  EXIT_SPEC_NAME,
  EXIT_SPEC_VERSION,
  EXIT_STOP_LOSS_BPS,
  EXIT_TAKE_PROFIT_BPS,
} from './constants.js';
import {
  EXIT_DEFINITION_FINGERPRINT,
  exitEvaluationSourceIdentity,
  marketSourceIdentity,
} from './identity.js';
import { ExitError, type ExitEvaluation } from './types.js';

export function wrapExitSourceError(error: unknown): never {
  if (error instanceof ExitError) {
    throw error;
  }
  if (error instanceof PositionError || error instanceof FeatureEngineError) {
    throw new ExitError(error.message, { cause: error });
  }
  throw error;
}

export function assertFrozenOpenPaperPosition(position: OpenPaperPosition): void {
  try {
    assertOpenPaperPosition(position, position.tokenMint);
  } catch (error: unknown) {
    wrapExitSourceError(error);
  }
  if ((position.chain as string) !== 'solana') {
    throw new ExitError('Exit evaluation requires a solana open paper position.');
  }
  if (position.positionSpecVersion !== POSITION_SPEC_VERSION) {
    throw new ExitError('Exit evaluation requires position spec pm10_v1.');
  }
  if (position.positionDefinitionFingerprint !== POSITION_DEFINITION_FINGERPRINT) {
    throw new ExitError('Exit evaluation requires the frozen pm10_v1 position definition fingerprint.');
  }
  if (position.pairAddress.trim() === '') {
    throw new ExitError('Exit evaluation requires a non-empty opening pair address.');
  }
  if (position.openingPaperSourceIdentity.trim() === '') {
    throw new ExitError('Exit evaluation requires stored opening paper source identity.');
  }
}

export function assertExitMarketSnapshot(
  snapshot: MarketSnapshot,
  position: OpenPaperPosition,
): void {
  if ((snapshot.chain as string) !== 'solana') {
    throw new ExitError('Exit market snapshot chain must be solana.');
  }
  if (snapshot.tokenMint !== position.tokenMint) {
    throw new ExitError('Exit market snapshot token mint does not match the open paper position.');
  }
  if (snapshot.pairAddress !== position.pairAddress) {
    throw new ExitError(
      'Exit market snapshot pair does not match the opening pair. Another pair cannot be substituted.',
    );
  }
  if (snapshot.pairAddress.trim() === '') {
    throw new ExitError('Exit market snapshot pair address must be non-empty.');
  }

  const collectedMs = utcMillis(snapshot.collectedAt, 'market.collectedAt');
  const openedMs = utcMillis(position.openedAt, 'openPosition.openedAt');
  if (collectedMs < openedMs) {
    throw new ExitError('Exit market snapshot collectedAt must be at or after the position openedAt.');
  }

  assertObservedExitPrice(snapshot.priceUsd);
}

export function assertObservedExitPrice(priceUsd: number | null): void {
  if (priceUsd === null) {
    return;
  }
  if (typeof priceUsd !== 'number' || !Number.isFinite(priceUsd) || priceUsd < 0) {
    throw new ExitError('Exit observed price must be null or a finite number greater than or equal to 0.');
  }
}

export function deriveStopTriggerPriceUsd(entryPriceUsd: number): number {
  if (typeof entryPriceUsd !== 'number' || !Number.isFinite(entryPriceUsd) || entryPriceUsd <= 0) {
    throw new ExitError('Exit stop trigger requires a finite entryPriceUsd greater than 0.');
  }
  const trigger = entryPriceUsd * (1 - EXIT_STOP_LOSS_BPS / 10_000);
  if (typeof trigger !== 'number' || !Number.isFinite(trigger) || trigger < 0) {
    throw new ExitError('Derived stop-loss trigger price must be a finite number greater than or equal to 0.');
  }
  return trigger;
}

export function deriveTakeProfitTriggerPriceUsd(entryPriceUsd: number): number {
  if (typeof entryPriceUsd !== 'number' || !Number.isFinite(entryPriceUsd) || entryPriceUsd <= 0) {
    throw new ExitError('Exit take-profit trigger requires a finite entryPriceUsd greater than 0.');
  }
  const trigger = entryPriceUsd * (1 + EXIT_TAKE_PROFIT_BPS / 10_000);
  if (typeof trigger !== 'number' || !Number.isFinite(trigger) || trigger <= 0) {
    throw new ExitError('Derived take-profit trigger price must be a finite number greater than 0.');
  }
  return trigger;
}

function utcMillis(value: string, field: string): number {
  try {
    return requireUtcTimestamp(value, field);
  } catch (error: unknown) {
    wrapExitSourceError(error);
  }
}

export function deriveHoldingAgeMs(collectedAt: string, openedAt: string): number {
  const collectedMs = utcMillis(collectedAt, 'market.collectedAt');
  const openedMs = utcMillis(openedAt, 'openPosition.openedAt');
  const holdingAgeMs = collectedMs - openedMs;
  if (!Number.isSafeInteger(holdingAgeMs) || holdingAgeMs < 0) {
    throw new ExitError('holdingAgeMs must be a non-negative safe integer millisecond difference.');
  }
  return holdingAgeMs;
}

export function exitEvaluationsSemanticallyEqual(left: ExitEvaluation, right: ExitEvaluation): boolean {
  return (
    (left.chain as string) === (right.chain as string) &&
    left.tokenMint === right.tokenMint &&
    left.exitSpecVersion === right.exitSpecVersion &&
    left.exitSpecName === right.exitSpecName &&
    left.exitDefinitionFingerprint === right.exitDefinitionFingerprint &&
    left.positionSpecVersion === right.positionSpecVersion &&
    left.positionDefinitionFingerprint === right.positionDefinitionFingerprint &&
    left.positionSourceIdentity === right.positionSourceIdentity &&
    left.pairAddress === right.pairAddress &&
    left.asOf === right.asOf &&
    left.evaluatedAt === right.evaluatedAt &&
    left.marketCollectedAt === right.marketCollectedAt &&
    Object.is(left.observedPriceUsd, right.observedPriceUsd) &&
    Object.is(left.entryPriceUsd, right.entryPriceUsd) &&
    Object.is(left.stopTriggerPriceUsd, right.stopTriggerPriceUsd) &&
    Object.is(left.takeProfitTriggerPriceUsd, right.takeProfitTriggerPriceUsd) &&
    left.holdingAgeMs === right.holdingAgeMs &&
    left.maxHoldingMs === right.maxHoldingMs &&
    left.exitAction === right.exitAction &&
    left.exitReason === right.exitReason &&
    Object.is(left.simulatedExitPriceUsd, right.simulatedExitPriceUsd) &&
    Object.is(left.closedQuantityTokens, right.closedQuantityTokens) &&
    left.sourceIdentity === right.sourceIdentity
  );
}

export function assertExitEvaluationInvariants(
  evaluation: ExitEvaluation,
  sources: {
    openPosition: OpenPaperPosition;
    marketSnapshot: MarketSnapshot;
  },
): void {
  assertFrozenOpenPaperPosition(sources.openPosition);
  assertExitMarketSnapshot(sources.marketSnapshot, sources.openPosition);

  if ((evaluation.chain as string) !== 'solana') {
    throw new ExitError('Exit evaluation chain must be solana.');
  }
  if (evaluation.exitSpecVersion !== EXIT_SPEC_VERSION) {
    throw new ExitError('Exit evaluation spec version must be x11_v1.');
  }
  if (evaluation.exitSpecName !== EXIT_SPEC_NAME) {
    throw new ExitError('Exit evaluation spec name must be fixed_threshold_full_close_baseline.');
  }
  if (evaluation.exitDefinitionFingerprint !== EXIT_DEFINITION_FINGERPRINT) {
    throw new ExitError('Exit definition fingerprint does not match the current x11_v1 definition.');
  }
  if (evaluation.tokenMint !== sources.openPosition.tokenMint) {
    throw new ExitError('Exit evaluation token mint does not match the open paper position.');
  }
  if (evaluation.positionSpecVersion !== POSITION_SPEC_VERSION) {
    throw new ExitError('Exit evaluation position spec version must be pm10_v1.');
  }
  if (evaluation.positionDefinitionFingerprint !== POSITION_DEFINITION_FINGERPRINT) {
    throw new ExitError('Exit evaluation position definition fingerprint does not match pm10_v1.');
  }
  if (evaluation.positionSourceIdentity !== sources.openPosition.positionSourceIdentity) {
    throw new ExitError('Exit evaluation positionSourceIdentity does not match the open paper position.');
  }
  if (evaluation.pairAddress !== sources.openPosition.pairAddress) {
    throw new ExitError('Exit evaluation pairAddress does not match the opening pair.');
  }
  if (
    evaluation.asOf !== sources.marketSnapshot.collectedAt ||
    evaluation.evaluatedAt !== sources.marketSnapshot.collectedAt ||
    evaluation.marketCollectedAt !== sources.marketSnapshot.collectedAt
  ) {
    throw new ExitError('Exit evaluation timestamps must equal the exact market snapshot collectedAt.');
  }
  if (!Object.is(evaluation.entryPriceUsd, sources.openPosition.entryPriceUsd)) {
    throw new ExitError('Exit evaluation entryPriceUsd must equal the open position entryPriceUsd.');
  }

  const expectedStop = deriveStopTriggerPriceUsd(sources.openPosition.entryPriceUsd);
  const expectedTake = deriveTakeProfitTriggerPriceUsd(sources.openPosition.entryPriceUsd);
  const expectedAge = deriveHoldingAgeMs(sources.marketSnapshot.collectedAt, sources.openPosition.openedAt);
  if (!Object.is(evaluation.stopTriggerPriceUsd, expectedStop)) {
    throw new ExitError('Exit evaluation stopTriggerPriceUsd does not match the x11_v1 formula.');
  }
  if (!Object.is(evaluation.takeProfitTriggerPriceUsd, expectedTake)) {
    throw new ExitError('Exit evaluation takeProfitTriggerPriceUsd does not match the x11_v1 formula.');
  }
  if (evaluation.holdingAgeMs !== expectedAge) {
    throw new ExitError('Exit evaluation holdingAgeMs does not match marketSnapshot.collectedAt - openedAt.');
  }
  if (evaluation.maxHoldingMs !== EXIT_MAX_HOLDING_MS) {
    throw new ExitError('Exit evaluation maxHoldingMs must be 21600000.');
  }
  if (!Object.is(evaluation.observedPriceUsd, sources.marketSnapshot.priceUsd)) {
    throw new ExitError('Exit evaluation observedPriceUsd must equal the exact opening-pair snapshot priceUsd.');
  }

  const expectedIdentity = exitEvaluationSourceIdentity({
    exitSpecVersion: EXIT_SPEC_VERSION,
    exitDefinitionFingerprint: EXIT_DEFINITION_FINGERPRINT,
    positionSourceIdentity: sources.openPosition.positionSourceIdentity,
    marketSourceIdentity: marketSourceIdentity({
      tokenMint: sources.marketSnapshot.tokenMint,
      pairAddress: sources.marketSnapshot.pairAddress,
      collectedAt: sources.marketSnapshot.collectedAt,
    }),
  });
  if (evaluation.sourceIdentity !== expectedIdentity) {
    throw new ExitError('Exit evaluation source identity does not match the canonical x11_v1 identity.');
  }

  if (evaluation.exitAction === 'close_position') {
    if (
      evaluation.exitReason !== 'stop_loss_threshold' &&
      evaluation.exitReason !== 'take_profit_threshold' &&
      evaluation.exitReason !== 'max_holding_time'
    ) {
      throw new ExitError('CLOSE_POSITION must use a stop, take-profit, or max-holding reason.');
    }
    if (evaluation.observedPriceUsd === null) {
      throw new ExitError('CLOSE_POSITION requires a finite observed exit price greater than or equal to 0.');
    }
    if (!Object.is(evaluation.simulatedExitPriceUsd, evaluation.observedPriceUsd)) {
      throw new ExitError('CLOSE_POSITION simulatedExitPriceUsd must equal the observed opening-pair price.');
    }
    if (!Object.is(evaluation.closedQuantityTokens, sources.openPosition.quantityTokens)) {
      throw new ExitError('CLOSE_POSITION closedQuantityTokens must equal the exact open position quantity.');
    }
    return;
  }

  if ((evaluation.exitAction as string) !== 'no_change') {
    throw new ExitError('Unknown x11_v1 exit action.');
  }
  if (evaluation.simulatedExitPriceUsd !== null || evaluation.closedQuantityTokens !== null) {
    throw new ExitError('NO_CHANGE exit evaluations must not look like a close.');
  }
  if (evaluation.exitReason === 'market_price_unavailable') {
    if (evaluation.observedPriceUsd !== null) {
      throw new ExitError('market_price_unavailable requires a null observed price.');
    }
    return;
  }
  if (evaluation.exitReason !== 'exit_conditions_not_met') {
    throw new ExitError('NO_CHANGE must use market_price_unavailable or exit_conditions_not_met.');
  }
  if (evaluation.observedPriceUsd === null) {
    throw new ExitError('exit_conditions_not_met requires a finite observed price greater than or equal to 0.');
  }
}
