import { requireUtcTimestamp } from '../features/numbers.js';
import type { RiskFeatureInput } from '../features/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { FORWARD_HORIZON_SECONDS, OUTCOME_WINDOW_END_SECONDS } from './constants.js';
import { BacktestError } from './types.js';

export function compareLexical(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function addUtcSeconds(iso: string, seconds: number, field: string): string {
  const millis = requireUtcTimestamp(iso, field);
  return new Date(millis + seconds * 1000).toISOString();
}

export function outcomeWindow(asOf: string): { targetAt: string; windowEndAt: string } {
  return {
    targetAt: addUtcSeconds(asOf, FORWARD_HORIZON_SECONDS, 'asOf'),
    windowEndAt: addUtcSeconds(asOf, OUTCOME_WINDOW_END_SECONDS, 'asOf'),
  };
}

export function sortMarketSnapshots(snapshots: readonly MarketSnapshot[]): MarketSnapshot[] {
  return [...snapshots].sort((left, right) => {
    const token = compareLexical(left.tokenMint, right.tokenMint);
    if (token !== 0) {
      return token;
    }
    const collected = compareLexical(left.collectedAt, right.collectedAt);
    if (collected !== 0) {
      return collected;
    }
    return compareLexical(left.pairAddress, right.pairAddress);
  });
}

export function sortRiskReports(reports: readonly RiskFeatureInput[]): RiskFeatureInput[] {
  return [...reports].sort((left, right) => {
    const token = compareLexical(left.tokenMint, right.tokenMint);
    if (token !== 0) {
      return token;
    }
    return compareLexical(left.scannedAt, right.scannedAt);
  });
}

export function selectPreviousMarket(
  current: MarketSnapshot,
  snapshots: readonly MarketSnapshot[],
): MarketSnapshot | null {
  const currentMs = requireUtcTimestamp(current.collectedAt, 'market.collectedAt');
  let selected: MarketSnapshot | null = null;
  let selectedMs = Number.NEGATIVE_INFINITY;

  for (const candidate of snapshots) {
    if (candidate.tokenMint !== current.tokenMint || candidate.pairAddress !== current.pairAddress) {
      continue;
    }
    const candidateMs = requireUtcTimestamp(candidate.collectedAt, 'previousMarket.collectedAt');
    if (candidateMs >= currentMs) {
      continue;
    }
    if (candidateMs > selectedMs) {
      selected = candidate;
      selectedMs = candidateMs;
    }
  }

  return selected;
}

export function selectLatestRisk(
  tokenMint: string,
  asOf: string,
  reports: readonly RiskFeatureInput[],
): RiskFeatureInput | null {
  const asOfMs = requireUtcTimestamp(asOf, 'asOf');
  let selected: RiskFeatureInput | null = null;
  let selectedMs = Number.NEGATIVE_INFINITY;

  for (const report of reports) {
    if (report.tokenMint !== tokenMint) {
      continue;
    }
    const scannedAtMs = requireUtcTimestamp(report.scannedAt, 'risk.scannedAt');
    if (scannedAtMs > asOfMs) {
      continue;
    }
    if (scannedAtMs > selectedMs) {
      selected = report;
      selectedMs = scannedAtMs;
    }
  }

  return selected;
}

export function selectOutcomeSnapshot(
  tokenMint: string,
  pairAddress: string,
  targetAt: string,
  windowEndAt: string,
  snapshots: readonly MarketSnapshot[],
): MarketSnapshot | null {
  const targetMs = requireUtcTimestamp(targetAt, 'targetAt');
  const windowEndMs = requireUtcTimestamp(windowEndAt, 'windowEndAt');
  let selected: MarketSnapshot | null = null;
  let selectedMs = Number.POSITIVE_INFINITY;

  for (const candidate of snapshots) {
    if (candidate.tokenMint !== tokenMint || candidate.pairAddress !== pairAddress) {
      continue;
    }
    const collectedMs = requireUtcTimestamp(candidate.collectedAt, 'outcome.collectedAt');
    if (collectedMs < targetMs || collectedMs > windowEndMs) {
      continue;
    }
    if (collectedMs < selectedMs) {
      selected = candidate;
      selectedMs = collectedMs;
    }
  }

  return selected;
}

export function requireFinitePositivePrice(value: number | null, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BacktestError(`Invalid ${field}. Expected a finite price greater than 0.`);
  }
  return value;
}
