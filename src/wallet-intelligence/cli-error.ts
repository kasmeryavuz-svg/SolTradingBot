import { formatWalletIntelligenceError, secretsFromApiKey } from './sanitize.js';

export function printWalletIntelligenceFailure(error: unknown): void {
  const secrets = secretsFromApiKey(process.env['HELIUS_API_KEY']);
  console.error(formatWalletIntelligenceError(error, secrets));
  process.exitCode = 1;
}
