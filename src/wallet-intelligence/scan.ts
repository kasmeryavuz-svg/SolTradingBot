import { config as loadDotenv } from 'dotenv';
import { printWalletIntelligenceFailure } from './cli-error.js';
import {
  createConfiguredWalletIntelligenceProvider,
  openWalletIntelligenceDatabase,
  prepareWalletIntelligenceScanCommand,
  requireWalletIntelligenceMintArgument,
} from './command.js';
import { runWalletIntelligenceScan } from './engine.js';
import { formatWalletIntelligenceScanLines } from './format.js';
import { persistWalletIntelligenceScan } from './persistence.js';

loadDotenv({ quiet: true });

try {
  const appConfig = prepareWalletIntelligenceScanCommand(process.env);
  const tokenMint = requireWalletIntelligenceMintArgument(process.argv, 'wallet-intel:scan');
  const scan = await runWalletIntelligenceScan({
    tokenMint,
    provider: createConfiguredWalletIntelligenceProvider(appConfig),
  });
  const database = openWalletIntelligenceDatabase(appConfig, 'write');
  try {
    const stored = persistWalletIntelligenceScan(database, scan);
    for (const line of formatWalletIntelligenceScanLines(scan, { persistedId: stored.id })) {
      console.log(line);
    }
  } finally {
    database.close();
  }
} catch (error: unknown) {
  printWalletIntelligenceFailure(error);
}
