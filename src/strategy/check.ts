import { config as loadDotenv } from 'dotenv';
import { createLiveFeatureProviders } from '../features/live.js';
import { prepareStrategyCheckCommand, requireStrategyMintArgument } from './command.js';
import { formatStrategyCheckLines } from './format.js';
import { evaluateLiveStrategy } from './live.js';

loadDotenv({ quiet: true });

try {
  const config = prepareStrategyCheckCommand(process.env);
  const tokenMint = requireStrategyMintArgument(process.argv, 'strategy:check');
  const providers = createLiveFeatureProviders({
    rpcUrl: config.solana.rpcUrl,
    riskTimeoutMs: config.risk.timeoutMs,
    marketTimeoutMs: config.marketData.timeoutMs,
    commitment: config.risk.commitment,
  });
  const live = await evaluateLiveStrategy({
    tokenMint,
    marketProvider: providers.marketProvider,
    riskProvider: providers.riskProvider,
    commitment: config.risk.commitment,
  });

  for (const line of formatStrategyCheckLines(live.vector, live.evaluation, {
    riskUnavailableDetail: live.riskUnavailableReason,
  })) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
