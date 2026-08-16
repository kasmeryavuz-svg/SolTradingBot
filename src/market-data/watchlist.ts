import { ConfigError } from '../utils/parse-env.js';
import { isPlausibleSolanaMint } from '../utils/solana-mint.js';

export function parseTokenMintList(
  raw: string | undefined,
  fallback: readonly string[],
  name: string,
): string[] {
  if (raw === undefined) {
    return [...fallback];
  }

  const parts = raw.split(',').map((part) => part.trim());
  if (parts.some((part) => part === '')) {
    throw new ConfigError(`Invalid ${name}. Remove empty entries from the comma-separated list.`);
  }

  const seen = new Set<string>();
  const mints: string[] = [];

  for (const mint of parts) {
    if (!isPlausibleSolanaMint(mint)) {
      throw new ConfigError(`Invalid ${name}. Each value must be a Solana token mint address.`);
    }

    if (!seen.has(mint)) {
      seen.add(mint);
      mints.push(mint);
    }
  }

  if (mints.length === 0) {
    throw new ConfigError(`Invalid ${name}. Provide at least one token mint address.`);
  }

  return mints;
}
