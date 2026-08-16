import { formatUsd } from '../market-data/format.js';
import type { DiscoveryCandidate, DiscoveryRunResult, DiscoverySource } from './types.js';

export function formatDiscoveryCheckLines(result: DiscoveryRunResult): string[] {
  const lines = [
    'Token Discovery — READ ONLY',
    '',
    'Sources:',
    ...result.sourceResults.map((source) => formatSourceLine(source.source, source.ok, source.error)),
    `Candidates: ${String(result.candidates.length)}`,
    'Candidate cap is an operational limit, not a quality ranking.',
    'Observed at is this cycle’s collection time, not token mint or launch time.',
  ];

  for (const [index, candidate] of result.candidates.entries()) {
    lines.push('');
    lines.push(`Candidate ${String(index + 1)}`);
    lines.push(...formatCandidateLines(candidate));
  }

  lines.push('');
  lines.push('Discovery is not a buy signal.');
  lines.push('Candidates have not passed a risk scanner.');
  lines.push('No trading capability.');
  lines.push('Checkpoint: 03');
  return lines;
}

export function formatCandidateLines(
  candidate: DiscoveryCandidate,
  options: { firstSeen?: boolean } = {},
): string[] {
  const lines = [
    `Mint: ${candidate.tokenMint}`,
    `Sources: ${candidate.sources.join(', ')}`,
    `Observed at: ${candidate.observedAt}`,
  ];

  if (options.firstSeen !== undefined) {
    lines.push(
      options.firstSeen
        ? 'First seen by this process: yes (not a mint-creation time)'
        : 'First seen by this process: no',
    );
  }

  lines.push(`Description: ${candidate.description ?? 'n/a'}`);
  lines.push(`Boost amount: ${formatOptionalNumber(candidate.boostAmount)}`);
  lines.push(`Boost total amount: ${formatOptionalNumber(candidate.boostTotalAmount)}`);
  lines.push('Boost metadata is promotional provider data, not a quality or buy score.');
  lines.push(`Profile updated at: ${candidate.profileUpdatedAt ?? 'n/a'}`);
  lines.push(`Market data: ${candidate.marketDataStatus}`);

  if (candidate.marketSnapshot !== null) {
    lines.push(`Symbol: ${candidate.marketSnapshot.tokenSymbol ?? 'n/a'}`);
    lines.push(`Price: ${formatUsd(candidate.marketSnapshot.priceUsd)}`);
    lines.push(`Pair liquidity: ${formatUsd(candidate.marketSnapshot.liquidityUsd)}`);
    lines.push(`Pair created at (selected DEX pair, not mint time): ${candidate.marketSnapshot.pairCreatedAt ?? 'n/a'}`);
  }

  return lines;
}

function formatSourceLine(source: DiscoverySource, ok: boolean, error: string | null): string {
  const label =
    source === 'dexscreener_profile'
      ? 'DEX Screener latest profiles'
      : 'DEX Screener latest boosts';
  if (ok) {
    return `${label}: OK`;
  }
  return `${label}: FAILED${error === null ? '' : ` (${error})`}`;
}

function formatOptionalNumber(value: number | null): string {
  return value === null ? 'n/a' : String(value);
}
