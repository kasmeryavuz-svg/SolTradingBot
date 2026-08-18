import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKTEST_DEFINITION_FINGERPRINT } from '../src/backtest/identity.js';
import { DASHBOARD_DEFINITION_FINGERPRINT } from '../src/dashboard/identity.js';
import { EXECUTION_DEFINITION_FINGERPRINT } from '../src/execution/identity.js';
import { EXIT_DEFINITION_FINGERPRINT } from '../src/exit/identity.js';
import { LIVE_DEFINITION_FINGERPRINT } from '../src/live/identity.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../src/paper/identity.js';
import { PERFORMANCE_DEFINITION_FINGERPRINT } from '../src/performance/identity.js';
import { POSITION_DEFINITION_FINGERPRINT } from '../src/position/identity.js';
import { RESEARCH_DEFINITION_FINGERPRINT } from '../src/research/identity.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../src/strategy/identity.js';
import { WALLET_DEFINITION_FINGERPRINT } from '../src/wallet/identity.js';
import { LATEST_SCHEMA_VERSION, migrationSqlDigest } from '../src/persistence/sqlite/migrations.js';
import { OPTIMIZATION_DEFINITION_FINGERPRINT } from '../src/optimization/identity.js';
import { COST_DEFINITION_FINGERPRINT } from '../src/optimization/costs.js';
import { fullHistoryWindow } from '../src/optimization/folds.js';
import { sortOptimizationMarketEvents } from '../src/optimization/timeline.js';
import {
  makeOptimizationDataset,
  O17_END,
  O17_START,
  optimizationMint,
  qualityControlOnlySnapshot,
  simulatePair,
} from './optimization-fixtures.js';
import { OTHER_PAIR, PAIR_ADDRESS } from './feature-fixtures.js';

function readTree(root: string): string {
  return readdirSync(root, { recursive: true })
    .filter((name): name is string => typeof name === 'string' && name.endsWith('.ts'))
    .map((name) => readFileSync(join(root, name), 'utf8'))
    .join('\n');
}

describe('optimization hostile audit prep', () => {
  it('reproves frozen upstream fingerprints and schema 9 with frozen 001-008', () => {
    expect(STRATEGY_DEFINITION_FINGERPRINT).toBe(
      'b4560629e6a58331e9046f13bad78b73b3bdc1bb7349fc6173ba158b4db067cd',
    );
    expect(BACKTEST_DEFINITION_FINGERPRINT).toBe(
      '87bca6f2ea8e57b7613d3627b5a5adf37864142b3c62de97849440189ff07fcf',
    );
    expect(PAPER_DEFINITION_FINGERPRINT).toBe(
      '4951807199956eb0425193fbdb3296289090b6bbffd92f7353718cad0f68a0e0',
    );
    expect(POSITION_DEFINITION_FINGERPRINT).toBe(
      '8c89f5a95f7aadb02d0cd7736b73d563266b2df1f3b16da5d24788eced75aa4f',
    );
    expect(EXIT_DEFINITION_FINGERPRINT).toBe(
      '4678a49e73cab2f0076e376506910761f4afcabdcdee4fe3c9830c2395c2e6e6',
    );
    expect(PERFORMANCE_DEFINITION_FINGERPRINT).toBe(
      '9fe2b033c19d5470b972714cc37d32333ac4662ad8d30cdd97b668891454e53c',
    );
    expect(RESEARCH_DEFINITION_FINGERPRINT).toBe(
      '61f5a9d091ce9214e440dddf029f81bb881a907f4cd9193e04ecd3238c20a83a',
    );
    expect(DASHBOARD_DEFINITION_FINGERPRINT).toBe(
      'd4a72c37b15c334171cbd0975cbb9534c3ca836f38923654e22e3685d02c5b18',
    );
    expect(EXECUTION_DEFINITION_FINGERPRINT).toBe(
      '6c9bf5bd42a6137b21b8ed2f4c8939085c7b999add2013efbf7d63a8fc306fd0',
    );
    expect(WALLET_DEFINITION_FINGERPRINT).toBe(
      '2caec72e3ea5fa2c141f9d00f689a23eadaa1f29b403605595abaf6e2d0a7855',
    );
    expect(LIVE_DEFINITION_FINGERPRINT).toBe(
      '57a6fc872f7e51f1e4b041ed5b93413efe0779dea61a88b9dc1b4ed9f05e395d',
    );
    expect(OPTIMIZATION_DEFINITION_FINGERPRINT).toBe(
      '3c2171dc1aee3b0a31bae185e156f0a7236d56d11fe381e83364e8c326c4b979',
    );
    expect(COST_DEFINITION_FINGERPRINT).toBe(
      'da3674208672b3f7c630ac0d3dc9e8cc0818c639fd5e69c62d9d87203757a523',
    );
    expect(LATEST_SCHEMA_VERSION).toBe(9);
    expect(migrationSqlDigest(8)).toBe(
      'e4c5ee0d56a8ffe5d916da3bd68d3792f48ac4ffbcce004ababa983d792747d0',
    );
    expect(migrationSqlDigest(9)).toBe(
      'f9f12785034c3181350b279a20e6baa7676fd8c48fb19dd02ce9ead922d12720',
    );
    expect(readFileSync(join(process.cwd(), 'src/persistence/sqlite/migrations.ts'), 'utf8')).toMatch(
      /009_wallet_intelligence/,
    );
  });

  it('does not connect strategy signals to live or add dashboard promote controls', () => {
    const optimization = readTree(join(process.cwd(), 'src/optimization'));
    const dashboard = readTree(join(process.cwd(), 'src/dashboard'));
    expect(optimization).not.toMatch(/live:execute|executeLiveBroadcast|PROMOTE TO LIVE|AUTO OPTIMIZE/);
    expect(dashboard).not.toMatch(/PROMOTE TO LIVE|AUTO OPTIMIZE|optimization:run/);
    expect(optimization).not.toMatch(/PROFITABLE|EDGE PROVEN|READY FOR LIVE|GUARANTEED|WINNING STRATEGY/);
  });

  it('keeps same-timestamp same-token lifecycle deterministic and does not fabricate unresolved closes', () => {
    const tokenMint = optimizationMint(3);
    const snapshots = [
      qualityControlOnlySnapshot({
        collectedAt: O17_START,
        tokenMint,
        pairAddress: PAIR_ADDRESS,
        priceUsd: 100,
      }),
      qualityControlOnlySnapshot({
        collectedAt: O17_START,
        tokenMint,
        pairAddress: OTHER_PAIR,
        priceUsd: 100,
      }),
      qualityControlOnlySnapshot({
        collectedAt: O17_END,
        tokenMint: optimizationMint(4),
        priceUsd: 101,
      }),
    ];
    const dataset = makeOptimizationDataset(snapshots);
    const ordered = sortOptimizationMarketEvents(dataset.marketSnapshots);
    expect(ordered[0]?.pairAddress).toBe(OTHER_PAIR);
    const window = fullHistoryWindow(dataset);
    if (window === null) {
      throw new Error('window');
    }
    const result = simulatePair(dataset, 'quality_control_v1', 'x11_baseline', window);
    expect(result.coverage.openedPositions).toBe(1);
    expect(result.coverage.completedTrades).toBe(0);
    expect(result.unresolvedPositions).toHaveLength(1);
    expect(result.unresolvedPositions[0]?.unresolvedReason).toBe('unresolved_at_dataset_end');
    expect(result.unresolvedPositions[0]?.pairAddress).toBe(OTHER_PAIR);
  });
});
