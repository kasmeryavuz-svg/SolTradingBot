import { describe, expect, it } from 'vitest';
import { generateFeatureVector } from '../src/features/engine.js';
import { selectPreviousMarket } from '../src/backtest/timeline.js';
import {
  evaluateResearchCandidate,
  reconstructPointInTimeVector,
} from '../src/research/index.js';
import { addMs } from './exit-fixtures.js';
import { T_09_30, previousSnapshot } from './feature-fixtures.js';
import { allEntrySnapshot, makeResearchDataset, researchRisk } from './research-fixtures.js';
import { passingSnapshot } from './strategy-fixtures.js';

describe('point-in-time reconstruction and lookahead', () => {
  it('does not let a future snapshot alter the feature vector at T', () => {
    const current = allEntrySnapshot({ collectedAt: '2026-08-17T10:00:00.000Z', priceUsd: 1 });
    const earlier = previousSnapshot({
      tokenMint: current.tokenMint,
      pairAddress: current.pairAddress,
      collectedAt: T_09_30,
      priceUsd: 0.8,
    });
    const future = allEntrySnapshot({
      collectedAt: addMs(current.collectedAt, 60_000),
      priceUsd: 9,
      liquidityUsd: 9_000_000,
    });
    const risk = researchRisk();
    const atT = reconstructPointInTimeVector({
      snapshot: current,
      researchMarketSnapshots: [earlier, current, future],
      riskReports: [risk],
    });
    const withoutFuture = reconstructPointInTimeVector({
      snapshot: current,
      researchMarketSnapshots: [earlier, current],
      riskReports: [risk],
    });
    expect(atT.values).toEqual(withoutFuture.values);
    expect(atT.previousMarketCollectedAt).toBe(T_09_30);
  });

  it('does not let a future risk scan alter the candidate decision at T', () => {
    const current = allEntrySnapshot();
    const nowRisk = researchRisk({ scannedAt: '2026-08-17T09:55:00.000Z' });
    const futureRisk = researchRisk({
      scannedAt: addMs(current.collectedAt, 1_000),
      findings: [
        {
          code: 'MINT_AUTHORITY_ACTIVE',
          category: 'authority',
          severity: 'high',
          confidence: 'high',
          title: 'mint',
          description: 'future',
        },
      ],
    });
    const decisionNow = evaluateResearchCandidate(
      'quality_control_v1',
      reconstructPointInTimeVector({
        snapshot: current,
        researchMarketSnapshots: [current],
        riskReports: [nowRisk, futureRisk],
      }),
    );
    const decisionWithoutFuture = evaluateResearchCandidate(
      'quality_control_v1',
      reconstructPointInTimeVector({
        snapshot: current,
        researchMarketSnapshots: [current],
        riskReports: [nowRisk],
      }),
    );
    expect(decisionNow.decision).toBe(decisionWithoutFuture.decision);
    expect(decisionNow.decision).toBe('entry_candidate');
  });

  it('cannot use the current snapshot or a same-timestamp snapshot as previousMarket', () => {
    const current = allEntrySnapshot({ collectedAt: '2026-08-17T10:00:00.000Z' });
    const sameTime = passingSnapshot({
      tokenMint: current.tokenMint,
      pairAddress: current.pairAddress,
      collectedAt: current.collectedAt,
      priceUsd: 2,
    });
    expect(selectPreviousMarket(current, [current, sameTime])).toBeNull();
    const vector = reconstructPointInTimeVector({
      snapshot: current,
      researchMarketSnapshots: [current, sameTime],
      riskReports: [researchRisk()],
    });
    expect(vector.previousMarketCollectedAt).toBeNull();
  });

  it('candidate evaluation cannot inspect a later exit or later PnL because it only sees the vector', () => {
    const current = allEntrySnapshot();
    const vector = reconstructPointInTimeVector({
      snapshot: current,
      researchMarketSnapshots: [
        current,
        allEntrySnapshot({ collectedAt: addMs(current.collectedAt, 60_000), priceUsd: 0 }),
      ],
      riskReports: [researchRisk()],
    });
    const later = generateFeatureVector(
      {
        market: allEntrySnapshot({ collectedAt: addMs(current.collectedAt, 60_000), priceUsd: 0 }),
        previousMarket: current,
        risk: researchRisk(),
        riskUnavailableReason: null,
        asOf: addMs(current.collectedAt, 60_000),
      },
      { generatedAt: addMs(current.collectedAt, 60_000) },
    );
    expect(evaluateResearchCandidate('quality_control_v1', vector).decision).toBe('entry_candidate');
    expect(later.values.some((value) => value.name === 'market_price_usd' && value.value === 0)).toBe(true);
  });
});

describe('dataset identity', () => {
  it('changes when one included market observation changes', () => {
    const first = makeResearchDataset([allEntrySnapshot({ priceUsd: 1 })]);
    const second = makeResearchDataset([allEntrySnapshot({ priceUsd: 1.01 })]);
    expect(first.researchDatasetFingerprint).not.toBe(second.researchDatasetFingerprint);
  });

  it('changes when risk evidence changes', () => {
    const first = makeResearchDataset([allEntrySnapshot()], [researchRisk()]);
    const second = makeResearchDataset(
      [allEntrySnapshot()],
      [researchRisk({ scannedAt: '2026-08-17T09:54:00.000Z' })],
    );
    expect(first.researchDatasetFingerprint).not.toBe(second.researchDatasetFingerprint);
  });
});
