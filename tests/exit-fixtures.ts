import { evaluateExitAction } from '../src/exit/evaluator.js';
import type { ExitBundle } from '../src/persistence/types.js';
import type { MarketSnapshot } from '../src/market-data/types.js';
import type { OpenPaperPosition } from '../src/position/types.js';
import { sampleSnapshot, T_10_10 } from './feature-fixtures.js';
import { passingSnapshot } from './strategy-fixtures.js';
import { openedPositionFrom, positionBundle, positionBundleAt } from './position-fixtures.js';

export const EXIT_ENTRY_PRICE_USD = 100;
export const EXIT_STOP_PRICE_USD = EXIT_ENTRY_PRICE_USD * (1 - 1000 / 10_000);
export const EXIT_TAKE_PRICE_USD = EXIT_ENTRY_PRICE_USD * (1 + 2000 / 10_000);

export function addMs(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

export function openPositionBundle(overrides: Parameters<typeof positionBundle>[0] = {}) {
  return positionBundle({
    marketSnapshot: passingSnapshot({ priceUsd: EXIT_ENTRY_PRICE_USD }),
    ...overrides,
  });
}

export function laterOpenPositionBundle() {
  return positionBundleAt(T_10_10, { priceUsd: EXIT_ENTRY_PRICE_USD });
}

export function openedExitPosition(overrides: Partial<OpenPaperPosition> = {}): OpenPaperPosition {
  const opened = openedPositionFrom(openPositionBundle());
  return { ...opened, ...overrides };
}

export function exitMarketSnapshot(
  position: OpenPaperPosition,
  overrides: Partial<MarketSnapshot> = {},
): MarketSnapshot {
  return sampleSnapshot({
    tokenMint: position.tokenMint,
    pairAddress: position.pairAddress,
    priceUsd: EXIT_ENTRY_PRICE_USD,
    collectedAt: position.openedAt,
    ...overrides,
  });
}

export function evaluatedExitBundle(
  position: OpenPaperPosition,
  marketSnapshot: MarketSnapshot,
): ExitBundle {
  return {
    openPosition: {
      id: 1,
      positionEvaluationId: 1,
      openingPaperEvaluationId: 1,
      ...position,
    },
    marketSnapshot,
    exitEvaluation: evaluateExitAction({ openPosition: position, marketSnapshot }),
  };
}

export {
  nextRepresentableNumber,
  previousRepresentableNumber,
  positionBundle,
  positionBundleAt,
  openedPositionFrom,
} from './position-fixtures.js';
export { OTHER_PAIR, PAIR_ADDRESS, T_10_00, T_10_05, T_10_10, T_10_15, sampleSnapshot } from './feature-fixtures.js';
export { passingSnapshot } from './strategy-fixtures.js';
