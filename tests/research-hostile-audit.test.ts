import { describe, expect, it } from 'vitest';
import { generateFeatureVector } from '../src/features/engine.js';
import { FEATURE_DEFINITIONS, featureRegistrySize } from '../src/features/definitions.js';
import { featureValuesEqual } from '../src/features/invariants.js';
import { selectLatestRisk, selectPreviousMarket } from '../src/backtest/timeline.js';
import { evaluateExitAction } from '../src/exit/evaluator.js';
import { EXIT_MAX_HOLDING_MS } from '../src/exit/constants.js';
import { evaluateStrategy } from '../src/strategy/evaluator.js';
import {
  RESEARCH_DEFINITION_FINGERPRINT,
  assignResearchSlice,
  buildResearchCandidateReport,
  buildResearchCompareReport,
  evaluateResearchCandidate,
  fingerprintResearchDefinition,
  formatResearchCompareLines,
  formatResearchTradeLines,
  mutateCanonicalResearchDefinition,
  reconstructPointInTimeVector,
  simulateResearchCandidate,
  sortResearchMarketEvents,
} from '../src/research/index.js';
import { evaluateS07Baseline } from '../src/research/candidates/s07-baseline.js';
import { EXIT_STOP_PRICE_USD, EXIT_TAKE_PRICE_USD, addMs, openedExitPosition } from './exit-fixtures.js';
import { nextRepresentableNumber, previousRepresentableNumber } from './paper-fixtures.js';
import { OTHER_PAIR, PAIR_ADDRESS } from './feature-fixtures.js';
import { allEntrySnapshot, makeResearchDataset, researchRisk } from './research-fixtures.js';
import { passingVector, withAvailableNumber, withUnavailable } from './strategy-fixtures.js';

const OPENED = '2026-08-17T10:00:00.000Z';

function later(ms: number, overrides: Parameters<typeof allEntrySnapshot>[0] = {}) {
  return allEntrySnapshot({ collectedAt: addMs(OPENED, ms), ...overrides });
}

function mint(index: number): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const suffix = alphabet[index];
  if (suffix === undefined) {
    throw new Error('mint index out of range');
  }
  return `So1111111111111111111111111111111111111111${suffix}`;
}

describe('r125 definition fingerprint completeness', () => {
  it('changes when each major frozen semantic is mutated independently', () => {
    const base = RESEARCH_DEFINITION_FINGERPRINT;
    const mutations: Array<(definition: ReturnType<typeof mutateCanonicalResearchDefinition>) => void> = [
      (definition) => {
        (definition.snapshotUniverse as { excludeRuntimeExitReferencedSnapshots: boolean }).excludeRuntimeExitReferencedSnapshots =
          false;
      },
      (definition) => {
        (definition.pointInTimeReconstruction.riskAsOf as { neverFuture: boolean }).neverFuture = false;
      },
      (definition) => {
        (definition.pointInTimeReconstruction.previousMarket as { strictlyEarlier: boolean }).strictlyEarlier =
          false;
      },
      (definition) => {
        (definition as unknown as { eventOrdering: string[] }).eventOrdering = [
          'tokenMint_ascending',
          'collectedAt_instant_ascending',
          'pairAddress_ascending',
          'deterministic_market_semantic_identity',
          'research_market_observation_identity',
        ];
      },
      (definition) => {
        (definition as { sameTimestampSameTokenLifecycle: string }).sameTimestampSameTokenLifecycle = 'other';
      },
      (definition) => {
        (definition as { oneOpenPositionPerTokenMint: boolean }).oneOpenPositionPerTokenMint = false;
      },
      (definition) => {
        definition.entry.referenceNotionalUsd = 50;
      },
      (definition) => {
        definition.entry.quantityFormula = 'other';
      },
      (definition) => {
        (definition.exit as { exactOpeningPairOnly: boolean }).exactOpeningPairOnly = false;
      },
      (definition) => {
        definition.exit.fingerprint = '0'.repeat(64);
      },
      (definition) => {
        (definition as { noSameSnapshotReentry: boolean }).noSameSnapshotReentry = false;
      },
      (definition) => {
        (definition.unresolved as { classify: string }).classify = 'mark_to_market';
      },
      (definition) => {
        (definition.identities as { datasetBindsFullMarketObservationFacts: boolean }).datasetBindsFullMarketObservationFacts =
          false;
      },
      (definition) => {
        (definition.performance as { mathematics: string }).mathematics = 'other';
      },
      (definition) => {
        definition.chronologicalSlices.earlyElapsedFraction = 0.5;
      },
      (definition) => {
        (definition as { noOptimization: boolean }).noOptimization = false;
      },
      (definition) => {
        (definition as { noRankingOrWinnerSelection: boolean }).noRankingOrWinnerSelection = false;
      },
      (definition) => {
        (definition.database as { queryOnly: boolean }).queryOnly = false;
      },
      (definition) => {
        (definition.database as { noNetwork: boolean }).noNetwork = false;
      },
      (definition) => {
        (definition.sampleAdequacy as { noNumericValidityThreshold: boolean }).noNumericValidityThreshold =
          false;
      },
    ];

    for (const mutate of mutations) {
      expect(fingerprintResearchDefinition(mutateCanonicalResearchDefinition(mutate))).not.toBe(base);
    }
  });
});

describe('point-in-time equality with frozen b08 reconstruction', () => {
  it('matches generateFeatureVector + b08 previous/risk selectors for all 48 features', () => {
    expect(featureRegistrySize()).toBe(48);
    expect(FEATURE_DEFINITIONS).toHaveLength(48);
    const current = allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1.25 });
    const earlier = allEntrySnapshot({ collectedAt: addMs(OPENED, -60_000), priceUsd: 1.1 });
    const snapshots = [earlier, current];
    const risk = [researchRisk({ scannedAt: addMs(OPENED, -1_000) })];
    const research = reconstructPointInTimeVector({
      snapshot: current,
      researchMarketSnapshots: snapshots,
      riskReports: risk,
    });
    const asOf = current.collectedAt;
    const b08 = generateFeatureVector(
      {
        market: current,
        previousMarket: selectPreviousMarket(current, snapshots),
        risk: selectLatestRisk(current.tokenMint, asOf, risk),
        riskUnavailableReason: null,
        asOf,
      },
      { generatedAt: asOf },
    );
    expect(featureValuesEqual(research.values, b08.values)).toBe(true);
    expect(research.values).toHaveLength(48);
  });
});

describe('future-data and as-of boundaries', () => {
  it('ignores T+1 market, risk, and later research trades when deciding at T', () => {
    const current = allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 });
    const futureMarket = later(1, { priceUsd: 100, liquidityUsd: 9_000_000 });
    const nowRisk = researchRisk({ scannedAt: OPENED });
    const futureDanger = researchRisk({
      scannedAt: addMs(OPENED, 1),
      findings: [
        {
          code: 'MINT_AUTHORITY_ACTIVE',
          category: 'authority',
          severity: 'critical',
          confidence: 'high',
          title: 'mint',
          description: 'after',
        },
      ],
    });
    const atT = reconstructPointInTimeVector({
      snapshot: current,
      researchMarketSnapshots: [current, futureMarket],
      riskReports: [nowRisk, futureDanger],
    });
    const baseline = reconstructPointInTimeVector({
      snapshot: current,
      researchMarketSnapshots: [current],
      riskReports: [nowRisk],
    });
    expect(atT.values).toEqual(baseline.values);
  });

  it('accepts risk scanned exactly at T and rejects risk 1ms after T', () => {
    const current = allEntrySnapshot({ collectedAt: OPENED });
    const exact = reconstructPointInTimeVector({
      snapshot: current,
      researchMarketSnapshots: [current],
      riskReports: [researchRisk({ scannedAt: OPENED })],
    });
    const after = reconstructPointInTimeVector({
      snapshot: current,
      researchMarketSnapshots: [current],
      riskReports: [researchRisk({ scannedAt: addMs(OPENED, 1) })],
    });
    expect(exact.riskScannedAt).toBe(OPENED);
    expect(after.riskScannedAt).toBeNull();
  });

  it('accepts previous market 1ms before T and rejects the same timestamp', () => {
    const current = allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 });
    const oneMsBefore = allEntrySnapshot({ collectedAt: addMs(OPENED, -1), priceUsd: 0.5 });
    const sameTime = allEntrySnapshot({ collectedAt: OPENED, priceUsd: 0.5 });
    expect(selectPreviousMarket(current, [oneMsBefore, current])?.collectedAt).toBe(addMs(OPENED, -1));
    expect(selectPreviousMarket(current, [sameTime, current])).toBeNull();
  });
});

describe('same-timestamp lifecycle freeze', () => {
  it('does not let a second same-token event at the same instant close or re-enter', () => {
    const first = allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1, pairAddress: PAIR_ADDRESS });
    const secondSameTime = allEntrySnapshot({
      collectedAt: OPENED,
      priceUsd: 0.01,
      pairAddress: PAIR_ADDRESS,
      liquidityUsd: 100_001,
    });
    const result = simulateResearchCandidate(makeResearchDataset([first, secondSameTime]), 'quality_control_v1');
    expect(result.completedTrades).toHaveLength(0);
    expect(result.unresolvedPositions).toHaveLength(1);
    expect(result.decisions.entryCandidateCount).toBe(1);
  });

  it('does not let a same-instant different pair become a later lifecycle event', () => {
    const first = allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1, pairAddress: PAIR_ADDRESS });
    const otherPair = allEntrySnapshot({
      collectedAt: OPENED,
      priceUsd: 0.01,
      pairAddress: OTHER_PAIR,
    });
    const result = simulateResearchCandidate(makeResearchDataset([first, otherPair]), 'quality_control_v1');
    const firstSorted = sortResearchMarketEvents([first, otherPair])[0];
    expect(result.unresolvedPositions[0]?.pairAddress).toBe(firstSorted?.pairAddress);
    expect(result.completedTrades).toHaveLength(0);
    expect(result.decisions.entryCandidateCount).toBe(1);
  });
});

describe('one-open token state machine', () => {
  it('ignores a later pair Y entry while X is open, cannot exit on Y, closes on X stop, and may open Y after close', () => {
    const openX = allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1, pairAddress: PAIR_ADDRESS });
    const yWhileOpen = later(1_000, { pairAddress: OTHER_PAIR, priceUsd: 0.01 });
    const xStop = later(2_000, { pairAddress: PAIR_ADDRESS, priceUsd: 0.9 });
    const yAfterClose = later(3_000, { pairAddress: OTHER_PAIR, priceUsd: 1.01 });
    const result = simulateResearchCandidate(
      makeResearchDataset([openX, yWhileOpen, xStop, yAfterClose]),
      'quality_control_v1',
    );
    expect(result.completedTrades).toHaveLength(1);
    expect(result.completedTrades[0]?.pairAddress).toBe(PAIR_ADDRESS);
    expect(result.completedTrades[0]?.exitReason).toBe('stop_loss_threshold');
    expect(result.unresolvedPositions).toHaveLength(1);
    expect(result.unresolvedPositions[0]?.pairAddress).toBe(OTHER_PAIR);
  });

  it('allows overlapping positions on different token mints', () => {
    const tokenA = mint(1);
    const tokenB = mint(2);
    const result = simulateResearchCandidate(
      makeResearchDataset(
        [
          allEntrySnapshot({ tokenMint: tokenA, collectedAt: OPENED, priceUsd: 1 }),
          allEntrySnapshot({ tokenMint: tokenB, collectedAt: addMs(OPENED, 1), priceUsd: 1 }),
        ],
        [
          researchRisk({ tokenMint: tokenA, scannedAt: addMs(OPENED, -1_000) }),
          researchRisk({ tokenMint: tokenB, scannedAt: addMs(OPENED, -1_000) }),
        ],
      ),
      'quality_control_v1',
    );
    expect(result.unresolvedPositions).toHaveLength(2);
    expect(new Set(result.unresolvedPositions.map((position) => position.tokenMint))).toEqual(
      new Set([tokenA, tokenB]),
    );
  });
});

describe('shared x11 boundaries and sparse max-hold', () => {
  it('uses frozen stop/take/max-hold edges and does not interpolate a 6h print', () => {
    const position = openedExitPosition({ openedAt: OPENED, entryPriceUsd: 100, quantityTokens: 1 });
    expect(
      evaluateExitAction({
        openPosition: position,
        marketSnapshot: allEntrySnapshot({ collectedAt: addMs(OPENED, 1_000), priceUsd: 90 }),
      }).exitReason,
    ).toBe('stop_loss_threshold');
    expect(
      evaluateExitAction({
        openPosition: position,
        marketSnapshot: allEntrySnapshot({
          collectedAt: addMs(OPENED, 1_000),
          priceUsd: nextRepresentableNumber(90),
        }),
      }).exitAction,
    ).toBe('no_change');
    expect(
      evaluateExitAction({
        openPosition: position,
        marketSnapshot: allEntrySnapshot({ collectedAt: addMs(OPENED, 1_000), priceUsd: 120 }),
      }).exitReason,
    ).toBe('take_profit_threshold');
    expect(
      evaluateExitAction({
        openPosition: position,
        marketSnapshot: allEntrySnapshot({
          collectedAt: addMs(OPENED, 1_000),
          priceUsd: previousRepresentableNumber(120),
        }),
      }).exitAction,
    ).toBe('no_change');
    expect(
      evaluateExitAction({
        openPosition: position,
        marketSnapshot: allEntrySnapshot({ collectedAt: addMs(OPENED, EXIT_MAX_HOLDING_MS), priceUsd: 105 }),
      }).exitReason,
    ).toBe('max_holding_time');
    expect(
      evaluateExitAction({
        openPosition: position,
        marketSnapshot: allEntrySnapshot({
          collectedAt: addMs(OPENED, EXIT_MAX_HOLDING_MS - 1),
          priceUsd: 105,
        }),
      }).exitAction,
    ).toBe('no_change');
    expect(
      evaluateExitAction({
        openPosition: position,
        marketSnapshot: allEntrySnapshot({
          collectedAt: addMs(OPENED, EXIT_MAX_HOLDING_MS + 1),
          priceUsd: null,
        }),
      }).exitReason,
    ).toBe('market_price_unavailable');
    expect(EXIT_STOP_PRICE_USD).toBe(90);
    expect(EXIT_TAKE_PRICE_USD).toBe(120);

    const sparse = simulateResearchCandidate(
      makeResearchDataset([
        allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 }),
        later(EXIT_MAX_HOLDING_MS + 2 * 60 * 60 * 1000, { priceUsd: 1.05 }),
      ]),
      'quality_control_v1',
    );
    expect(sparse.completedTrades[0]?.exitReason).toBe('max_holding_time');
    expect(sparse.completedTrades[0]?.exitPriceUsd).toBe(1.05);
  });
});

describe('unresolved / censored positions', () => {
  it('keeps opens unresolved when later evidence cannot produce an x11 close', () => {
    const noLater = simulateResearchCandidate(
      makeResearchDataset([allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 })]),
      'quality_control_v1',
    );
    const otherPairOnly = simulateResearchCandidate(
      makeResearchDataset([
        allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 }),
        later(EXIT_MAX_HOLDING_MS + 1_000, { pairAddress: OTHER_PAIR, priceUsd: 0.01 }),
      ]),
      'quality_control_v1',
    );
    const nullPrice = simulateResearchCandidate(
      makeResearchDataset([
        allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 }),
        later(EXIT_MAX_HOLDING_MS + 1_000, { priceUsd: null }),
      ]),
      'quality_control_v1',
    );
    expect(noLater.unresolvedPositions[0]?.unresolvedReason).toBe('unresolved_at_dataset_end');
    expect(otherPairOnly.unresolvedPositions).toHaveLength(1);
    expect(otherPairOnly.completedTrades).toHaveLength(0);
    expect(nullPrice.unresolvedPositions).toHaveLength(1);
    expect(nullPrice.completedTrades).toHaveLength(0);
  });
});

describe('run fingerprint coverage', () => {
  it('changes when decisions change even if completed trades stay empty', () => {
    const passing = makeResearchDataset([allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 })]);
    const blocked = makeResearchDataset([allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1, liquidityUsd: 1 })]);
    const first = buildResearchCandidateReport(passing, 'quality_control_v1');
    const second = buildResearchCandidateReport(blocked, 'quality_control_v1');
    expect(first.lifecycle.completedPositions).toBe(0);
    expect(second.lifecycle.completedPositions).toBe(0);
    expect(first.candidateRunFingerprint).not.toBe(second.candidateRunFingerprint);
  });
});

describe('coverage beside PnL', () => {
  it('makes 3 completed and 17 unresolved obvious next to GROSS PnL', () => {
    const snapshots = [];
    const risks = [];
    for (let index = 0; index < 20; index += 1) {
      const tokenMint = mint(index);
      snapshots.push(allEntrySnapshot({ tokenMint, collectedAt: OPENED, priceUsd: 1 }));
      risks.push(researchRisk({ tokenMint, scannedAt: addMs(OPENED, -1_000) }));
      if (index < 3) {
        snapshots.push(allEntrySnapshot({ tokenMint, collectedAt: addMs(OPENED, 1_000), priceUsd: 1.2 }));
      }
    }
    const report = buildResearchCandidateReport(makeResearchDataset(snapshots, risks), 'quality_control_v1');
    expect(report.lifecycle.completedPositions).toBe(3);
    expect(report.lifecycle.unresolvedPositions).toBe(17);
    const text = formatResearchCompareLines(buildResearchCompareReport(makeResearchDataset(snapshots, risks))).join(
      '\n',
    );
    expect(text).toMatch(/Coverage beside PnL: completed 3 \| unresolved 17/);
    expect(text.indexOf('Unresolved positions at dataset end: 17')).toBeLessThan(text.indexOf('Total GROSS paper PnL'));
  });
});

describe('slice boundaries', () => {
  it('freezes exclusive early/middle ends, span 0, and 1ms span', () => {
    const first = '2026-08-17T10:00:00.000Z';
    const last = '2026-08-17T11:40:00.000Z';
    const span = Date.parse(last) - Date.parse(first);
    const earlyEnd = Date.parse(first) + Math.floor(span * 0.6);
    const middleEnd = Date.parse(first) + Math.floor(span * 0.8);
    expect(
      assignResearchSlice({
        exitedAt: new Date(earlyEnd - 1).toISOString(),
        firstSnapshotAt: first,
        lastSnapshotAt: last,
      }),
    ).toBe('early');
    expect(
      assignResearchSlice({
        exitedAt: new Date(earlyEnd).toISOString(),
        firstSnapshotAt: first,
        lastSnapshotAt: last,
      }),
    ).toBe('middle');
    expect(
      assignResearchSlice({
        exitedAt: new Date(middleEnd).toISOString(),
        firstSnapshotAt: first,
        lastSnapshotAt: last,
      }),
    ).toBe('late');
    expect(assignResearchSlice({ exitedAt: first, firstSnapshotAt: first, lastSnapshotAt: first })).toBe('early');
    const oneMsLast = addMs(first, 1);
    expect(assignResearchSlice({ exitedAt: first, firstSnapshotAt: first, lastSnapshotAt: oneMsLast })).toBe('late');
    expect(assignResearchSlice({ exitedAt: oneMsLast, firstSnapshotAt: first, lastSnapshotAt: oneMsLast })).toBe(
      'late',
    );
  });
});

describe('display limit does not alter simulation identity', () => {
  it('formats 1/20/100 rows without changing fingerprints or metrics', () => {
    const dataset = makeResearchDataset([
      allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 }),
      later(1_000, { priceUsd: 1.2 }),
    ]);
    const report = buildResearchCandidateReport(dataset, 'quality_control_v1');
    const one = formatResearchTradeLines(report, 1).join('\n');
    const twenty = formatResearchTradeLines(report, 20).join('\n');
    const hundred = formatResearchTradeLines(report, 100).join('\n');
    expect(report.researchDatasetFingerprint).toBe(dataset.researchDatasetFingerprint);
    expect(one).toContain('Display limit: 1');
    expect(twenty).toContain('Display limit: 20');
    expect(hundred).toContain('Display limit: 100');
    expect(report.lifecycle.completedPositions).toBe(1);
    expect(report.candidateRunFingerprint.length).toBe(64);
  });
});

describe('s07 randomized wrapper equality', () => {
  it('matches frozen evaluateStrategy on a deterministic synthetic set', () => {
    let seed = 0x9e3779b9;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    for (let index = 0; index < 120; index += 1) {
      let vector = passingVector();
      const feature = FEATURE_DEFINITIONS[Math.floor(next() * FEATURE_DEFINITIONS.length)];
      if (feature === undefined) {
        throw new Error('missing feature definition');
      }
      if (next() < 0.25) {
        vector = withUnavailable(vector, feature.name);
      } else if (feature.kind === 'boolean') {
        vector = withAvailableNumber(vector, 'market_liquidity_usd', next() < 0.5 ? 100_000 : 1);
      } else if (feature.kind === 'integer') {
        vector = withAvailableNumber(vector, feature.name, Math.floor(next() * 400));
      } else {
        vector = withAvailableNumber(vector, feature.name, next() * 200 - 20);
      }
      const frozen = evaluateStrategy(vector, { evaluatedAt: vector.asOf });
      const wrapped = evaluateS07Baseline(vector);
      const routed = evaluateResearchCandidate('s07_baseline', vector);
      expect(wrapped.decision).toBe(frozen.decision);
      expect(routed.decision).toBe(frozen.decision);
      expect(wrapped.rules.map((rule) => rule.status)).toEqual(frozen.rules.map((rule) => rule.status));
    }
  });
});
