import { evaluatePaperAction } from '../src/paper/evaluator.js';
import type { PaperBundle } from '../src/persistence/types.js';
import { evaluateStrategy } from '../src/strategy/evaluator.js';
import type { FeatureVector } from '../src/features/types.js';
import type { MarketSnapshot } from '../src/market-data/types.js';
import type { TokenRiskReport } from '../src/risk/types.js';
import {
  passingBundle,
  passingRisk,
  passingSnapshot,
  passingVector,
  withUnavailable,
} from './strategy-fixtures.js';
import { FEATURE_AS_OF, T_09_55, T_10_00 } from './feature-fixtures.js';
import { USDC_MINT } from '../src/config/index.js';

export function paperBundle(overrides: {
  marketSnapshot?: MarketSnapshot;
  riskReport?: TokenRiskReport | null;
  featureVector?: FeatureVector;
} = {}): PaperBundle {
  const bundle = passingBundle(overrides);
  return {
    ...bundle,
    paperEvaluation: evaluatePaperAction({
      marketSnapshot: bundle.marketSnapshot,
      featureVector: bundle.featureVector,
      strategyEvaluation: bundle.strategyEvaluation,
    }),
  };
}

export function noEntryPaperBundle(): PaperBundle {
  return paperBundle({
    marketSnapshot: passingSnapshot({ liquidityUsd: 1 }),
  });
}

export function insufficientPaperBundle(): PaperBundle {
  const marketSnapshot = passingSnapshot();
  const riskReport = passingRisk();
  const featureVector = withUnavailable(
    passingVector({
      market: marketSnapshot,
      risk: riskReport,
      previousMarket: null,
    }),
    'trades_5m',
  );
  const strategyEvaluation = evaluateStrategy(featureVector, { evaluatedAt: featureVector.generatedAt });
  return {
    marketSnapshot,
    riskReport,
    featureVector,
    strategyEvaluation,
    paperEvaluation: evaluatePaperAction({
      marketSnapshot,
      featureVector,
      strategyEvaluation,
    }),
  };
}

export function paperBundleAt(
  asOf: string,
  overrides: { tokenMint?: string; pairAddress?: string; priceUsd?: number; scannedAt?: string } = {},
): PaperBundle {
  const marketSnapshot = passingSnapshot({
    ...(overrides.tokenMint === undefined ? {} : { tokenMint: overrides.tokenMint }),
    ...(overrides.pairAddress === undefined ? {} : { pairAddress: overrides.pairAddress }),
    ...(overrides.priceUsd === undefined ? {} : { priceUsd: overrides.priceUsd }),
    collectedAt: asOf,
  });
  const riskReport = passingRisk({
    ...(overrides.tokenMint === undefined ? {} : { tokenMint: overrides.tokenMint }),
    scannedAt: overrides.scannedAt ?? (asOf < T_09_55 ? asOf : T_09_55),
  });
  const featureVector = passingVector(
    {
      market: marketSnapshot,
      risk: riskReport,
      previousMarket: null,
      asOf,
    },
    { generatedAt: asOf },
  );
  const strategyEvaluation = evaluateStrategy(featureVector, { evaluatedAt: asOf });
  return {
    marketSnapshot,
    riskReport,
    featureVector,
    strategyEvaluation,
    paperEvaluation: evaluatePaperAction({
      marketSnapshot,
      featureVector,
      strategyEvaluation,
    }),
  };
}

export { FEATURE_AS_OF, T_10_00, USDC_MINT, passingSnapshot, passingVector };

export function nextRepresentableNumber(value: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  view.setBigUint64(0, view.getBigUint64(0) + 1n);
  return view.getFloat64(0);
}

export function previousRepresentableNumber(value: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  view.setBigUint64(0, view.getBigUint64(0) - 1n);
  return view.getFloat64(0);
}
