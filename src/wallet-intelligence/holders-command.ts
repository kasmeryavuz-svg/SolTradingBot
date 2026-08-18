import { config as loadDotenv } from 'dotenv';
import { printWalletIntelligenceFailure } from './cli-error.js';
import {
  createConfiguredWalletIntelligenceProvider,
  prepareWalletIntelligenceNetworkCommand,
  requireWalletIntelligenceMintArgument,
} from './command.js';
import { runWalletIntelligenceHolders } from './engine.js';
import { formatWalletIntelligenceHoldersLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const appConfig = prepareWalletIntelligenceNetworkCommand(process.env);
  const tokenMint = requireWalletIntelligenceMintArgument(process.argv, 'wallet-intel:holders');
  const result = await runWalletIntelligenceHolders({
    tokenMint,
    provider: createConfiguredWalletIntelligenceProvider(appConfig),
  });
  for (const line of formatWalletIntelligenceHoldersLines(result)) {
    console.log(line);
  }
} catch (error: unknown) {
  printWalletIntelligenceFailure(error);
}
