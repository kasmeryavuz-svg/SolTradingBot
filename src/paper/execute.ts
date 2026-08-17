import type { EnvSource } from '../config/types.js';
import { generateFeatureVector } from '../features/engine.js';
import { collectLiveFeatureInputs, createLiveFeatureProviders } from '../features/live.js';
import { createSqlitePersistenceRepository } from '../persistence/sqlite/index.js';
import type { RecordedPaperBundle } from '../persistence/types.js';
import { evaluateStrategy } from '../strategy/evaluator.js';
import { preparePaperStepCommand, requirePaperMintArgument } from './command.js';
import { evaluatePaperAction } from './evaluator.js';
import type { PaperEvaluation } from './types.js';

export type PaperStepDependencies = {
  createProviders?: typeof createLiveFeatureProviders;
  collectInputs?: typeof collectLiveFeatureInputs;
  createRepository?: typeof createSqlitePersistenceRepository;
};

export async function executePaperStep(
  source: EnvSource,
  argv: readonly string[],
  dependencies: PaperStepDependencies = {},
): Promise<{ paperEvaluation: PaperEvaluation; recorded: RecordedPaperBundle }> {
  const config = preparePaperStepCommand(source);
  const tokenMint = requirePaperMintArgument(argv, 'paper:step');
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
    const recorded = repository.recordPaperBundle({
      marketSnapshot: collected.inputs.market,
      riskReport: collected.riskReport,
      featureVector: vector,
      strategyEvaluation,
      paperEvaluation,
    });

    return { paperEvaluation, recorded };
  } finally {
    repository.close();
  }
}
