import { config as loadDotenv } from 'dotenv';
import { prepareFeatureCheckCommand, requireFeatureMintArgument } from './command.js';
import { generateFeatureVector } from './engine.js';
import { formatFeatureCheckLines } from './format.js';
import { collectLiveFeatureInputs, createLiveFeatureProviders } from './live.js';

loadDotenv({ quiet: true });

try {
  const config = prepareFeatureCheckCommand(process.env);
  const tokenMint = requireFeatureMintArgument(process.argv, 'feature:check');
  const providers = createLiveFeatureProviders({
    rpcUrl: config.solana.rpcUrl,
    riskTimeoutMs: config.risk.timeoutMs,
    marketTimeoutMs: config.marketData.timeoutMs,
    commitment: config.risk.commitment,
  });
  const collected = await collectLiveFeatureInputs({
    tokenMint,
    marketProvider: providers.marketProvider,
    riskProvider: providers.riskProvider,
    commitment: config.risk.commitment,
  });
  const vector = generateFeatureVector(collected.inputs, { generatedAt: collected.generatedAt });

  for (const line of formatFeatureCheckLines(vector, {
    riskUnavailableDetail: collected.inputs.riskUnavailableReason,
  })) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
