import type { DiscoveryCandidate, DiscoveryLink, DiscoverySource, SourceRecord } from './types.js';

const SOURCE_ORDER: readonly DiscoverySource[] = ['dexscreener_profile', 'dexscreener_boost'];

/**
 * Merge records that share a mint into one candidate.
 *
 * Precedence is by source, not by whichever record happened to arrive first:
 * - dexScreenerUrl / description: first non-null profile value, else first non-null boost value
 * - links: profile links first (first-seen URL wins), then unique boost URLs
 * - profileUpdatedAt: first non-null profile value only; never copied from boost
 * - boostAmount / boostTotalAmount: first non-null boost value only; never copied from profile
 * - observedAt: the collection time passed in by our process
 * - sources: unique tags in SOURCE_ORDER, each at most once
 *
 * Same-source duplicates keep the first non-null value in that source's encounter order.
 * Missing values stay null. Nothing is invented.
 */
export function mergeSourceRecords(
  records: readonly SourceRecord[],
  observedAt: string,
): DiscoveryCandidate[] {
  const groups = new Map<string, SourceRecord[]>();

  for (const record of records) {
    const existing = groups.get(record.tokenMint);
    if (existing === undefined) {
      groups.set(record.tokenMint, [record]);
      continue;
    }
    existing.push(record);
  }

  const candidates: DiscoveryCandidate[] = [];
  for (const [tokenMint, group] of groups) {
    const profiles = group.filter((record) => record.source === 'dexscreener_profile');
    const boosts = group.filter((record) => record.source === 'dexscreener_boost');
    const sources = SOURCE_ORDER.filter((source) => {
      return source === 'dexscreener_profile' ? profiles.length > 0 : boosts.length > 0;
    });

    candidates.push({
      chain: 'solana',
      tokenMint,
      sources,
      dexScreenerUrl:
        firstNonNull(profiles, (record) => record.dexScreenerUrl) ??
        firstNonNull(boosts, (record) => record.dexScreenerUrl),
      description:
        firstNonNull(profiles, (record) => record.description) ??
        firstNonNull(boosts, (record) => record.description),
      links: mergeLinks(
        profiles.flatMap((record) => record.links),
        boosts.flatMap((record) => record.links),
      ),
      profileUpdatedAt: firstNonNull(profiles, (record) => record.profileUpdatedAt),
      boostAmount: firstNonNull(boosts, (record) => record.boostAmount),
      boostTotalAmount: firstNonNull(boosts, (record) => record.boostTotalAmount),
      observedAt,
      marketSnapshot: null,
      marketDataStatus: 'not_requested',
    });
  }

  return candidates;
}

export function interleaveMints(
  sourceMintLists: readonly (readonly string[])[],
  maxCandidates: number,
): string[] {
  const selected: string[] = [];
  const seen = new Set<string>();
  const longest = sourceMintLists.reduce((max, list) => Math.max(max, list.length), 0);

  for (let index = 0; index < longest && selected.length < maxCandidates; index += 1) {
    for (const list of sourceMintLists) {
      const mint = list[index];
      if (mint === undefined || seen.has(mint)) {
        continue;
      }
      seen.add(mint);
      selected.push(mint);
      if (selected.length >= maxCandidates) {
        break;
      }
    }
  }

  return selected;
}

export function uniqueMintsInOrder(records: readonly SourceRecord[]): string[] {
  const mints: string[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    if (seen.has(record.tokenMint)) {
      continue;
    }
    seen.add(record.tokenMint);
    mints.push(record.tokenMint);
  }

  return mints;
}

function firstNonNull<T>(
  records: readonly SourceRecord[],
  read: (record: SourceRecord) => T | null,
): T | null {
  for (const record of records) {
    const value = read(record);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function mergeLinks(
  profileLinks: readonly DiscoveryLink[],
  boostLinks: readonly DiscoveryLink[],
): DiscoveryLink[] {
  const merged: DiscoveryLink[] = [];
  const seen = new Set<string>();

  for (const link of [...profileLinks, ...boostLinks]) {
    if (seen.has(link.url)) {
      continue;
    }
    seen.add(link.url);
    merged.push(link);
  }

  return merged;
}
