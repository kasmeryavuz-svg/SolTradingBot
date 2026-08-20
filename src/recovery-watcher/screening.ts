import {
  RECOVERY_V0_SIGNAL_VERSION,
  RW0_MARKET_PROVIDER,
  RW0_SCREENING_MARKET_SOURCE,
  RW0_SPEC_VERSION,
} from './constants.js';
import {
  RECOVERY_V0_SIGNAL_FINGERPRINT,
  RW0_WATCHER_DEFINITION_FINGERPRINT,
  recoveryScreeningId,
} from './identity.js';
import { evaluateRecoveryV0DipFilters } from './signal.js';
import type {
  MarketObservationRecord,
  ScreeningDipFilterResult,
  ScreeningDisposition,
  ScreeningObservationRecord,
} from './types.js';
import type { MarketSnapshot } from '../market-data/types.js';

export type DipScreeningClassification = {
  disposition: 'DIP_PASS' | 'NOT_DIP' | 'INCOMPLETE';
  dipFilterResult: Exclude<ScreeningDipFilterResult, 'NOT_EVALUATED'>;
  reason: string;
};

export function classifyDipSnapshot(snapshot: MarketSnapshot): DipScreeningClassification {
  const result = evaluateRecoveryV0DipFilters({
    observedPriceUsd: snapshot.priceUsd,
    priceChange5mPct: snapshot.priceChange5mPct,
    volume5mUsd: snapshot.volume5mUsd,
    liquidityUsd: snapshot.liquidityUsd,
  });
  if (result.kind === 'pass') {
    return {
      disposition: 'DIP_PASS',
      dipFilterResult: 'PASS',
      reason: 'recovery_v0 dip filter passed',
    };
  }
  if (result.kind === 'reject_filter') {
    return { disposition: 'NOT_DIP', dipFilterResult: 'NOT_DIP', reason: result.reason };
  }
  return { disposition: 'INCOMPLETE', dipFilterResult: 'INCOMPLETE', reason: result.reason };
}

export function snapshotToMarketObservation(
  snapshot: MarketSnapshot,
  episodeId: string,
  source: string,
): MarketObservationRecord {
  return {
    episodeId,
    mint: snapshot.tokenMint,
    pairAddress: snapshot.pairAddress,
    collectedAt: snapshot.collectedAt,
    provider: RW0_MARKET_PROVIDER,
    source,
    priceUsd: snapshot.priceUsd,
    liquidityUsd: snapshot.liquidityUsd,
    volume5mUsd: snapshot.volume5mUsd,
    priceChange5mPct: snapshot.priceChange5mPct,
    signalVersion: RECOVERY_V0_SIGNAL_VERSION,
    signalFingerprint: RECOVERY_V0_SIGNAL_FINGERPRINT,
    watcherSpecVersion: RW0_SPEC_VERSION,
    watcherSpecFingerprint: RW0_WATCHER_DEFINITION_FINGERPRINT,
  };
}

export function defaultDipFilterResult(disposition: ScreeningDisposition): ScreeningDipFilterResult {
  if (disposition === 'DIP_PASS') {
    return 'PASS';
  }
  if (disposition === 'NOT_DIP') {
    return 'NOT_DIP';
  }
  if (disposition === 'INCOMPLETE') {
    return 'INCOMPLETE';
  }
  return 'NOT_EVALUATED';
}

export function createScreeningObservation(input: {
  mint: string;
  screenedAt: string;
  discoverySources: string;
  disposition: ScreeningDisposition;
  reason: string;
  dipFilterResult?: ScreeningDipFilterResult;
  provider?: string | null;
  source?: string | null;
  pairAddress?: string | null;
  priceUsd?: number | null;
  liquidityUsd?: number | null;
  volume5mUsd?: number | null;
  priceChange5mPct?: number | null;
}): ScreeningObservationRecord {
  const signalFingerprint = RECOVERY_V0_SIGNAL_FINGERPRINT;
  const watcherSpecFingerprint = RW0_WATCHER_DEFINITION_FINGERPRINT;
  return {
    screeningId: recoveryScreeningId({
      mint: input.mint,
      screenedAt: input.screenedAt,
      signalFingerprint,
      watcherSpecFingerprint,
    }),
    mint: input.mint,
    screenedAt: input.screenedAt,
    discoverySources: input.discoverySources,
    provider: input.provider ?? null,
    source: input.source ?? null,
    pairAddress: input.pairAddress ?? null,
    priceUsd: input.priceUsd ?? null,
    liquidityUsd: input.liquidityUsd ?? null,
    volume5mUsd: input.volume5mUsd ?? null,
    priceChange5mPct: input.priceChange5mPct ?? null,
    signalVersion: RECOVERY_V0_SIGNAL_VERSION,
    signalFingerprint,
    watcherSpecVersion: RW0_SPEC_VERSION,
    watcherSpecFingerprint,
    dipFilterResult: input.dipFilterResult ?? defaultDipFilterResult(input.disposition),
    disposition: input.disposition,
    reason: input.reason,
    collectedAtIsLocalCollectionTime: true,
  };
}

export function screeningFromSnapshot(
  snapshot: MarketSnapshot,
  discoverySources: string,
  classification: {
    disposition: ScreeningDisposition;
    reason: string;
    dipFilterResult?: ScreeningDipFilterResult;
  },
): ScreeningObservationRecord {
  return createScreeningObservation({
    mint: snapshot.tokenMint,
    screenedAt: snapshot.collectedAt,
    discoverySources,
    disposition: classification.disposition,
    reason: classification.reason,
    dipFilterResult: classification.dipFilterResult ?? defaultDipFilterResult(classification.disposition),
    provider: RW0_MARKET_PROVIDER,
    source: RW0_SCREENING_MARKET_SOURCE,
    pairAddress: snapshot.pairAddress,
    priceUsd: snapshot.priceUsd,
    liquidityUsd: snapshot.liquidityUsd,
    volume5mUsd: snapshot.volume5mUsd,
    priceChange5mPct: snapshot.priceChange5mPct,
  });
}
