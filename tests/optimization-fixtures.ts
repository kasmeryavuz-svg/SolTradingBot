import type { MarketSnapshot } from '../src/market-data/types.js';
import { coverageFromCounts } from '../src/optimization/metrics.js';
import { researchDatasetToOptimizationDataset } from '../src/optimization/dataset.js';
import { buildOptimizationIndexes } from '../src/optimization/timeline.js';
import { simulateOptimizationPair } from '../src/optimization/simulator.js';
import { OPTIMIZATION_DEFINITION_FINGERPRINT } from '../src/optimization/identity.js';
import type { OpenOptimizationPositionState } from '../src/optimization/exits.js';
import type {
  OptimizationCompletedTrade,
  OptimizationDataset,
  OptimizationEntryCandidateId,
  OptimizationExitCandidateId,
  OptimizationSimulationResult,
  RuntimeIntegrityReport,
  ScenarioMetrics,
  SimulationWindow,
  TrainingCandidateMetrics,
} from '../src/optimization/types.js';
import { addMs, openedExitPosition } from './exit-fixtures.js';
import { PAIR_ADDRESS } from './feature-fixtures.js';
import { allEntrySnapshot, makeResearchDataset, researchRisk } from './research-fixtures.js';

export const O17_START = '2026-01-01T00:00:00.000Z';
export const O17_END = '2026-01-19T00:00:00.000Z';
export const O17_ENTRY_OPENED_AT = '2026-08-17T10:00:00.000Z';

export function optimizationMint(index: number): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const hi = alphabet[Math.floor(index / alphabet.length) % alphabet.length];
  const lo = alphabet[index % alphabet.length];
  if (hi === undefined || lo === undefined) {
    throw new Error('mint index out of range');
  }
  return `So11111111111111111111111111111111111111${hi}${lo}`;
}

export function qualityControlOnlySnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  const collectedAt = overrides.collectedAt ?? O17_START;
  return allEntrySnapshot({
    priceUsd: 100,
    priceChange5mPct: 0,
    priceChange1hPct: 0,
    priceChange24hPct: 0,
    liquidityUsd: 80_000,
    buys5m: 20,
    sells5m: 10,
    pairCreatedAt: addMs(collectedAt, -1_000_000),
    collectedAt,
    ...overrides,
  });
}

export function s07LegalSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  const collectedAt = overrides.collectedAt ?? O17_START;
  return allEntrySnapshot({
    priceUsd: 100,
    liquidityUsd: 80_000,
    volume5mUsd: 8_000,
    buys5m: 60,
    sells5m: 40,
    priceChange5mPct: 5,
    priceChange1hPct: 1,
    priceChange24hPct: 1,
    pairCreatedAt: addMs(collectedAt, -1_000_000),
    collectedAt,
    ...overrides,
  });
}

function isoMs(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Hostile synthetic dataset that can exercise Stage A/B selection, selected
 * OOS trades, baseline comparability, and promotion success.
 *
 * Each of S1..S6 contains:
 * - 10 quality_control-only winners (100 -> 130) that s07 does not take
 * - 10 s07-legal winners (100 -> 120) that both s07 and quality_control take
 */
export function promotingWalkForwardSnapshots(): MarketSnapshot[] {
  const snapshots: MarketSnapshot[] = [
    qualityControlOnlySnapshot({
      collectedAt: O17_START,
      tokenMint: optimizationMint(0),
      liquidityUsd: 1,
      priceUsd: 100,
    }),
    qualityControlOnlySnapshot({
      collectedAt: O17_END,
      tokenMint: optimizationMint(0),
      liquidityUsd: 1,
      priceUsd: 101,
    }),
  ];
  const firstMs = Date.parse(O17_START);
  const spanMs = Date.parse(O17_END) - firstMs;
  const segmentWidthMs = Math.trunc(spanMs / 6);
  let mint = 1;
  for (let segment = 0; segment < 6; segment += 1) {
    const segmentStart = firstMs + segment * segmentWidthMs;
    const base = segmentStart + 2 * 3_600_000;
    for (let i = 0; i < 10; i += 1) {
      const tokenMint = optimizationMint(mint);
      mint += 1;
      const entryAt = base + i * 60_000;
      snapshots.push(
        qualityControlOnlySnapshot({
          collectedAt: isoMs(entryAt - 60_000),
          tokenMint,
          priceUsd: 100,
          liquidityUsd: 1,
        }),
      );
      snapshots.push(
        qualityControlOnlySnapshot({
          collectedAt: isoMs(entryAt),
          tokenMint,
          priceUsd: 100,
        }),
      );
      snapshots.push(
        qualityControlOnlySnapshot({
          collectedAt: isoMs(entryAt + 3_600_000),
          tokenMint,
          priceUsd: 130,
        }),
      );
    }
    for (let i = 0; i < 10; i += 1) {
      const tokenMint = optimizationMint(mint);
      mint += 1;
      const entryAt = base + (10 + i) * 60_000;
      snapshots.push(
        s07LegalSnapshot({
          collectedAt: isoMs(entryAt - 60_000),
          tokenMint,
          priceUsd: 100,
          liquidityUsd: 1,
        }),
      );
      snapshots.push(
        s07LegalSnapshot({
          collectedAt: isoMs(entryAt),
          tokenMint,
          priceUsd: 100,
        }),
      );
      snapshots.push(
        s07LegalSnapshot({
          collectedAt: isoMs(entryAt + 3_600_000),
          tokenMint,
          priceUsd: 120,
        }),
      );
    }
  }
  return snapshots;
}

export function risksForSnapshots(
  snapshots: readonly MarketSnapshot[],
  scannedAt = addMs(O17_START, -60_000),
): ReturnType<typeof researchRisk>[] {
  return [...new Set(snapshots.map((snapshot) => snapshot.tokenMint))].map((tokenMint) =>
    researchRisk({ tokenMint, scannedAt }),
  );
}

export function makeOptimizationDataset(
  snapshots: readonly MarketSnapshot[],
  riskReports = risksForSnapshots(snapshots),
  options?: Parameters<typeof makeResearchDataset>[2],
): OptimizationDataset {
  const research = makeResearchDataset(snapshots, riskReports, options);
  const dataset = researchDatasetToOptimizationDataset(research, 8);
  if (dataset.optimizationDefinitionFingerprint !== OPTIMIZATION_DEFINITION_FINGERPRINT) {
    throw new Error('Optimization dataset must bind the frozen o17 definition fingerprint.');
  }
  return dataset;
}

export function simulatePair(
  dataset: OptimizationDataset,
  entryCandidateId: OptimizationEntryCandidateId,
  exitCandidateId: OptimizationExitCandidateId,
  window: SimulationWindow,
): OptimizationSimulationResult {
  return simulateOptimizationPair({
    dataset,
    indexes: buildOptimizationIndexes({
      marketSnapshots: dataset.marketSnapshots,
      riskReports: dataset.riskReports,
    }),
    entryCandidateId,
    exitCandidateId,
    window,
  });
}

export function passingIntegrity(): RuntimeIntegrityReport {
  return {
    status: 'PASS',
    checks: [
      { id: 'definition_fingerprint', result: 'PASS', detail: 'ok' },
      { id: 'integer_partition', result: 'PASS', detail: 'ok' },
      { id: 'disjoint_train_test', result: 'PASS', detail: 'ok' },
      { id: 'no_outcome_beyond_observation_end', result: 'PASS', detail: 'ok' },
      { id: 'selected_ids_frozen', result: 'PASS', detail: 'ok' },
      { id: 'coverage_accounting', result: 'PASS', detail: 'ok' },
      { id: 'fold_fingerprint_present', result: 'PASS', detail: 'ok' },
    ],
  };
}

export function emptyScenario(scenarioId: ScenarioMetrics['scenarioId'], overrides: Partial<ScenarioMetrics> = {}): ScenarioMetrics {
  return {
    scenarioId,
    completedTrades: 0,
    totalPnlUsd: 0,
    expectancyUsd: null,
    medianTradePnlUsd: null,
    winRatePct: null,
    lossRatePct: null,
    profitFactor: { kind: 'undefined' },
    largestWinUsd: null,
    largestLossUsd: null,
    maxDrawdownUsd: null,
    maxDrawdownPctOfReferenceBasis: null,
    averageHoldDurationMs: null,
    medianHoldDurationMs: null,
    top1PositiveConcentration: null,
    top3PositiveConcentration: null,
    ...overrides,
  };
}

export function trainingMetrics(input: {
  candidateId: string;
  eligibility?: TrainingCandidateMetrics['eligibility'];
  completedTrades?: number;
  openedPositions?: number;
  unresolvedTrades?: number;
  partiallyCensoredTrades?: number;
  stressExpectancyUsd?: number | null;
  baseProfitFactor?: ScenarioMetrics['profitFactor'];
  baseMaxDrawdownUsd?: number | null;
  baseMedianTradePnlUsd?: number | null;
}): TrainingCandidateMetrics {
  const completed = input.completedTrades ?? 0;
  const opened = input.openedPositions ?? completed;
  return {
    candidateId: input.candidateId,
    candidateDefinitionFingerprint: input.candidateId.padEnd(64, '0'),
    eligibility: input.eligibility ?? 'eligible',
    ineligibleReason: input.eligibility === 'TRAIN_INELIGIBLE' ? 'fixture' : null,
    coverage: coverageFromCounts({
      snapshots: opened,
      uniqueTokenMints: opened,
      uniquePairs: opened,
      openedPositions: opened,
      completedTrades: completed,
      unresolvedTrades: input.unresolvedTrades ?? 0,
      partiallyCensoredTrades: input.partiallyCensoredTrades ?? 0,
    }),
    gross: emptyScenario('GROSS'),
    netLow: emptyScenario('LOW'),
    netBase: emptyScenario('BASE', {
      completedTrades: completed,
      profitFactor: input.baseProfitFactor ?? { kind: 'finite', value: 1.2 },
      maxDrawdownUsd: input.baseMaxDrawdownUsd ?? 10,
      medianTradePnlUsd: input.baseMedianTradePnlUsd ?? 1,
      expectancyUsd: 1,
    }),
    netStress: emptyScenario('STRESS', {
      completedTrades: completed,
      expectancyUsd: input.stressExpectancyUsd ?? 1,
    }),
  };
}

export function completedTrade(overrides: Partial<OptimizationCompletedTrade> = {}): OptimizationCompletedTrade {
  const pnl = overrides.netBasePnlUsd ?? 10;
  return {
    tokenMint: overrides.tokenMint ?? optimizationMint(1),
    pairAddress: PAIR_ADDRESS,
    positionIdentity: overrides.positionIdentity ?? 'position-1',
    entryMarketIdentity: 'entry-1',
    openedAt: overrides.openedAt ?? O17_START,
    exitedAt: overrides.exitedAt ?? addMs(O17_START, 3_600_000),
    holdingDurationMs: overrides.holdingDurationMs ?? 3_600_000,
    entryReferencePriceUsd: 100,
    entryReferenceNotionalUsd: 100,
    originalQuantityTokens: 1,
    legs: overrides.legs ?? [],
    grossPnlUsd: overrides.grossPnlUsd ?? pnl,
    netLowPnlUsd: overrides.netLowPnlUsd ?? pnl,
    netBasePnlUsd: pnl,
    netStressPnlUsd: overrides.netStressPnlUsd ?? pnl,
    outcomeGross: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven',
    outcomeBase: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven',
    ...overrides,
  };
}

export function fakeSimulation(overrides: Partial<OptimizationSimulationResult> = {}): OptimizationSimulationResult {
  const trades = overrides.completedTrades ?? [];
  const unresolved = overrides.unresolvedPositions ?? [];
  const completed = overrides.coverage?.completedTrades ?? trades.length;
  const opened = overrides.coverage?.openedPositions ?? completed + unresolved.length;
  return {
    entryCandidateId: 'quality_control_v1',
    exitCandidateId: 'x11_baseline',
    entryDefinitionFingerprint: 'e'.repeat(64),
    exitDefinitionFingerprint: 'x'.repeat(64),
    decisions: {
      evaluatedSnapshotCount: opened,
      entryCandidateCount: opened,
      noEntryCount: 0,
      insufficientDataCount: 0,
      skippedWhileOpenCount: 0,
    },
    coverage: coverageFromCounts({
      snapshots: opened,
      uniqueTokenMints: opened,
      uniquePairs: opened,
      openedPositions: opened,
      completedTrades: completed,
      unresolvedTrades: overrides.coverage?.unresolvedTrades ?? unresolved.filter((item) => item.unresolvedReason !== 'partially_realized_censored').length,
      partiallyCensoredTrades:
        overrides.coverage?.partiallyCensoredTrades ??
        unresolved.filter((item) => item.unresolvedReason === 'partially_realized_censored').length,
    }),
    completedTrades: trades,
    unresolvedPositions: unresolved,
    gross: emptyScenario('GROSS', { completedTrades: completed, expectancyUsd: 1 }),
    netLow: emptyScenario('LOW', { completedTrades: completed, expectancyUsd: 0.8 }),
    netBase: emptyScenario('BASE', {
      completedTrades: completed,
      expectancyUsd: 0.5,
      profitFactor: { kind: 'finite', value: 1.2 },
      maxDrawdownUsd: 10,
      maxDrawdownPctOfReferenceBasis: 5,
      top1PositiveConcentration: 20,
      top3PositiveConcentration: 40,
    }),
    netStress: emptyScenario('STRESS', { completedTrades: completed, expectancyUsd: 0.2 }),
    pnlByToken: [],
    ...overrides,
  };
}

export function openOptimizationState(
  overrides: Partial<OpenOptimizationPositionState> = {},
): OpenOptimizationPositionState {
  const paper = openedExitPosition({
    entryPriceUsd: 100,
    quantityTokens: 1,
    openedAt: O17_ENTRY_OPENED_AT,
    ...(overrides.paper ?? {}),
  });
  return {
    originalQuantityTokens: paper.quantityTokens,
    remainingQuantityTokens: paper.quantityTokens,
    partialTakeTriggered: false,
    highestObservedPostEntryPriceUsd: null,
    realizedLegs: [],
    ...overrides,
    paper,
  };
}

export function eighteenDayWindow(): { startInclusiveMs: number; lastMs: number } {
  return {
    startInclusiveMs: Date.parse(O17_START),
    lastMs: Date.parse(O17_END),
  };
}

export function qualityControlWalkForwardSnapshots(options: {
  oosExitPriceUsd?: number;
  s3ExitPriceUsd?: number;
} = {}): MarketSnapshot[] {
  const snapshots: MarketSnapshot[] = [
    qualityControlOnlySnapshot({
      collectedAt: O17_START,
      tokenMint: optimizationMint(0),
      priceUsd: 100,
    }),
    qualityControlOnlySnapshot({
      collectedAt: O17_END,
      tokenMint: optimizationMint(0),
      priceUsd: 101,
    }),
  ];
  for (let i = 1; i <= 25; i += 1) {
    const tokenMint = optimizationMint(i);
    const entryAt = addMs(O17_START, 3_600_000 + i * 60_000);
    snapshots.push(qualityControlOnlySnapshot({ collectedAt: entryAt, tokenMint, priceUsd: 100 }));
    snapshots.push(
      qualityControlOnlySnapshot({
        collectedAt: addMs(entryAt, 3_600_000),
        tokenMint,
        priceUsd: 120,
      }),
    );
  }
  const s3Start = addMs(O17_START, 6 * 24 * 60 * 60 * 1000);
  const s3Exit = options.s3ExitPriceUsd ?? options.oosExitPriceUsd ?? 80;
  for (let i = 26; i <= 35; i += 1) {
    const tokenMint = optimizationMint(i);
    const entryAt = addMs(s3Start, 3_600_000 + (i - 26) * 60_000);
    snapshots.push(qualityControlOnlySnapshot({ collectedAt: entryAt, tokenMint, priceUsd: 100 }));
    snapshots.push(
      qualityControlOnlySnapshot({
        collectedAt: addMs(entryAt, 3_600_000),
        tokenMint,
        priceUsd: s3Exit,
      }),
    );
  }
  return snapshots;
}

export { PAIR_ADDRESS, addMs, researchRisk };
