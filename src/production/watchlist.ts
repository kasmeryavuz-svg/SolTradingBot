import { isPlausibleSolanaMint } from '../utils/solana-mint.js';
import { PROD20_MAX_WATCHLIST } from './constants.js';
import { ProductionError } from './errors.js';

export function parseProductionWatchlist(raw: string | undefined, paperEnabled: boolean): string[] {
  if (raw === undefined || raw.trim() === '') {
    if (paperEnabled) {
      throw new ProductionError(
        'invalid_watchlist',
        'PROD20_PAPER_ENABLED=true requires at least one valid Solana mint in PROD20_PAPER_MINTS.',
      );
    }
    return [];
  }

  const parts = raw.split(',').map((part) => part.trim());
  if (parts.some((part) => part === '')) {
    throw new ProductionError(
      'invalid_watchlist',
      'Invalid PROD20_PAPER_MINTS. Remove empty entries from the comma-separated list.',
    );
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const mint of parts) {
    if (!isPlausibleSolanaMint(mint)) {
      throw new ProductionError(
        'invalid_watchlist',
        'Invalid PROD20_PAPER_MINTS. Each value must be a Solana token mint address, not a symbol or name.',
      );
    }
    if (!seen.has(mint)) {
      seen.add(mint);
      unique.push(mint);
    }
  }

  if (unique.length > PROD20_MAX_WATCHLIST) {
    throw new ProductionError(
      'invalid_watchlist',
      `Invalid PROD20_PAPER_MINTS. At most ${String(PROD20_MAX_WATCHLIST)} unique mints are allowed.`,
    );
  }

  if (paperEnabled && unique.length === 0) {
    throw new ProductionError(
      'invalid_watchlist',
      'PROD20_PAPER_ENABLED=true requires at least one valid Solana mint in PROD20_PAPER_MINTS.',
    );
  }

  return sortMintsByCodePoint(unique);
}

export function sortMintsByCodePoint(mints: readonly string[]): string[] {
  return [...mints].sort((left, right) => {
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
    return 0;
  });
}
