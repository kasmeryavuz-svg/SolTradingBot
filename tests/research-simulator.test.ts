import { describe, expect, it } from 'vitest';
import { EXIT_MAX_HOLDING_MS } from '../src/exit/constants.js';
import {
  RESEARCH_CANDIDATE_IDS,
  buildResearchCompareReport,
  simulateResearchCandidate,
} from '../src/research/index.js';
import { addMs } from './exit-fixtures.js';
import { OTHER_PAIR } from './feature-fixtures.js';
import { allEntrySnapshot, makeResearchDataset, researchRisk } from './research-fixtures.js';
import { WRAPPED_SOL_MINT } from './strategy-fixtures.js';

const OPENED = '2026-08-17T10:00:00.000Z';

function later(ms: number, overrides: Parameters<typeof allEntrySnapshot>[0] = {}) {
  return allEntrySnapshot({ collectedAt: addMs(OPENED, ms), ...overrides });
}

describe('research event loop', () => {
  it('opens when no position exists and ignores later entry signals while open', () => {
    const dataset = makeResearchDataset([
      allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 }),
      later(60_000, { priceUsd: 1.05 }),
    ]);
    const result = simulateResearchCandidate(dataset, 'quality_control_v1');
    expect(result.decisions.entryCandidateCount).toBe(1);
    expect(result.completedTrades).toHaveLength(0);
    expect(result.unresolvedPositions).toHaveLength(1);
    expect(result.decisions.skippedWhileOpenCount).toBe(1);
  });

  it('cannot switch pairs while a token is open and uses the exact opening pair for exits', () => {
    const dataset = makeResearchDataset([
      allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1, pairAddress: allEntrySnapshot().pairAddress }),
      later(60_000, { pairAddress: OTHER_PAIR, priceUsd: 0.01 }),
      later(120_000, { priceUsd: 1.2 }),
    ]);
    const result = simulateResearchCandidate(dataset, 'quality_control_v1');
    expect(result.completedTrades).toHaveLength(1);
    expect(result.completedTrades[0]?.pairAddress).toBe(allEntrySnapshot().pairAddress);
    expect(result.completedTrades[0]?.exitReason).toBe('take_profit_threshold');
  });

  it('closes on stop, take, max-hold, holds on unavailable price, and stop-closes on zero', () => {
    const stop = simulateResearchCandidate(
      makeResearchDataset([allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 }), later(1_000, { priceUsd: 0.9 })]),
      'quality_control_v1',
    );
    const take = simulateResearchCandidate(
      makeResearchDataset([allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 }), later(1_000, { priceUsd: 1.2 })]),
      'quality_control_v1',
    );
    const maxHold = simulateResearchCandidate(
      makeResearchDataset([
        allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 }),
        later(EXIT_MAX_HOLDING_MS, { priceUsd: 1.05 }),
      ]),
      'quality_control_v1',
    );
    const unavailable = simulateResearchCandidate(
      makeResearchDataset([
        allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 }),
        later(1_000, { priceUsd: null }),
      ]),
      'quality_control_v1',
    );
    const zero = simulateResearchCandidate(
      makeResearchDataset([allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 }), later(1_000, { priceUsd: 0 })]),
      'quality_control_v1',
    );

    expect(stop.completedTrades[0]?.exitReason).toBe('stop_loss_threshold');
    expect(take.completedTrades[0]?.exitReason).toBe('take_profit_threshold');
    expect(maxHold.completedTrades[0]?.exitReason).toBe('max_holding_time');
    expect(unavailable.completedTrades).toHaveLength(0);
    expect(unavailable.unresolvedPositions).toHaveLength(1);
    expect(zero.completedTrades[0]?.exitReason).toBe('stop_loss_threshold');
    expect(zero.completedTrades[0]?.exitPriceUsd).toBe(0);
  });

  it('does not reopen on the same snapshot after a close, but can reopen later', () => {
    const closeSnapshot = later(1_000, { priceUsd: 1.2 });
    const sameOnly = simulateResearchCandidate(
      makeResearchDataset([allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 }), closeSnapshot]),
      'quality_control_v1',
    );
    expect(sameOnly.completedTrades).toHaveLength(1);
    expect(sameOnly.unresolvedPositions).toHaveLength(0);

    const laterReopen = simulateResearchCandidate(
      makeResearchDataset([
        allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 }),
        closeSnapshot,
        later(2_000, { priceUsd: 1.01 }),
      ]),
      'quality_control_v1',
    );
    expect(laterReopen.completedTrades).toHaveLength(1);
    expect(laterReopen.unresolvedPositions).toHaveLength(1);
  });

  it('keeps unresolved positions unresolved at dataset end', () => {
    const result = simulateResearchCandidate(
      makeResearchDataset([allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 })]),
      'quality_control_v1',
    );
    expect(result.unresolvedPositions).toHaveLength(1);
    expect(result.unresolvedPositions[0]?.unresolvedReason).toBe('unresolved_at_dataset_end');
    expect(result.completedTrades).toHaveLength(0);
  });

  it('uses deterministic historical position identities', () => {
    const dataset = makeResearchDataset([allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 })]);
    const first = simulateResearchCandidate(dataset, 'quality_control_v1');
    const second = simulateResearchCandidate(dataset, 'quality_control_v1');
    expect(first.unresolvedPositions[0]?.researchPositionIdentity).toBe(
      second.unresolvedPositions[0]?.researchPositionIdentity,
    );
  });
});

describe('fair comparison and shared x11 exits', () => {
  it('gives every candidate the same research dataset fingerprint and included identities', () => {
    const dataset = makeResearchDataset(
      [allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 }), later(60_000, { priceUsd: 1.2 })],
      [researchRisk()],
    );
    const report = buildResearchCompareReport(dataset);
    expect(new Set(report.candidates.map((item) => item.researchDatasetFingerprint)).size).toBe(1);
    expect(report.researchDatasetFingerprint).toBe(dataset.researchDatasetFingerprint);
    expect(report.candidates.map((item) => item.candidate.candidateId)).toEqual([...RESEARCH_CANDIDATE_IDS]);
  });

  it('produces identical x11 exits across candidates given the same synthetic entry path', () => {
    const dataset = makeResearchDataset([
      allEntrySnapshot({ collectedAt: OPENED, priceUsd: 1 }),
      later(1_000, { priceUsd: 1.2 }),
    ]);
    const exits = RESEARCH_CANDIDATE_IDS.map((candidateId) => {
      const result = simulateResearchCandidate(dataset, candidateId);
      expect(result.completedTrades).toHaveLength(1);
      const trade = result.completedTrades[0];
      return {
        exitReason: trade?.exitReason,
        exitPriceUsd: trade?.exitPriceUsd,
        tokenMint: trade?.tokenMint,
      };
    });
    expect(new Set(exits.map((item) => JSON.stringify(item))).size).toBe(1);
    expect(exits[0]?.tokenMint).toBe(WRAPPED_SOL_MINT);
  });
});
