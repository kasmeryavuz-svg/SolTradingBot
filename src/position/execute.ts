import type { EnvSource } from '../config/types.js';
import { generateFeatureVector } from '../features/engine.js';
import { collectLiveFeatureInputs, createLiveFeatureProviders } from '../features/live.js';
import { evaluatePaperAction } from '../paper/evaluator.js';
import { createSqlitePersistenceRepository } from '../persistence/sqlite/index.js';
import type { RecordedPositionBundle, StoredOpenPaperPosition } from '../persistence/types.js';
import { evaluateStrategy } from '../strategy/evaluator.js';
import { preparePositionStepCommand, requirePositionMintArgument } from './command.js';
import { evaluatePositionAction } from './evaluator.js';
import type { PositionEvaluation } from './types.js';

export type PositionStepDependencies = {
  createProviders?: typeof createLiveFeatureProviders;
  collectInputs?: typeof collectLiveFeatureInputs;
  createRepository?: typeof createSqlitePersistenceRepository;
};

export async function executePositionStep(
  source: EnvSource,
  argv: readonly string[],
  dependencies: PositionStepDependencies = {},
): Promise<{
  positionEvaluation: PositionEvaluation;
  recorded: RecordedPositionBundle;
  currentOpenPosition: StoredOpenPaperPosition | null;
}> {
  const config = preparePositionStepCommand(source);
  const tokenMint = requirePositionMintArgument(argv, 'position:step');
  const createProviders = dependencies.createProviders ?? createLiveFeatureProviders;
  const collectInputs = dependencies.collectInputs ?? collectLiveFeatureInputs;
  const createRepository = dependencies.createRepository ?? createSqlitePersistenceRepository;

  const providers = createProviders({
    rpcUrl: config.solana.rpcUrl,
    riskTimeoutMs: config.risk.timeoutMs,
    marketTimeoutMs: config.marketData.timeoutMs,
    commitment: config.risk.commitment,
  });
  const repository = createRepository(config.database);

  try {
    repository.initialize();
    const collected = await collectInputs({
      tokenMint,
      marketProvider: providers.marketProvider,
      riskProvider: providers.riskProvider,
      commitment: config.risk.commitment,
    });
    const previousMarket = repository.getPreviousMarketSnapshot(
      tokenMint,
      collected.inputs.market.pairAddress,
      collected.inputs.market.collectedAt,
    );
    const vector = generateFeatureVector(
      {
        market: collected.inputs.market,
        previousMarket,
        risk: collected.inputs.risk,
        riskUnavailableReason: collected.inputs.riskUnavailableReason,
        asOf: collected.inputs.asOf,
      },
      { generatedAt: collected.generatedAt },
    );
    const strategyEvaluation = evaluateStrategy(vector, { evaluatedAt: collected.generatedAt });
    const paperEvaluation = evaluatePaperAction({
      marketSnapshot: collected.inputs.market,
      featureVector: vector,
      strategyEvaluation,
    });
    const priorOpenPosition = repository.getOpenPaperPosition(tokenMint);
    const positionEvaluation = evaluatePositionAction({
      paperEvaluation,
      currentOpenPosition: priorOpenPosition,
    });
    const recorded = repository.recordPositionBundle({
      marketSnapshot: collected.inputs.market,
      riskReport: collected.riskReport,
      featureVector: vector,
      strategyEvaluation,
      paperEvaluation,
      priorOpenPosition,
      positionEvaluation,
    });
    const currentOpenPosition = repository.getOpenPaperPosition(tokenMint);

    return { positionEvaluation, recorded, currentOpenPosition };
  } finally {
    repository.close();
  }
}
