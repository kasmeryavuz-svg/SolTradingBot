import type { MarketSnapshot } from '../market-data/types.js';

export class DiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscoveryError';
  }
}

export const DISCOVERY_SOURCES = ['dexscreener_profile', 'dexscreener_boost'] as const;
export type DiscoverySource = (typeof DISCOVERY_SOURCES)[number];

export type MarketDataStatus = 'available' | 'unavailable' | 'not_requested';

export type DiscoveryLink = {
  type: string | null;
  label: string | null;
  url: string;
};

export type SourceRecord = {
  source: DiscoverySource;
  tokenMint: string;
  dexScreenerUrl: string | null;
  description: string | null;
  links: DiscoveryLink[];
  profileUpdatedAt: string | null;
  boostAmount: number | null;
  boostTotalAmount: number | null;
};

/**
 * A token that appeared in a configured public discovery feed.
 * This is not a buy signal, safety judgment, or proof the token is newly minted.
 *
 * Time fields stay distinct:
 * - observedAt: when this process collected the candidate during this cycle
 * - profileUpdatedAt: documented provider profile-metadata time only; DEX Screener
 *   latest-profile / latest-boost contracts do not document one, so it stays null
 * - marketSnapshot.pairCreatedAt: selected DEX pair creation time, if supplied
 *
 * None of those is token mint-creation, launch, or listing time. Checkpoint 03
 * does not invent launchTime, tokenCreatedAt, or mintCreatedAt.
 */
export type DiscoveryCandidate = {
  chain: 'solana';
  tokenMint: string;
  sources: DiscoverySource[];
  dexScreenerUrl: string | null;
  description: string | null;
  links: DiscoveryLink[];
  profileUpdatedAt: string | null;
  boostAmount: number | null;
  boostTotalAmount: number | null;
  observedAt: string;
  marketSnapshot: MarketSnapshot | null;
  marketDataStatus: MarketDataStatus;
};

export type DiscoverySourceResult = {
  source: DiscoverySource;
  ok: boolean;
  recordCount: number;
  error: string | null;
};

export type DiscoveryRunResult = {
  candidates: DiscoveryCandidate[];
  sourceResults: DiscoverySourceResult[];
  observedAt: string;
};
