import { asNumber } from '../persistence/sqlite/row-mappers.js';
import type { DatabaseSync } from 'node:sqlite';
import { requireUtcTimestamp } from '../features/numbers.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { WALLET_INTELLIGENCE_REASON } from './constants.js';
import type { WalletIntelligenceReadiness } from './types.js';

export function emptyWalletIntelligenceReadiness(): WalletIntelligenceReadiness {
  return {
    scanCount: 0,
    earliestScanStartedAtMs: null,
    latestScanStartedAtMs: null,
    marketSamplesSafelyPointInTimeAlignable: 0,
    usedAsModelInput: false,
    reason: WALLET_INTELLIGENCE_REASON,
  };
}

export function loadWalletIntelligenceReadiness(
  database: DatabaseSync,
  marketSnapshots: readonly MarketSnapshot[],
): WalletIntelligenceReadiness {
  const table = database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name = 'wallet_intelligence_scans'`,
    )
    .get();
  if (table === undefined) {
    return emptyWalletIntelligenceReadiness();
  }

  const summary = database
    .prepare(
      `SELECT COUNT(*) AS scan_count,
              MIN(scan_started_at_ms) AS earliest,
              MAX(scan_started_at_ms) AS latest
       FROM wallet_intelligence_scans`,
    )
    .get();
  const scanCount = asNumber(summary?.['scan_count'] ?? 0);
  const earliest = summary?.['earliest'];
  const latest = summary?.['latest'];
  const scans = database
    .prepare(`SELECT token_mint, scan_started_at_ms FROM wallet_intelligence_scans`)
    .all()
    .map((row) => ({
      tokenMint: String(row['token_mint'] ?? ''),
      startedAtMs: asNumber(row['scan_started_at_ms']),
    }));

  let aligned = 0;
  if (scans.length > 0) {
    const byMint = new Map<string, number[]>();
    for (const scan of scans) {
      const list = byMint.get(scan.tokenMint) ?? [];
      list.push(scan.startedAtMs);
      byMint.set(scan.tokenMint, list);
    }
    for (const snapshot of marketSnapshots) {
      const times = byMint.get(snapshot.tokenMint);
      if (times === undefined) {
        continue;
      }
      const collectedMs = requireUtcTimestamp(snapshot.collectedAt, 'collectedAt');
      if (times.some((startedAtMs) => startedAtMs <= collectedMs)) {
        aligned += 1;
      }
    }
  }

  return {
    scanCount,
    earliestScanStartedAtMs: earliest === null || earliest === undefined ? null : asNumber(earliest),
    latestScanStartedAtMs: latest === null || latest === undefined ? null : asNumber(latest),
    marketSamplesSafelyPointInTimeAlignable: aligned,
    usedAsModelInput: false,
    reason: WALLET_INTELLIGENCE_REASON,
  };
}
