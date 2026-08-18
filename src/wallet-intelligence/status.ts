import { config as loadDotenv } from 'dotenv';
import { printWalletIntelligenceFailure } from './cli-error.js';
import { assertNoExtraWalletIntelligenceArguments, prepareWalletIntelligenceStatusCommand } from './command.js';
import { formatWalletIntelligenceStatusLines } from './format.js';

loadDotenv({ quiet: true });

try {
  prepareWalletIntelligenceStatusCommand(process.env);
  assertNoExtraWalletIntelligenceArguments(process.argv, 'wallet-intel:status');
  for (const line of formatWalletIntelligenceStatusLines()) {
    console.log(line);
  }
} catch (error: unknown) {
  printWalletIntelligenceFailure(error);
}
