import { config as loadDotenv } from 'dotenv';
import { createSqlitePersistenceRepository } from '../persistence/sqlite/index.js';
import { prepareFeatureRecordCommand, requireFeatureMintArgument } from './command.js';
import { generateFeatureVector } from './engine.js';
import { formatFeatureRecordLines } from './format.js';
import { collectLiveFeatureInputs, createLiveFeatureProviders } from './live.js';

loadDotenv({ quiet: true });

try {
  const config = prepareFeatureRecordCommand(process.env);
  const tokenMint = requireFeatureMintArgument(process.argv, 'feature:record');
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
    const recorded = repository.recordFeatureBundle({
      marketSnapshot: collected.inputs.market,
      riskReport: collected.inputs.risk,
      featureVector: vector,
    });

    for (const line of formatFeatureRecordLines(vector, recorded)) {
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
