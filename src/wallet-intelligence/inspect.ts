import { config as loadDotenv } from 'dotenv';
import { printWalletIntelligenceFailure } from './cli-error.js';
import {
  createConfiguredWalletIntelligenceProvider,
  prepareWalletIntelligenceNetworkCommand,
  requireWalletIntelligenceMintArgument,
} from './command.js';
import { runWalletIntelligenceScan } from './engine.js';
import { formatWalletIntelligenceScanLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const appConfig = prepareWalletIntelligenceNetworkCommand(process.env);
  const tokenMint = requireWalletIntelligenceMintArgument(process.argv, 'wallet-intel:inspect');
  const scan = await runWalletIntelligenceScan({
    tokenMint,
    provider: createConfiguredWalletIntelligenceProvider(appConfig),
  });
  for (const line of formatWalletIntelligenceScanLines(scan)) {
    console.log(line);
  }
} catch (error: unknown) {
  printWalletIntelligenceFailure(error);
}
