import { config as loadDotenv } from 'dotenv';
import { generateFeatureVector } from '../features/engine.js';
import { collectLiveFeatureInputs, createLiveFeatureProviders } from '../features/live.js';
import { createSqlitePersistenceRepository } from '../persistence/sqlite/index.js';
import { prepareStrategyRecordCommand, requireStrategyMintArgument } from './command.js';
import { evaluateStrategy } from './evaluator.js';
import { formatStrategyRecordLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = prepareStrategyRecordCommand(process.env);
  const tokenMint = requireStrategyMintArgument(process.argv, 'strategy:record');
  const providers = createLiveFeatureProviders({
    rpcUrl: config.solana.rpcUrl,
    riskTimeoutMs: config.risk.timeoutMs,
    marketTimeoutMs: config.marketData.timeoutMs,
    commitment: config.risk.commitment,
  });
  const repository = createSqlitePersistenceRepository(config.database);

  try {
    repository.initialize();
    const collected = await collectLiveFeatureInputs({
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
    const evaluation = evaluateStrategy(vector, { evaluatedAt: collected.generatedAt });
    const recorded = repository.recordStrategyBundle({
      marketSnapshot: collected.inputs.market,
      riskReport: collected.inputs.risk,
      featureVector: vector,
      strategyEvaluation: evaluation,
    });

    for (const line of formatStrategyRecordLines(vector, evaluation, recorded)) {
      console.log(line);
    }
  } finally {
    repository.close();
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
