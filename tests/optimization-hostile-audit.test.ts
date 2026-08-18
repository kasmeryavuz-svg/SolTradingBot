import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FINDING_CODES } from '../src/risk/constants.js';
import { researchMarketObservationIdentity, RESEARCH_DEFINITION_FINGERPRINT } from '../src/research/identity.js';
import { listResearchCandidateDescriptors } from '../src/research/catalog.js';
import { makeResearchDataset } from './research-fixtures.js';
import { createSqlitePersistenceRepository, SqlitePersistenceRepository } from '../src/persistence/index.js';
import { LATEST_SCHEMA_VERSION, migrationSqlDigest } from '../src/persistence/sqlite/migrations.js';
import {
  applyEntryFriction,
  applyExitFriction,
  allocatedNetPnlUsdForRealizedLegs,
  COST_DEFINITION_FINGERPRINT,
  canonicalCostDefinition,
  netPnlUsd,
} from '../src/optimization/costs.js';
import {
  OPTIMIZATION_DEFINITION_FINGERPRINT,
  fingerprintOptimizationDataset,
  fingerprintOptimizationFold,
  fingerprintOptimizationRun,
} from '../src/optimization/identity.js';
import {
  chronologicalCutMs,
  assertExactSegmentPartition,
} from '../src/optimization/partition.js';
import {
  buildChronologicalSegments,
  buildFoldBoundaries,
  fullHistoryWindow,
  isEntryEligible,
  testWindow,
  trainWindow,
} from '../src/optimization/folds.js';
import { evaluateStructuralReadiness } from '../src/optimization/readiness.js';
import { evaluateOptimizationEntry } from '../src/optimization/entries.js';
import {
  formatOptimizationCatalogLines,
  formatOptimizationRunLines,
} from '../src/optimization/format.js';
import {
  listOptimizationEntryDescriptors,
  optimizationEntryCatalog,
  optimizationExitCatalog,
} from '../src/optimization/catalog.js';
import { remainingAfterClose, closeFractionQuantity } from '../src/optimization/partial-exits.js';
import { coverageFromCounts, profitFactorFromSums } from '../src/optimization/metrics.js';
import { reconstructIndexedPointInTimeVector, buildOptimizationIndexes } from '../src/optimization/timeline.js';
import { runAnchoredWalkForward } from '../src/optimization/walk-forward.js';
import {
  executeOptimizationData,
  executeOptimizationFolds,
  executeOptimizationRun,
  prepareOptimizationCommand,
} from '../src/optimization/command.js';
import { evaluateOptimizationExitStep } from '../src/optimization/exits.js';
import {
  O17_END,
  O17_ENTRY_OPENED_AT,
  O17_START,
  makeOptimizationDataset,
  optimizationMint,
  promotingWalkForwardSnapshots,
  qualityControlOnlySnapshot,
  researchRisk,
  risksForSnapshots,
  simulatePair,
  openOptimizationState,
} from './optimization-fixtures.js';
import { addMs, exitMarketSnapshot } from './exit-fixtures.js';
import { OTHER_PAIR } from './feature-fixtures.js';

const tempDirs: string[] = [];
const openRepos: SqlitePersistenceRepository[] = [];

afterEach(() => {
  while (openRepos.length > 0) {
    openRepos.pop()?.close();
  }
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory !== undefined) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

describe('hostile integer partitions', () => {
  it('constructs an exact integer partition for span 0, 1, 5, 6, and not-divisible-by-6', () => {
    const first = 1_000_000;
    expect(chronologicalCutMs(first, first)).toEqual([first, first, first, first, first, first, first]);
    expect(chronologicalCutMs(first, first + 1)[6]).toBe(first + 1);
    expect(chronologicalCutMs(first, first + 5)[6]).toBe(first + 5);
    expect(chronologicalCutMs(first, first + 6)).toEqual([
      first,
      first + 1,
      first + 2,
      first + 3,
      first + 4,
      first + 5,
      first + 6,
    ]);
    const odd = chronologicalCutMs(first, first + 7);
    expect(odd[6]).toBe(first + 7);
    expect(odd.every((value) => Number.isInteger(value))).toBe(true);
  });

  it('assigns every snapshot to exactly one segment, including exact boundaries', () => {
    const stamps = [0, 1, 2, 3, 4, 5, 6, 7].map((offset) =>
      qualityControlOnlySnapshot({
        collectedAt: iso(Date.parse(O17_START) + offset),
        tokenMint: optimizationMint(offset + 1),
      }),
    );
    const dataset = makeOptimizationDataset(stamps);
    const segments = buildChronologicalSegments(dataset);
    expect(segments).not.toBeNull();
    if (segments === null || dataset.lastSnapshotAt === null) {
      throw new Error('segments');
    }
    assertExactSegmentPartition(dataset.marketSnapshots, segments, Date.parse(dataset.lastSnapshotAt));
    expect(segments.reduce((sum, segment) => sum + segment.snapshotCount, 0)).toBe(stamps.length);
    expect(segments.every((segment) => Number.isInteger(segment.startInclusiveMs))).toBe(true);
    expect(JSON.stringify(segments)).not.toMatch(/\.\d/);
  });

  it('keeps membership and fingerprints stable after row reorder', () => {
    const snapshots = promotingWalkForwardSnapshots();
    const forward = makeOptimizationDataset(snapshots);
    const reversed = makeOptimizationDataset([...snapshots].reverse());
    expect(forward.includedMarketObservationIdentities).toEqual(reversed.includedMarketObservationIdentities);
    expect(forward.optimizationDatasetFingerprint).toBe(reversed.optimizationDatasetFingerprint);
    const forwardSeg = buildChronologicalSegments(forward);
    const reversedSeg = buildChronologicalSegments(reversed);
    expect(forwardSeg?.map((segment) => segment.snapshotCount)).toEqual(
      reversedSeg?.map((segment) => segment.snapshotCount),
    );
    const forwardFolds = buildFoldBoundaries(forward, forwardSeg ?? []);
    const reversedFolds = buildFoldBoundaries(reversed, reversedSeg ?? []);
    expect(forwardFolds?.map((fold) => fold.optimizationFoldFingerprint)).toEqual(
      reversedFolds?.map((fold) => fold.optimizationFoldFingerprint),
    );
  });
});

describe('hostile structural readiness', () => {
  it('does not print a generic YES when partitions exist but folds are unevaluable', () => {
    const dataset = makeOptimizationDataset([
      qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(0) }),
      qualityControlOnlySnapshot({ collectedAt: O17_END, tokenMint: optimizationMint(0), priceUsd: 101 }),
    ]);
    const segments = buildChronologicalSegments(dataset);
    const folds = buildFoldBoundaries(dataset, segments ?? []);
    const readiness = evaluateStructuralReadiness({
      dataset,
      segments,
      folds,
      promotionDataSufficient: false,
    });
    expect(readiness.timePartitionsConstructible).toBe(true);
    expect(readiness.walkForwardEvaluable).toBe(false);
    expect(readiness.promotionDataSufficient).toBe(false);
  });

  it('treats a zero-span dataset as constructible but not evaluable', () => {
    const dataset = makeOptimizationDataset([
      qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(1) }),
      qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(2) }),
    ]);
    const segments = buildChronologicalSegments(dataset);
    const folds = segments === null ? null : buildFoldBoundaries(dataset, segments);
    const report = runAnchoredWalkForward(dataset);
    expect(segments).not.toBeNull();
    expect(report.readiness.timePartitionsConstructible).toBe(true);
    expect(report.readiness.walkForwardEvaluable).toBe(false);
    expect(report.promotionStatus).toBe('NO_PROMOTION_INSUFFICIENT_DATA');
    expect(report.paperValidationCandidate).toBeNull();
    expect(report.paperSelectionInvoked).toBe(false);
    expect(folds?.[0]?.trainLatestEntryInclusiveMs).toBeLessThan(folds?.[0]?.trainStartInclusiveMs ?? 0);
  });
});

describe('hostile catalog is machine-grounded', () => {
  it('prints the production catalog fingerprints without manual correction text', () => {
    const lines = formatOptimizationCatalogLines();
    const text = lines.join('\n');
    expect(text).not.toMatch(/wait, I need the exact one/i);
    expect(text).toContain('flow_confirmed_momentum_v1');
    const flow = listOptimizationEntryDescriptors().find((item) => item.candidateId === 'flow_confirmed_momentum_v1');
    expect(flow?.candidateDefinitionFingerprint).toBe(
      'fcf9c752ebef4982d47ce37d59ed75479ea718a6c1eb3da9cec94442e462ece3',
    );
    expect(text).toContain(flow?.candidateDefinitionFingerprint ?? '');
    const entries = optimizationEntryCatalog();
    const exits = optimizationExitCatalog();
    expect(entries).toHaveLength(8);
    expect(exits).toHaveLength(5);
    for (const entry of entries) {
      expect(text).toContain(`${entry.candidateId} | `);
      expect(text).toContain(entry.candidateDefinitionFingerprint);
    }
    for (const exit of exits) {
      expect(text).toContain(`${exit.candidateId} | `);
      expect(text).toContain(exit.candidateDefinitionFingerprint);
    }
    const research = Object.fromEntries(
      listResearchCandidateDescriptors().map((item) => [item.candidateId, item.candidateDefinitionFingerprint]),
    );
    for (const entry of listOptimizationEntryDescriptors().filter((item) => item.frozenR125)) {
      expect(entry.candidateDefinitionFingerprint).toBe(research[entry.candidateId]);
    }
  });
});

describe('hostile r125 universe equality', () => {
  it('includes exactly the same snapshot identities as r125 before fold slicing', () => {
    const snapshots = [
      qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(1) }),
      qualityControlOnlySnapshot({ collectedAt: addMs(O17_START, 1), tokenMint: optimizationMint(2) }),
    ];
    const excluded = qualityControlOnlySnapshot({
      collectedAt: addMs(O17_START, 2),
      tokenMint: optimizationMint(3),
    });
    const options = {
      excludedRuntimeExitMarketIdentities: [researchMarketObservationIdentity(excluded)],
      runtimeExitReferencedSnapshotCountExcluded: 1,
      rawMarketSnapshotCount: 3,
    };
    const risks = risksForSnapshots(snapshots);
    const research = makeResearchDataset(snapshots, risks, options);
    const dataset = makeOptimizationDataset(snapshots, risks, options);
    expect(dataset.includedMarketObservationIdentities).toEqual(research.includedMarketObservationIdentities);
    expect(dataset.researchDatasetFingerprint).toBe(research.researchDatasetFingerprint);
    expect(dataset.researchMarketSnapshotCount).toBe(2);
    expect(dataset.runtimeExitReferencedSnapshotCountExcluded).toBe(1);
    expect(dataset.includedMarketObservationIdentities).not.toContain(researchMarketObservationIdentity(excluded));
    expect(research.researchDefinitionFingerprint).toBe(RESEARCH_DEFINITION_FINGERPRINT);
  });
});

describe('hostile dataset fingerprint projection', () => {
  it('changes when an economically consumed market, risk, or exclusion fact changes', () => {
    const baseSnapshots = [
      qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(1), priceUsd: 100 }),
    ];
    const baseRisk = [researchRisk({ tokenMint: optimizationMint(1), scannedAt: addMs(O17_START, -60_000) })];
    const base = makeOptimizationDataset(baseSnapshots, baseRisk);
    const mutations: Array<{ label: string; dataset: ReturnType<typeof makeOptimizationDataset> }> = [
      {
        label: 'token mint',
        dataset: makeOptimizationDataset(
          [qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(2), priceUsd: 100 })],
          [researchRisk({ tokenMint: optimizationMint(2), scannedAt: addMs(O17_START, -60_000) })],
        ),
      },
      {
        label: 'pair',
        dataset: makeOptimizationDataset(
          [qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(1), pairAddress: OTHER_PAIR })],
          baseRisk,
        ),
      },
      {
        label: 'collectedAt',
        dataset: makeOptimizationDataset(
          [qualityControlOnlySnapshot({ collectedAt: addMs(O17_START, 1), tokenMint: optimizationMint(1) })],
          baseRisk,
        ),
      },
      {
        label: 'priceUsd',
        dataset: makeOptimizationDataset(
          [qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(1), priceUsd: 101 })],
          baseRisk,
        ),
      },
      {
        label: 'liquidity',
        dataset: makeOptimizationDataset(
          [qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(1), liquidityUsd: 90_000 })],
          baseRisk,
        ),
      },
      {
        label: 'pairCreatedAt',
        dataset: makeOptimizationDataset(
          [qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(1), pairCreatedAt: addMs(O17_START, -2_000_000) })],
          baseRisk,
        ),
      },
      {
        label: 'trades',
        dataset: makeOptimizationDataset(
          [qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(1), buys5m: 21, sells5m: 10 })],
          baseRisk,
        ),
      },
      {
        label: 'volume',
        dataset: makeOptimizationDataset(
          [qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(1), volume5mUsd: 9_000 })],
          baseRisk,
        ),
      },
      {
        label: 'price change',
        dataset: makeOptimizationDataset(
          [qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(1), priceChange5mPct: 2 })],
          baseRisk,
        ),
      },
      {
        label: 'risk scan time',
        dataset: makeOptimizationDataset(baseSnapshots, [
          researchRisk({ tokenMint: optimizationMint(1), scannedAt: addMs(O17_START, -1_000) }),
        ]),
      },
      {
        label: 'finding',
        dataset: makeOptimizationDataset(baseSnapshots, [
          researchRisk({
            tokenMint: optimizationMint(1),
            scannedAt: addMs(O17_START, -60_000),
            findings: [
              {
                code: FINDING_CODES.MINT_AUTHORITY_ACTIVE,
                category: 'authority',
                severity: 'critical',
                confidence: 'high',
                title: 'mint',
                description: 'active',
              },
            ],
          }),
        ]),
      },
      {
        label: 'exclusion provenance',
        dataset: makeOptimizationDataset(baseSnapshots, baseRisk, {
          excludedRuntimeExitMarketIdentities: baseSnapshots[0]
            ? [researchMarketObservationIdentity(baseSnapshots[0])]
            : [],
          runtimeExitReferencedSnapshotCountExcluded: 1,
          rawMarketSnapshotCount: 2,
        }),
      },
    ];
    for (const mutation of mutations) {
      expect(mutation.dataset.optimizationDatasetFingerprint, mutation.label).not.toBe(
        base.optimizationDatasetFingerprint,
      );
    }
    expect(
      fingerprintOptimizationDataset({
        includedMarketObservationIdentities: base.includedMarketObservationIdentities,
        riskEvidenceIdentities: base.riskEvidenceIdentities,
        excludedRuntimeExitMarketIdentities: base.excludedRuntimeExitMarketIdentities,
        runtimeExitReferencedSnapshotCountExcluded: base.runtimeExitReferencedSnapshotCountExcluded,
        firstSnapshotAt: base.firstSnapshotAt,
        lastSnapshotAt: base.lastSnapshotAt,
        rawMarketSnapshotCount: base.rawMarketSnapshotCount,
        researchMarketSnapshotCount: base.researchMarketSnapshotCount,
        uniqueTokenCount: base.uniqueTokenCount,
        uniquePairCount: base.uniquePairCount,
        riskScanCount: base.riskScanCount,
      }),
    ).toBe(base.optimizationDatasetFingerprint);
  });
});

describe('hostile synthetic promotion success path', () => {
  it('reaches ELIGIBLE_FOR_FORWARD_PAPER_VALIDATION with exactly one paper candidate', () => {
    const dataset = makeOptimizationDataset(promotingWalkForwardSnapshots());
    const report = runAnchoredWalkForward(dataset);
    expect(report.readiness.timePartitionsConstructible).toBe(true);
    expect(report.readiness.walkForwardEvaluable).toBe(true);
    expect(report.integrity.status).toBe('PASS');
    expect(report.folds).toHaveLength(4);
    for (const fold of report.folds) {
      expect(fold.entryTrainingTable).toHaveLength(8);
      expect(fold.exitTrainingTable).toHaveLength(5);
      expect(fold.selectedEntryId).toBe('quality_control_v1');
      expect(fold.selectedExitId).toBe('x11_baseline');
      expect(fold.oosSelected?.entryCandidateId).toBe('quality_control_v1');
      expect(fold.oosSelected?.exitCandidateId).toBe('x11_baseline');
      expect(fold.oosSelected?.coverage.completedTrades ?? 0).toBeGreaterThanOrEqual(5);
      expect(fold.oosBaseline.coverage.completedTrades).toBeGreaterThanOrEqual(5);
    }
    expect(report.aggregateSelectedOos?.coverage.completedTrades ?? 0).toBeGreaterThanOrEqual(40);
    expect(report.aggregateBaselineOos?.coverage.completedTrades ?? 0).toBeGreaterThanOrEqual(40);
    expect(report.promotionStatus).toBe('ELIGIBLE_FOR_FORWARD_PAPER_VALIDATION');
    expect(report.readiness.promotionDataSufficient).toBe(true);
    expect(report.paperSelectionInvoked).toBe(true);
    expect(report.paperValidationCandidate).not.toBeNull();
    expect(report.paperValidationCandidate?.entryCandidateId).toBe('quality_control_v1');
    expect(report.paperValidationCandidate?.exitCandidateId).toBe('x11_baseline');
    expect(report.aggregateSelectedKind).toBe('single_frozen_pair');
    const formatted = formatOptimizationRunLines(report).join('\n');
    expect(formatted).toContain('Time partitions constructible: YES');
    expect(formatted).toContain('Walk-forward evaluable: YES');
    expect(formatted).toContain('Promotion data sufficient: YES');
    expect(formatted).toContain('walk-forward selection methodology');
    expect(formatted).toContain('PAPER_VALIDATION_CANDIDATE');
    expect(formatted).toContain('not a fresh OOS proof');
    expect(formatted).not.toMatch(/PROFITABLE|WINNER|LIVE READY|EDGE PROVEN/);
    expect(formatted).toContain('s07_baseline |');
    const oosBlock = formatted.split('OOS selected')[1] ?? '';
    expect(oosBlock.startsWith('\n  quality_control')).toBe(false);
    expect(report.optimizationRunFingerprint).toBe(
      fingerprintOptimizationRun({
        optimizationDefinitionFingerprint: report.optimizationDefinitionFingerprint,
        optimizationDatasetFingerprint: report.optimizationDatasetFingerprint,
      }),
    );
    expect(report.optimizationRunFingerprint).not.toContain(process.cwd());
    const fold = report.folds[0]?.fold;
    if (fold === undefined) {
      throw new Error('fold');
    }
    expect(fold.optimizationFoldFingerprint).toBe(
      fingerprintOptimizationFold({
        optimizationDefinitionFingerprint: OPTIMIZATION_DEFINITION_FINGERPRINT,
        optimizationDatasetFingerprint: dataset.optimizationDatasetFingerprint,
        foldId: fold.foldId,
        trainStartInclusiveMs: fold.trainStartInclusiveMs,
        trainEndExclusiveMs: fold.trainEndExclusiveMs,
        testStartInclusiveMs: fold.testStartInclusiveMs,
        testEndExclusiveMs: fold.testEndExclusiveMs,
        testEndInclusiveMs: fold.testEndInclusiveMs,
        trainLatestEntryInclusiveMs: fold.trainLatestEntryInclusiveMs,
        testLatestEntryInclusiveMs: fold.testLatestEntryInclusiveMs,
      }),
    );
  }, 30_000);

  it('does not invoke the final paper selector when promotion fails', () => {
    const report = runAnchoredWalkForward(
      makeOptimizationDataset([
        qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(0) }),
        qualityControlOnlySnapshot({ collectedAt: O17_END, tokenMint: optimizationMint(0), priceUsd: 101 }),
      ]),
    );
    expect(report.promotionStatus).toBe('NO_PROMOTION_INSUFFICIENT_DATA');
    expect(report.paperSelectionInvoked).toBe(false);
    expect(report.paperValidationCandidate).toBeNull();
  });
});

describe('hostile TRAIN isolation and no inherited positions', () => {
  it('keeps TRAIN selection unchanged when TEST outcomes flip, and does not inherit TRAIN positions', () => {
    const snapshots = promotingWalkForwardSnapshots();
    const dataset = makeOptimizationDataset(snapshots);
    const folds = buildFoldBoundaries(dataset, buildChronologicalSegments(dataset) ?? []);
    const fold1 = folds?.[0];
    if (fold1 === undefined) {
      throw new Error('fold1');
    }
    const trainMint = optimizationMint(200);
    const trainEntry = iso(fold1.trainLatestEntryInclusiveMs - 3_600_000);
    const testObs = iso(fold1.testStartInclusiveMs + 60_000);
    const inherited = [
      ...snapshots,
      qualityControlOnlySnapshot({
        collectedAt: trainEntry,
        tokenMint: trainMint,
        priceUsd: 100,
      }),
      qualityControlOnlySnapshot({
        collectedAt: testObs,
        tokenMint: trainMint,
        priceUsd: 80,
        liquidityUsd: 1,
      }),
    ];
    const report = runAnchoredWalkForward(makeOptimizationDataset(inherited));
    const oos = report.folds[0]?.oosSelected;
    expect(oos?.completedTrades.some((trade) => trade.tokenMint === trainMint && trade.openedAt === trainEntry)).toBe(
      false,
    );
    expect(oos?.unresolvedPositions.some((item) => item.tokenMint === trainMint && item.openedAt === trainEntry)).toBe(
      false,
    );
    expect(report.folds[0]?.selectedEntryId).toBe('quality_control_v1');
  }, 30_000);
});

describe('hostile future feature leakage', () => {
  it('does not let later same-pair, other-pair, risk, or concentration facts change the decision at T', () => {
    const current = qualityControlOnlySnapshot({
      collectedAt: O17_START,
      tokenMint: optimizationMint(1),
      priceUsd: 100,
    });
    const laterSame = qualityControlOnlySnapshot({
      collectedAt: addMs(O17_START, 1),
      tokenMint: optimizationMint(1),
      priceUsd: 9_000,
      liquidityUsd: 9_000_000,
    });
    const laterOther = qualityControlOnlySnapshot({
      collectedAt: addMs(O17_START, 1),
      tokenMint: optimizationMint(1),
      pairAddress: OTHER_PAIR,
      priceUsd: 50,
    });
    const laterAlt = qualityControlOnlySnapshot({
      collectedAt: addMs(O17_START, 1),
      tokenMint: optimizationMint(2),
      priceUsd: 12,
    });
    const nowRisk = researchRisk({ tokenMint: optimizationMint(1), scannedAt: addMs(O17_START, -1_000) });
    const laterRisk = researchRisk({
      tokenMint: optimizationMint(1),
      scannedAt: addMs(O17_START, 1),
      findings: [
        {
          code: FINDING_CODES.MINT_AUTHORITY_ACTIVE,
          category: 'authority',
          severity: 'critical',
          confidence: 'high',
          title: 'mint',
          description: 'after T',
        },
      ],
      concentration: { top1Bps: 9_900, top5Bps: 9_900, top10Bps: 9_900, top20Bps: 9_900, observedAccountsCount: 1 },
    });
    const withFuture = reconstructIndexedPointInTimeVector({
      snapshot: current,
      indexes: buildOptimizationIndexes({
        marketSnapshots: [current, laterSame, laterOther, laterAlt],
        riskReports: [nowRisk, laterRisk],
      }),
    });
    const withoutFuture = reconstructIndexedPointInTimeVector({
      snapshot: current,
      indexes: buildOptimizationIndexes({
        marketSnapshots: [current],
        riskReports: [nowRisk],
      }),
    });
    expect(withFuture.values).toEqual(withoutFuture.values);
    expect(evaluateOptimizationEntry('quality_control_v1', withFuture).decision).toBe(
      evaluateOptimizationEntry('quality_control_v1', withoutFuture).decision,
    );
    expect(evaluateOptimizationEntry('s07_baseline', withFuture).decision).toBe(
      evaluateOptimizationEntry('s07_baseline', withoutFuture).decision,
    );
  });
});

describe('hostile costs, partials, peaks, and gaps', () => {
  it('keeps strategy triggers on the GROSS path so LOW/BASE/STRESS only change PnL', () => {
    const dataset = makeOptimizationDataset([
      qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(1), priceUsd: 100 }),
      qualityControlOnlySnapshot({
        collectedAt: addMs(O17_START, 3_600_000),
        tokenMint: optimizationMint(1),
        priceUsd: 120,
      }),
      qualityControlOnlySnapshot({ collectedAt: O17_END, tokenMint: optimizationMint(2), liquidityUsd: 1 }),
    ]);
    const window = fullHistoryWindow(dataset);
    if (window === null) {
      throw new Error('window');
    }
    const result = simulatePair(dataset, 'quality_control_v1', 'x11_baseline', window);
    expect(result.completedTrades).toHaveLength(1);
    const trade = result.completedTrades[0];
    if (trade === undefined) {
      throw new Error('trade');
    }
    expect(trade.openedAt).toBe(O17_START);
    expect(trade.exitedAt).toBe(addMs(O17_START, 3_600_000));
    expect(trade.legs.map((leg) => leg.reason)).toEqual(['take_profit_threshold']);
    expect(trade.originalQuantityTokens).toBe(1);
    expect(trade.grossPnlUsd).not.toBe(trade.netLowPnlUsd);
    expect(trade.netLowPnlUsd).not.toBe(trade.netBasePnlUsd);
    expect(trade.netBasePnlUsd).not.toBe(trade.netStressPnlUsd);
    expect(canonicalCostDefinition().application.triggersUseGrossReferencePathOnly).toBe(true);
    expect(canonicalCostDefinition().application.effectiveCashOutlayMayExceedReferenceNotional).toBe(true);
    expect(applyEntryFriction(100, 500)).toBe(105);
    expect(1 * 105).toBeGreaterThan(100);
  });

  it('allocates entry cost once per original quantity for full exits and once per realized fraction for partials', () => {
    expect(
      netPnlUsd({
        originalQuantityTokens: 1,
        entryReferencePriceUsd: 100,
        legs: [{ quantityTokens: 1, grossExitReferenceUsd: 120 }],
        entryBps: 200,
        exitBps: 200,
      }),
    ).toBeCloseTo(1 * 117.6 - 1 * 102, 10);
    const allocated = allocatedNetPnlUsdForRealizedLegs({
      originalQuantityTokens: 1,
      entryReferencePriceUsd: 100,
      legs: [{ quantityTokens: 0.5, grossExitReferenceUsd: 120 }],
      entryBps: 200,
      exitBps: 200,
    });
    expect(allocated).toBeCloseTo(0.5 * 117.6 - 0.5 * 102, 10);
    expect(() =>
      netPnlUsd({
        originalQuantityTokens: 1,
        entryReferencePriceUsd: 100,
        legs: [{ quantityTokens: 0.5, grossExitReferenceUsd: 120 }],
        entryBps: 200,
        exitBps: 200,
      }),
    ).toThrow(/realized quantity to equal original quantity/);
  });

  it('conserves 50/50 and 67/33 fractions exactly via remainder derivation', () => {
    const half = closeFractionQuantity(1, 0.5);
    const halfRemain = remainingAfterClose(1, half);
    expect(half + halfRemain).toBe(1);
    const moon = closeFractionQuantity(1, 0.67);
    const moonRemain = remainingAfterClose(1, moon);
    expect(moon + moonRemain).toBe(1);
  });

  it('uses observed 150 as runner peak and 120 as the partial fill', () => {
    const open = openOptimizationState();
    const step = evaluateOptimizationExitStep({
      exitCandidateId: 'partial_runner_v1',
      open,
      marketSnapshot: exitMarketSnapshot(open.paper, {
        priceUsd: 150,
        collectedAt: addMs(O17_ENTRY_OPENED_AT, 60_000),
      }),
      exitMarketIdentity: 'peak-vs-fill',
    });
    expect(step.action).toBe('realize_leg');
    if (step.action === 'realize_leg') {
      expect(step.grossExitReferenceUsd).toBe(120);
      expect(step.observedPriceUsd).toBe(150);
    }
  });

  it('rejects impossible cost inputs', () => {
    expect(() => applyEntryFriction(Number.NaN, 200)).toThrow();
    expect(() => applyEntryFriction(Number.POSITIVE_INFINITY, 200)).toThrow();
    expect(() => applyEntryFriction(-1, 200)).toThrow();
    expect(() => applyEntryFriction(0, 200)).toThrow();
    expect(() => applyExitFriction(-1, 200)).toThrow();
  });
});

describe('hostile metric accounting', () => {
  it('counts opened = completed + unresolved + partially_realized_censored', () => {
    expect(() =>
      coverageFromCounts({
        snapshots: 1,
        uniqueTokenMints: 1,
        uniquePairs: 1,
        openedPositions: 2,
        completedTrades: 1,
        unresolvedTrades: 0,
        partiallyCensoredTrades: 0,
      }),
    ).toThrow(/opened = completed/);
    expect(profitFactorFromSums(0, -5)).toEqual({ kind: 'finite', value: 0 });
    expect(
      coverageFromCounts({
        snapshots: 0,
        uniqueTokenMints: 0,
        uniquePairs: 0,
        openedPositions: 0,
        completedTrades: 0,
        unresolvedTrades: 0,
        partiallyCensoredTrades: 0,
      }).censoredFraction,
    ).toBeNull();
  });

  it('does not treat a partially realized censored runner as a completed trade', () => {
    const dataset = makeOptimizationDataset([
      qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(1), priceUsd: 100 }),
      qualityControlOnlySnapshot({
        collectedAt: addMs(O17_START, 60_000),
        tokenMint: optimizationMint(1),
        priceUsd: 150,
      }),
      qualityControlOnlySnapshot({ collectedAt: O17_END, tokenMint: optimizationMint(2), liquidityUsd: 1 }),
    ]);
    const window = fullHistoryWindow(dataset);
    if (window === null) {
      throw new Error('window');
    }
    const result = simulatePair(dataset, 'quality_control_v1', 'partial_runner_v1', window);
    expect(result.coverage.completedTrades).toBe(0);
    expect(result.coverage.partiallyCensoredTrades).toBe(1);
    expect(result.coverage.openedPositions).toBe(1);
    expect(result.netBase.totalPnlUsd).toBe(0);
    expect(result.netBase.top1PositiveConcentration).toBeNull();
  });
});

describe('hostile cutoff, empty fold, multi-pair, and fingerprints', () => {
  it('treats entryAt == observationEnd-24h as eligible and later entries as ineligible', () => {
    const dataset = makeOptimizationDataset(promotingWalkForwardSnapshots());
    const fold = buildFoldBoundaries(dataset, buildChronologicalSegments(dataset) ?? [])?.[0];
    if (fold === undefined) {
      throw new Error('fold');
    }
    const train = trainWindow(fold);
    expect(isEntryEligible(fold.trainLatestEntryInclusiveMs, train)).toBe(true);
    expect(isEntryEligible(fold.trainLatestEntryInclusiveMs + 1, train)).toBe(false);
    expect(isEntryEligible(fold.trainStartInclusiveMs - 1, train)).toBe(false);
  });

  it('never uses an observation after testEnd', () => {
    const dataset = makeOptimizationDataset(promotingWalkForwardSnapshots());
    const fold = buildFoldBoundaries(dataset, buildChronologicalSegments(dataset) ?? [])?.[0];
    if (fold === undefined) {
      throw new Error('fold');
    }
    const test = testWindow(fold);
    const after = (fold.testEndExclusiveMs ?? fold.testEndInclusiveMs) + 1;
    const isolated = makeOptimizationDataset([
      qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(9), priceUsd: 100 }),
      qualityControlOnlySnapshot({ collectedAt: O17_END, tokenMint: optimizationMint(9), priceUsd: 101 }),
      qualityControlOnlySnapshot({
        collectedAt: iso(fold.testLatestEntryInclusiveMs),
        tokenMint: optimizationMint(9),
        priceUsd: 100,
      }),
      qualityControlOnlySnapshot({
        collectedAt: iso(after),
        tokenMint: optimizationMint(9),
        priceUsd: 80,
      }),
    ]);
    const result = simulatePair(isolated, 'quality_control_v1', 'x11_baseline', test);
    expect(result.coverage.completedTrades).toBe(0);
  });

  it('binds run and fold fingerprints to o17, costs, catalog, dataset, and integer boundaries', () => {
    const dataset = makeOptimizationDataset(promotingWalkForwardSnapshots());
    const folds = buildFoldBoundaries(dataset, buildChronologicalSegments(dataset) ?? []);
    const fold = folds?.[0];
    if (fold === undefined) {
      throw new Error('fold');
    }
    const runFingerprint = fingerprintOptimizationRun({
      optimizationDefinitionFingerprint: OPTIMIZATION_DEFINITION_FINGERPRINT,
      optimizationDatasetFingerprint: dataset.optimizationDatasetFingerprint,
    });
    expect(runFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(runFingerprint).toBe(
      fingerprintOptimizationRun({
        optimizationDefinitionFingerprint: OPTIMIZATION_DEFINITION_FINGERPRINT,
        optimizationDatasetFingerprint: dataset.optimizationDatasetFingerprint,
      }),
    );
    expect(runFingerprint).not.toContain(process.cwd());
    expect(fold.optimizationFoldFingerprint).toBe(
      fingerprintOptimizationFold({
        optimizationDefinitionFingerprint: OPTIMIZATION_DEFINITION_FINGERPRINT,
        optimizationDatasetFingerprint: dataset.optimizationDatasetFingerprint,
        foldId: fold.foldId,
        trainStartInclusiveMs: fold.trainStartInclusiveMs,
        trainEndExclusiveMs: fold.trainEndExclusiveMs,
        testStartInclusiveMs: fold.testStartInclusiveMs,
        testEndExclusiveMs: fold.testEndExclusiveMs,
        testEndInclusiveMs: fold.testEndInclusiveMs,
        trainLatestEntryInclusiveMs: fold.trainLatestEntryInclusiveMs,
        testLatestEntryInclusiveMs: fold.testLatestEntryInclusiveMs,
      }),
    );
    const mutatedDatasetFingerprint = fingerprintOptimizationRun({
      optimizationDefinitionFingerprint: OPTIMIZATION_DEFINITION_FINGERPRINT,
      optimizationDatasetFingerprint: '0'.repeat(64),
    });
    const mutatedDefinitionFingerprint = fingerprintOptimizationRun({
      optimizationDefinitionFingerprint: '1'.repeat(64),
      optimizationDatasetFingerprint: dataset.optimizationDatasetFingerprint,
    });
    expect(mutatedDatasetFingerprint).not.toBe(runFingerprint);
    expect(mutatedDefinitionFingerprint).not.toBe(runFingerprint);
    expect(
      fingerprintOptimizationFold({
        optimizationDefinitionFingerprint: OPTIMIZATION_DEFINITION_FINGERPRINT,
        optimizationDatasetFingerprint: dataset.optimizationDatasetFingerprint,
        foldId: fold.foldId,
        trainStartInclusiveMs: fold.trainStartInclusiveMs,
        trainEndExclusiveMs: fold.trainEndExclusiveMs,
        testStartInclusiveMs: fold.testStartInclusiveMs,
        testEndExclusiveMs: fold.testEndExclusiveMs,
        testEndInclusiveMs: fold.testEndInclusiveMs,
        trainLatestEntryInclusiveMs: fold.trainLatestEntryInclusiveMs,
        testLatestEntryInclusiveMs: fold.testLatestEntryInclusiveMs + 1,
      }),
    ).not.toBe(fold.optimizationFoldFingerprint);
    expect(COST_DEFINITION_FINGERPRINT).toMatch(/^[0-9a-f]{64}$/);
    expect(optimizationEntryCatalog()).toHaveLength(8);
    expect(optimizationExitCatalog()).toHaveLength(5);
  });
});

describe('hostile read-only sqlite and import graph', () => {
  it('leaves the database file hash unchanged after data/run/folds', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-o17-hash-'));
    tempDirs.push(directory);
    const path = join(directory, 'history.sqlite');
    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    repository.initialize();
    openRepos.push(repository);
    repository.close();
    openRepos.pop();
    const before = createHash('sha256').update(readFileSync(path)).digest('hex');
    const config = prepareOptimizationCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path });
    executeOptimizationData(config);
    executeOptimizationRun(config);
    executeOptimizationFolds(config);
    const after = createHash('sha256').update(readFileSync(path)).digest('hex');
    expect(after).toBe(before);
  });

  it('does not reach live, wallet, DexScreener fetch, or execution RPC from src/optimization', () => {
    const seen = new Set<string>();
    const queue = readdirSync(join(process.cwd(), 'src/optimization'), { recursive: true })
      .filter((name): name is string => typeof name === 'string' && name.endsWith('.ts'))
      .map((name) => join(process.cwd(), 'src/optimization', name));
    while (queue.length > 0) {
      const file = queue.pop();
      if (file === undefined || seen.has(file)) {
        continue;
      }
      seen.add(file);
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/Math\.random\s*\(/);
      expect(text, file).not.toMatch(/from ['"]optuna['"]/);
      expect(text, file).not.toMatch(/createHyperopt|optuna\.create/);
      for (const match of text.matchAll(/from '(\.\.?\/[^']+)\.js'/g)) {
        const specifier = match[1];
        if (specifier === undefined) {
          continue;
        }
        const resolved = `${normalize(join(dirname(file), specifier))}.ts`;
        if (resolved.includes('src\\optimization') || resolved.includes('src/optimization') || seen.has(resolved)) {
          continue;
        }
        queue.push(resolved);
      }
    }
    const normalized = [...seen].map((file) => file.replaceAll('\\', '/'));
    expect(normalized.some((file) => file.includes('/src/live/'))).toBe(false);
    expect(normalized.some((file) => file.includes('/src/wallet/'))).toBe(false);
    expect(normalized.some((file) => file.includes('/src/execution/rpc'))).toBe(false);
    expect(LATEST_SCHEMA_VERSION).toBe(8);
    expect(migrationSqlDigest(8)).toBe(
      'e4c5ee0d56a8ffe5d916da3bd68d3792f48ac4ffbcce004ababa983d792747d0',
    );
  });
});
