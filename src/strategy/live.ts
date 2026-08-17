import { generateFeatureVector } from '../features/engine.js';
import { collectLiveFeatureInputs } from '../features/live.js';
import type { MarketDataProvider } from '../market-data/provider.js';
import type { MarketSnapshot } from '../market-data/types.js';
import type { RiskDataProvider } from '../risk/provider.js';
import type { TokenRiskReport } from '../risk/types.js';
import type { FeatureVector } from '../features/types.js';
import { evaluateStrategy } from './evaluator.js';
import type { StrategyEvaluation } from './types.js';

export async function evaluateLiveStrategy(options: {
  tokenMint: string;
  marketProvider: MarketDataProvider;
  riskProvider: RiskDataProvider;
  commitment: TokenRiskReport['commitment'];
  previousMarket?: MarketSnapshot | null;
  now?: () => Date;
}): Promise<{
  vector: FeatureVector;
  evaluation: StrategyEvaluation;
  riskUnavailableReason: string | null;
}> {
  const collected = await collectLiveFeatureInputs(options);
  const vector = generateFeatureVector(collected.inputs, { generatedAt: collected.generatedAt });
  const evaluation = evaluateStrategy(vector, { evaluatedAt: collected.generatedAt });
  return {
    vector,
    evaluation,
    riskUnavailableReason: collected.inputs.riskUnavailableReason,
  };
}
