import type { MarketSnapshot } from './types.js';

export function formatMarketCheckLines(snapshots: readonly MarketSnapshot[]): string[] {
  const lines = ['Market Data — READ ONLY', ''];

  for (const [index, snapshot] of snapshots.entries()) {
    if (index > 0) {
      lines.push('');
    }
    lines.push(...formatSnapshotLines(snapshot));
  }

  lines.push('');
  lines.push('These numbers are information only. None of them proves a token is a good investment.');
  lines.push('No trading capability.');
  lines.push('Checkpoint: 02');
  return lines;
}

export function formatSnapshotLines(snapshot: MarketSnapshot): string[] {
  return [
    `Token: ${snapshot.tokenSymbol ?? 'unknown'}`,
    `Name: ${snapshot.tokenName ?? 'n/a'}`,
    `Mint: ${snapshot.tokenMint}`,
    `DEX: ${snapshot.dexId}`,
    `Pair: ${snapshot.pairAddress}`,
    `Quote: ${snapshot.quoteTokenSymbol ?? snapshot.quoteTokenMint ?? 'n/a'}`,
    `Price: ${formatUsd(snapshot.priceUsd)}`,
    `Pair liquidity: ${formatUsd(snapshot.liquidityUsd)}`,
    `Pair volume 5m: ${formatUsd(snapshot.volume5mUsd)}`,
    `Pair volume 1h: ${formatUsd(snapshot.volume1hUsd)}`,
    `Pair volume 24h: ${formatUsd(snapshot.volume24hUsd)}`,
    `Pair buys 5m: ${formatCount(snapshot.buys5m)}`,
    `Pair sells 5m: ${formatCount(snapshot.sells5m)}`,
    `Pair buys 1h: ${formatCount(snapshot.buys1h)}`,
    `Pair sells 1h: ${formatCount(snapshot.sells1h)}`,
    `Price change 5m: ${formatPercent(snapshot.priceChange5mPct)}`,
    `Price change 1h: ${formatPercent(snapshot.priceChange1hPct)}`,
    `Price change 24h: ${formatPercent(snapshot.priceChange24hPct)}`,
    `Market cap: ${formatUsd(snapshot.marketCapUsd)}`,
    `FDV: ${formatUsd(snapshot.fdvUsd)}`,
    `Pair created: ${snapshot.pairCreatedAt ?? 'n/a'}`,
    `Collected at: ${snapshot.collectedAt}`,
  ];
}

export function formatUsd(value: number | null): string {
  if (value === null) {
    return 'n/a';
  }

  if (Math.abs(value) >= 1) {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  if (Math.abs(value) >= 0.01) {
    return `$${value.toFixed(4)}`;
  }

  return `$${value.toPrecision(4)}`;
}

export function formatPercent(value: number | null): string {
  if (value === null) {
    return 'n/a';
  }

  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

export function formatCount(value: number | null): string {
  if (value === null) {
    return 'n/a';
  }

  return value.toLocaleString('en-US');
}
