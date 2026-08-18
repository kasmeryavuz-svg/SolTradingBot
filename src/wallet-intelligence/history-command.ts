import { config as loadDotenv } from 'dotenv';
import { printWalletIntelligenceFailure } from './cli-error.js';
import {
  openWalletIntelligenceDatabase,
  prepareWalletIntelligenceReadCommand,
  requireWalletIntelligenceMintArgument,
} from './command.js';
import { formatWalletIntelligenceHistoryLines } from './format.js';
import { loadWalletIntelligenceScanHistory } from './persistence.js';

loadDotenv({ quiet: true });

try {
  const appConfig = prepareWalletIntelligenceReadCommand(process.env);
  const tokenMint = requireWalletIntelligenceMintArgument(process.argv, 'wallet-intel:history');
  const database = openWalletIntelligenceDatabase(appConfig, 'read');
  try {
    const scans = loadWalletIntelligenceScanHistory(database, tokenMint);
    for (const line of formatWalletIntelligenceHistoryLines(tokenMint, scans)) {
      console.log(line);
    }
  } finally {
    database.close();
  }
} catch (error: unknown) {
  printWalletIntelligenceFailure(error);
}
