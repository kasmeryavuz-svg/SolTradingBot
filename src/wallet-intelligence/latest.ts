import { config as loadDotenv } from 'dotenv';
import { printWalletIntelligenceFailure } from './cli-error.js';
import {
  openWalletIntelligenceDatabase,
  prepareWalletIntelligenceReadCommand,
  requireWalletIntelligenceMintArgument,
} from './command.js';
import { formatWalletIntelligenceScanLines } from './format.js';
import { loadLatestWalletIntelligenceScan } from './persistence.js';

loadDotenv({ quiet: true });

try {
  const appConfig = prepareWalletIntelligenceReadCommand(process.env);
  const tokenMint = requireWalletIntelligenceMintArgument(process.argv, 'wallet-intel:latest');
  const database = openWalletIntelligenceDatabase(appConfig, 'read');
  try {
    const scan = loadLatestWalletIntelligenceScan(database, tokenMint);
    if (scan === null) {
      console.log('WALLET INTELLIGENCE LATEST');
      console.log(`Mint: ${tokenMint}`);
      console.log('');
      console.log('No wallet-intelligence scans found for this mint.');
    } else {
      for (const line of formatWalletIntelligenceScanLines(scan, { persistedId: scan.id })) {
        console.log(line);
      }
    }
  } finally {
    database.close();
  }
} catch (error: unknown) {
  printWalletIntelligenceFailure(error);
}
