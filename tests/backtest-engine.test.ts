import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BACKTEST_DEFINITION_FINGERPRINT,
  BACKTEST_SPEC_NAME,
  BACKTEST_SPEC_VERSION,
  FORWARD_HORIZON_SECONDS,
  FROZEN_S07_V1_DEFINITION_FINGERPRINT,
  OUTCOME_MAX_DELAY_SECONDS,
  REQUIRED_BACKTEST_FEATURE_SET_VERSION,
  REQUIRED_BACKTEST_STRATEGY_VERSION,
  fingerprintBacktestDefinition,
  mutateCanonicalBacktestDefinition,
  outcomeWindow,
  resolveCandidateOutcome,
  selectLatestRisk,
  selectOutcomeSnapshot,
  selectPreviousMarket,
} from '../src/backtest/index.js';
import { assertBacktestResult } from '../src/backtest/invariants.js';
import { grossForwardReturnPct } from '../src/backtest/outcomes.js';
import { BacktestError } from '../src/backtest/types.js';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { FEATURE_SET_VERSION } from '../src/features/definitions.js';
import { generateFeatureVector } from '../src/features/engine.js';
import { FINDING_CODES } from '../src/risk/constants.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../src/strategy/identity.js';
import {
  OTHER_PAIR,
  PAIR_ADDRESS,
  T_09_30,
  T_10_05,
  T_10_10,
  finding,
  previousSnapshot,
} from './feature-fixtures.js';
import {
  T_09_58,
  T_10_00,
  T_10_01,
  T_10_14_59_999,
  T_10_15,
  T_10_15_999,
  T_10_16,
  T_10_17,
  T_10_17_001,
  candidateRisk,
  candidateSnapshot,
  eventAt,
  outcomeOnlySnapshot,
  replayVector,
  runStudy,
} from './backtest-fixtures.js';

describe('b08_v1 spec', () => {
  it('freezes the backtest and strategy identity', () => {
    expect(BACKTEST_SPEC_VERSION).toBe('b08_v1');
    expect(BACKTEST_SPEC_NAME).toBe('fixed_horizon_gross_price_outcome');
    expect(FORWARD_HORIZON_SECONDS).toBe(900);
    expect(OUTCOME_MAX_DELAY_SECONDS).toBe(120);
    expect(REQUIRED_BACKTEST_STRATEGY_VERSION).toBe('s07_v1');
    expect(REQUIRED_BACKTEST_FEATURE_SET_VERSION).toBe('c06_v1');
    expect(FEATURE_SET_VERSION).toBe('c06_v1');
    expect(STRATEGY_DEFINITION_FINGERPRINT).toBe(FROZEN_S07_V1_DEFINITION_FINGERPRINT);
    expect(FROZEN_S07_V1_DEFINITION_FINGERPRINT).toBe(
      'b4560629e6a58331e9046f13bad78b73b3bdc1bb7349fc6173ba158b4db067cd',
    );
    expect(BACKTEST_DEFINITION_FINGERPRINT).toBe(
      '87bca6f2ea8e57b7613d3627b5a5adf37864142b3c62de97849440189ff07fcf',
    );
  });

  it('fingerprints the canonical definition deterministically', () => {
    expect(fingerprintBacktestDefinition()).toBe(BACKTEST_DEFINITION_FINGERPRINT);
    expect(fingerprintBacktestDefinition()).toBe(fingerprintBacktestDefinition());
  });

  it('changes fingerprint when b08_v1 semantics are mutated in fixtures', () => {
    const original = BACKTEST_DEFINITION_FINGERPRINT;
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.forwardHorizonSeconds = 901; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.outcomeMaxDelaySeconds = 121; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.outcomePairPolicy = 'allow_other_pair'; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.outcomeSelection = 'latest_snapshot_in_window'; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.outcomeWindow.endInclusive = false; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.riskPolicy.relation = '<'; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.previousMarketPolicy.relation = '<='; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.returnFormula = 'ln(outcome/reference)'; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.candidateDedup = 'transition_only'; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.invalidOutcomePricePolicy = 'search_later_valid_price'; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.costModel = 'fees_and_slippage'; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.backtestSpecVersion = 'b08_v2'; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.backtestSpecName = 'other_spec'; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.requiredStrategyVersion = 's07_v2'; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.requiredFeatureSetVersion = 'c06_v2'; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.samplingPolicy = 'candidate_transitions_only'; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.asOfPolicy = 'current_clock'; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.previousMarketPolicy.sameToken = false; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.previousMarketPolicy.samePair = false; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.previousMarketPolicy.selection = 'earliest_eligible'; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.riskPolicy.sameToken = false; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.riskPolicy.selection = 'earliest_eligible'; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.riskPolicy.freshnessGate = 'max_age_seconds'; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.outcomeWindow.startInclusive = false; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition(mutateCanonicalBacktestDefinition((item) => { item.positionModel = 'one_open_position'; }))).not.toBe(original);
    expect(fingerprintBacktestDefinition()).toBe(original);
  });
});

describe('point-in-time replay', () => {
  const current = candidateSnapshot();
  const previous = previousSnapshot({ pairAddress: PAIR_ADDRESS, collectedAt: T_09_30 });
  const risk = candidateRisk();

  it('uses the current snapshot collectedAt as asOf, generatedAt, and evaluatedAt', () => {
    const result = runStudy({ marketSnapshots: [previous, current], riskReports: [risk] });
    const event = eventAt(result, T_10_00);
    const expected = replayVector(current, previous, risk);
    expect(event.asOf).toBe(current.collectedAt);
    expect(expected.vector.asOf).toBe(current.collectedAt);
    expect(expected.vector.generatedAt).toBe(current.collectedAt);
    expect(expected.evaluation.evaluatedAt).toBe(current.collectedAt);
    expect(expected.vector.values.find((item) => item.name === 'market_age_seconds')?.value).toBe(0);
    expect(event.featureSourceIdentity).toBe(expected.evaluation.featureSourceIdentity);
    expect(event.strategyDecision).toBe(expected.evaluation.decision);
  });

  it('selects the latest previous same-pair snapshot and rejects other pairs, equal time, and the future', () => {
    const otherPairPrevious = previousSnapshot({ pairAddress: OTHER_PAIR, collectedAt: '2026-08-17T09:45:00.000Z' });
    const equalTime = candidateSnapshot({ pairAddress: PAIR_ADDRESS, dexId: 'raydium' });
    const future = outcomeOnlySnapshot();
    expect(selectPreviousMarket(current, [otherPairPrevious, previous, equalTime, future, current])).toEqual(previous);
    expect(selectPreviousMarket(current, [otherPairPrevious, current])).toBeNull();
  });

  it('selects the latest risk at or before asOf and rejects 1ms-later future risk', () => {
    const earlier = candidateRisk({ scannedAt: T_09_58 });
    const equal = candidateRisk({ scannedAt: T_10_00 });
    const later = candidateRisk({
      scannedAt: '2026-08-17T10:00:00.001Z',
      findings: [finding(FINDING_CODES.MINT_AUTHORITY_ACTIVE)],
      highestFindingSeverity: 'high',
    });
    expect(selectLatestRisk(WRAPPED_SOL_MINT, T_10_00, [earlier, equal, later])?.scannedAt).toBe(T_10_00);
    expect(selectLatestRisk(WRAPPED_SOL_MINT, T_10_00, [later])).toBeNull();
    expect(selectLatestRisk(WRAPPED_SOL_MINT, T_10_00, [])).toBeNull();

    const withFutureOnly = runStudy({ marketSnapshots: [current], riskReports: [later] });
    expect(eventAt(withFutureOnly, T_10_00).strategyDecision).toBe('insufficient_data');

    const blockingLater = runStudy({
      marketSnapshots: [current],
      riskReports: [risk, later],
    });
    expect(eventAt(blockingLater, T_10_00).strategyDecision).toBe('entry_candidate');
  });

  it('keeps the historical decision unchanged when future prices, timestamps, or later risk change', () => {
    const futureCheap = outcomeOnlySnapshot({ priceUsd: 90, collectedAt: T_10_15 });
    const futureRich = outcomeOnlySnapshot({ priceUsd: 200, collectedAt: T_10_16 });
    const laterRisk = candidateRisk({
      scannedAt: T_10_05,
      findings: [finding(FINDING_CODES.MINT_AUTHORITY_ACTIVE)],
      highestFindingSeverity: 'high',
    });
    const baseline = runStudy({
      marketSnapshots: [current, futureCheap],
      riskReports: [risk],
    });
    const mutatedPrices = runStudy({
      marketSnapshots: [current, futureRich],
      riskReports: [risk],
    });
    const mutatedTime = runStudy({
      marketSnapshots: [current, outcomeOnlySnapshot({ collectedAt: T_10_17 })],
      riskReports: [risk],
    });
    const mutatedRisk = runStudy({
      marketSnapshots: [current, futureCheap],
      riskReports: [risk, laterRisk],
    });

    const expectedDecision = replayVector(current, null, risk);
    const baselineEvent = eventAt(baseline, T_10_00);
    const cheapEvent = eventAt(baseline, T_10_00);
    const richEvent = eventAt(mutatedPrices, T_10_00);
    const laterRiskEvent = eventAt(mutatedRisk, T_10_00);

    expect(cheapEvent.featureSourceIdentity).toBe(expectedDecision.evaluation.featureSourceIdentity);
    expect(richEvent.featureSourceIdentity).toBe(cheapEvent.featureSourceIdentity);
    expect(laterRiskEvent.featureSourceIdentity).toBe(cheapEvent.featureSourceIdentity);
    expect(richEvent.strategyDecision).toBe(cheapEvent.strategyDecision);
    expect(laterRiskEvent.strategyDecision).toBe(cheapEvent.strategyDecision);
    expect(richEvent.strategySourceIdentity).toBe(cheapEvent.strategySourceIdentity);
    expect(richEvent.passedRuleCount).toBe(expectedDecision.evaluation.passedRuleCount);
    expect(richEvent.failedRuleCount).toBe(expectedDecision.evaluation.failedRuleCount);
    expect(richEvent.unavailableRuleCount).toBe(expectedDecision.evaluation.unavailableRuleCount);
    expect(laterRiskEvent.passedRuleCount).toBe(cheapEvent.passedRuleCount);
    expect(laterRiskEvent.failedRuleCount).toBe(cheapEvent.failedRuleCount);
    expect(laterRiskEvent.unavailableRuleCount).toBe(cheapEvent.unavailableRuleCount);
    expect(expectedDecision.evaluation.rules).toEqual(replayVector(current, null, risk).evaluation.rules);
    expect(eventAt(mutatedTime, T_10_00).featureSourceIdentity).toBe(baselineEvent.featureSourceIdentity);
    expect(richEvent.outcome?.status).toBe('resolved');
    if (cheapEvent.outcome?.status === 'resolved' && richEvent.outcome?.status === 'resolved') {
      expect(richEvent.outcome.grossForwardReturnPct).not.toBe(cheapEvent.outcome.grossForwardReturnPct);
    }
  });
});

describe('strategy reuse', () => {
  it('reuses Checkpoint 06 and Checkpoint 07 instead of copying thresholds', () => {
    const engine = readFileSync(new URL('../src/backtest/engine.ts', import.meta.url), 'utf8');
    expect(engine).toContain("from '../features/engine.js'");
    expect(engine).toContain('generateFeatureVector');
    expect(engine).toContain("from '../strategy/evaluator.js'");
    expect(engine).toContain('evaluateStrategy');
    expect(engine).not.toMatch(/MIN_LIQUIDITY_USD|MIN_BUY_SHARE_5M_BPS|50000|5500|BLOCKING_RISK_FEATURES/);

    const snapshot = candidateSnapshot();
    const risk = candidateRisk();
    const result = runStudy({ marketSnapshots: [snapshot], riskReports: [risk] });
    const expected = replayVector(snapshot, null, risk);
    const event = eventAt(result, T_10_00);
    expect(expected.evaluation.strategyDefinitionFingerprint).toBe(
      'b4560629e6a58331e9046f13bad78b73b3bdc1bb7349fc6173ba158b4db067cd',
    );
    expect(event.strategyDecision).toBe(expected.evaluation.decision);
    expect(event.passedRuleCount).toBe(expected.evaluation.passedRuleCount);
    expect(event.failedRuleCount).toBe(expected.evaluation.failedRuleCount);
    expect(event.unavailableRuleCount).toBe(expected.evaluation.unavailableRuleCount);
  });
});

describe('outcome window', () => {
  const current = candidateSnapshot({ priceUsd: 100 });
  const risk = candidateRisk();

  it('attaches outcomes only to ENTRY_CANDIDATE events', () => {
    const noEntry = candidateSnapshot({ liquidityUsd: 1_000, collectedAt: T_10_01 });
    const insufficient = candidateSnapshot({ tokenMint: USDC_MINT, collectedAt: T_10_00 });
    const result = runStudy({
      marketSnapshots: [current, noEntry, insufficient, outcomeOnlySnapshot({ priceUsd: 110 })],
      riskReports: [risk],
    });
    const candidate = eventAt(result, T_10_00, WRAPPED_SOL_MINT);
    expect(candidate.strategyDecision).toBe('entry_candidate');
    expect(candidate.outcome).not.toBeNull();
    expect(eventAt(result, T_10_01).strategyDecision).toBe('no_entry');
    expect(eventAt(result, T_10_01).outcome).toBeNull();
    expect(eventAt(result, T_10_00, USDC_MINT).strategyDecision).toBe('insufficient_data');
    expect(eventAt(result, T_10_00, USDC_MINT).outcome).toBeNull();
  });

  it('uses a +900s target and +1020s inclusive window with earliest same-pair selection', () => {
    expect(outcomeWindow(T_10_00)).toEqual({ targetAt: T_10_15, windowEndAt: T_10_17 });
    const before = outcomeOnlySnapshot({ collectedAt: T_10_14_59_999, priceUsd: 50 });
    const atStart = outcomeOnlySnapshot({ collectedAt: T_10_15, priceUsd: 110 });
    const laterBetter = outcomeOnlySnapshot({ collectedAt: T_10_16, priceUsd: 999 });
    const laterWorse = outcomeOnlySnapshot({ collectedAt: '2026-08-17T10:16:30.000Z', priceUsd: 1 });
    const atEnd = outcomeOnlySnapshot({ collectedAt: T_10_17, priceUsd: 120 });
    const after = outcomeOnlySnapshot({ collectedAt: T_10_17_001, priceUsd: 130 });
    const otherPair = outcomeOnlySnapshot({ pairAddress: OTHER_PAIR, collectedAt: T_10_15, priceUsd: 500 });

    expect(selectOutcomeSnapshot(WRAPPED_SOL_MINT, PAIR_ADDRESS, T_10_15, T_10_17, [before, atStart, laterBetter])).toEqual(atStart);
    expect(selectOutcomeSnapshot(WRAPPED_SOL_MINT, PAIR_ADDRESS, T_10_15, T_10_17, [before])).toBeNull();
    expect(selectOutcomeSnapshot(WRAPPED_SOL_MINT, PAIR_ADDRESS, T_10_15, T_10_17, [atEnd])).toEqual(atEnd);
    expect(selectOutcomeSnapshot(WRAPPED_SOL_MINT, PAIR_ADDRESS, T_10_15, T_10_17, [after])).toBeNull();
    expect(selectOutcomeSnapshot(WRAPPED_SOL_MINT, PAIR_ADDRESS, T_10_15, T_10_17, [otherPair, laterBetter])).toEqual(laterBetter);

    const selected = runStudy({
      marketSnapshots: [current, before, atStart, laterBetter, laterWorse, atEnd, after, otherPair],
      riskReports: [risk],
    });
    const outcome = eventAt(selected, T_10_00).outcome;
    expect(outcome?.status).toBe('resolved');
    if (outcome?.status === 'resolved') {
      expect(outcome.targetAt).toBe(T_10_15);
      expect(outcome.windowEndAt).toBe(T_10_17);
      expect(outcome.outcomeCollectedAt).toBe(T_10_15);
      expect(outcome.outcomePriceUsd).toBe(110);
    }
  });

  it('does not substitute a later valid price after an invalid earliest observation', () => {
    const earliestNull = outcomeOnlySnapshot({ collectedAt: T_10_15, priceUsd: null });
    const laterValid = outcomeOnlySnapshot({ collectedAt: T_10_16, priceUsd: 150 });
    const result = runStudy({
      marketSnapshots: [current, earliestNull, laterValid],
      riskReports: [risk],
    });
    expect(eventAt(result, T_10_00).outcome).toEqual({
      status: 'unavailable',
      targetAt: T_10_15,
      windowEndAt: T_10_17,
      referencePriceUsd: 100,
      reason: 'outcome_price_unavailable',
    });
  });

  it('marks zero, negative, and non-finite earliest prices unavailable and uses a stable missing-window reason', () => {
    expect(
      runStudy({
        marketSnapshots: [current, outcomeOnlySnapshot({ priceUsd: 0 })],
        riskReports: [risk],
      }).events[0]?.outcome?.status,
    ).toBe('unavailable');
    const eventRef = { tokenMint: current.tokenMint, pairAddress: current.pairAddress, asOf: current.collectedAt };
    const negative = resolveCandidateOutcome(eventRef, 100, [outcomeOnlySnapshot({ priceUsd: -1 })]);
    const infinite = resolveCandidateOutcome(eventRef, 100, [
      outcomeOnlySnapshot({ priceUsd: Number.POSITIVE_INFINITY }),
    ]);
    const otherPair = resolveCandidateOutcome(eventRef, 100, [outcomeOnlySnapshot({ pairAddress: OTHER_PAIR })]);
    expect(negative).toMatchObject({ status: 'unavailable', reason: 'outcome_price_unavailable' });
    expect(infinite).toMatchObject({ status: 'unavailable', reason: 'outcome_price_unavailable' });
    expect(otherPair).toMatchObject({ status: 'unavailable', reason: 'no_same_pair_snapshot_in_outcome_window' });
    expect(
      runStudy({ marketSnapshots: [current], riskReports: [risk] }).events[0]?.outcome,
    ).toMatchObject({
      status: 'unavailable',
      reason: 'no_same_pair_snapshot_in_outcome_window',
    });
  });
});

describe('returns', () => {
  const current = candidateSnapshot({ priceUsd: 100 });
  const risk = candidateRisk();

  it('computes gross forward price return without rounding in domain storage', () => {
    expect(grossForwardReturnPct(100, 110)).toBe(10);
    expect(grossForwardReturnPct(100, 90)).toBe(-10);
    expect(grossForwardReturnPct(100, 100)).toBe(0);
    expect(() => grossForwardReturnPct(100, Number.POSITIVE_INFINITY)).toThrow(BacktestError);
    expect(() =>
      resolveCandidateOutcome(
        { tokenMint: current.tokenMint, pairAddress: current.pairAddress, asOf: current.collectedAt },
        0,
        [outcomeOnlySnapshot()],
      ),
    ).toThrow(/reference price/);
  });

  it('records horizon and delay seconds with millisecond flooring', () => {
    const delayed = outcomeOnlySnapshot({ collectedAt: T_10_15_999, priceUsd: 110 });
    const result = runStudy({ marketSnapshots: [current, delayed], riskReports: [risk] });
    const outcome = eventAt(result, T_10_00).outcome;
    expect(outcome?.status).toBe('resolved');
    if (outcome?.status === 'resolved') {
      expect(outcome.actualHorizonSeconds).toBe(900);
      expect(outcome.outcomeDelaySeconds).toBe(0);
      expect(outcome.outcomeDelaySeconds).toBeGreaterThanOrEqual(0);
      expect(outcome.outcomeDelaySeconds).toBeLessThanOrEqual(120);
    }

    const atEnd = runStudy({
      marketSnapshots: [current, outcomeOnlySnapshot({ collectedAt: T_10_17, priceUsd: 110 })],
      riskReports: [risk],
    });
    const endOutcome = eventAt(atEnd, T_10_00).outcome;
    if (endOutcome?.status === 'resolved') {
      expect(endOutcome.actualHorizonSeconds).toBe(1020);
      expect(endOutcome.outcomeDelaySeconds).toBe(120);
    }
  });
});

describe('summary, repeated events, and multi-token ordering', () => {
  it('summarizes classifications and resolved gross outcomes, treating zero as non-positive', () => {
    const first = candidateSnapshot({ priceUsd: 100 });
    const second = candidateSnapshot({ collectedAt: T_10_01, priceUsd: 100 });
    const noEntry = candidateSnapshot({ collectedAt: T_10_10, liquidityUsd: 1_000 });
    const usdc = candidateSnapshot({ tokenMint: USDC_MINT, collectedAt: T_10_00 });
    const plus = outcomeOnlySnapshot({ collectedAt: T_10_15, priceUsd: 110 });
    const minus = outcomeOnlySnapshot({ collectedAt: T_10_16, priceUsd: 90 });
    const result = runStudy({
      marketSnapshots: [second, first, noEntry, usdc, plus, minus],
      riskReports: [candidateRisk()],
    });

    expect(result.summary.evaluationCount).toBe(6);
    expect(result.summary.entryCandidateCount).toBe(2);
    expect(result.summary.noEntryCount).toBe(3);
    expect(result.summary.insufficientDataCount).toBe(1);
    expect(result.summary.resolvedEntryCandidateCount).toBe(2);
    expect(result.summary.unresolvedEntryCandidateCount).toBe(0);
    expect(result.summary.positiveForwardOutcomeCount).toBe(1);
    expect(result.summary.nonPositiveForwardOutcomeCount).toBe(1);
    expect(result.summary.averageGrossForwardReturnPct).toBe(0);

    const empty = runStudy({
      marketSnapshots: [noEntry],
      riskReports: [candidateRisk()],
    });
    expect(empty.summary.averageGrossForwardReturnPct).toBeNull();
    expect(empty.summary.resolvedEntryCandidateCount).toBe(0);

    const unresolvedOnly = runStudy({
      marketSnapshots: [first],
      riskReports: [candidateRisk()],
    });
    expect(unresolvedOnly.summary.unresolvedEntryCandidateCount).toBe(1);
    expect(unresolvedOnly.summary.averageGrossForwardReturnPct).toBeNull();

    const zeroReturn = runStudy({
      marketSnapshots: [first, outcomeOnlySnapshot({ priceUsd: 100 })],
      riskReports: [candidateRisk()],
    });
    expect(zeroReturn.summary.positiveForwardOutcomeCount).toBe(0);
    expect(zeroReturn.summary.nonPositiveForwardOutcomeCount).toBe(1);
    expect(zeroReturn.summary.averageGrossForwardReturnPct).toBe(0);
  });

  it('keeps consecutive ENTRY_CANDIDATE snapshots as overlapping separate events', () => {
    const first = candidateSnapshot({ collectedAt: T_10_00 });
    const second = candidateSnapshot({ collectedAt: T_10_01 });
    const result = runStudy({
      marketSnapshots: [first, second, outcomeOnlySnapshot({ collectedAt: T_10_15 }), outcomeOnlySnapshot({ collectedAt: '2026-08-17T10:16:00.000Z' })],
      riskReports: [candidateRisk()],
    });
    expect(result.events.filter((item) => item.strategyDecision === 'entry_candidate')).toHaveLength(2);
    expect(eventAt(result, T_10_00).outcome?.status).toBe('resolved');
    expect(eventAt(result, T_10_01).outcome?.status).toBe('resolved');
    const engine = readFileSync(new URL('../src/backtest/engine.ts', import.meta.url), 'utf8');
    expect(engine).not.toMatch(/cooldown|already in trade|position lock|dedup/i);
    const docs = readFileSync(new URL('../docs/CHECKPOINT_08.md', import.meta.url), 'utf8');
    expect(docs).toMatch(/not.*independent executed trades/i);
  });

  it('orders tokens, timestamps, and pair ties deterministically and does not cross tokens', () => {
    const solEarly = candidateSnapshot({ collectedAt: T_10_01, pairAddress: PAIR_ADDRESS });
    const solTieA = candidateSnapshot({ collectedAt: T_10_00, pairAddress: OTHER_PAIR, liquidityUsd: 1_000 });
    const solTieB = candidateSnapshot({ collectedAt: T_10_00, pairAddress: PAIR_ADDRESS, liquidityUsd: 1_000 });
    const usdc = candidateSnapshot({ tokenMint: USDC_MINT, collectedAt: T_10_00 });
    const usdcRisk = candidateRisk({ tokenMint: USDC_MINT });
    const otherTokenFuture = outcomeOnlySnapshot({ tokenMint: USDC_MINT, collectedAt: T_10_15, priceUsd: 200 });
    const result = runStudy({
      marketSnapshots: [solEarly, solTieB, usdc, solTieA, otherTokenFuture],
      riskReports: [candidateRisk(), usdcRisk],
    });
    expect(result.events.map((item) => `${item.tokenMint}:${item.asOf}:${item.pairAddress}`)).toEqual([
      `${USDC_MINT}:${T_10_00}:${PAIR_ADDRESS}`,
      `${USDC_MINT}:${T_10_15}:${PAIR_ADDRESS}`,
      `${WRAPPED_SOL_MINT}:${T_10_00}:${OTHER_PAIR}`,
      `${WRAPPED_SOL_MINT}:${T_10_00}:${PAIR_ADDRESS}`,
      `${WRAPPED_SOL_MINT}:${T_10_01}:${PAIR_ADDRESS}`,
    ]);

    const oneToken = runStudy(
      { marketSnapshots: [solEarly, solTieA], riskReports: [candidateRisk()] },
      { kind: 'token', tokenMint: WRAPPED_SOL_MINT },
    );
    expect(oneToken.scope).toEqual({ kind: 'token', tokenMint: WRAPPED_SOL_MINT });
    expect(oneToken.events.every((item) => item.tokenMint === WRAPPED_SOL_MINT)).toBe(true);

    expect(() =>
      runStudy(
        { marketSnapshots: [solEarly, usdc], riskReports: [candidateRisk()] },
        { kind: 'token', tokenMint: WRAPPED_SOL_MINT },
      ),
    ).toThrow(/different mint/);

    const previousOtherToken = previousSnapshot({ tokenMint: USDC_MINT, collectedAt: T_09_30 });
    expect(selectPreviousMarket(solEarly, [previousOtherToken])).toBeNull();
    expect(selectLatestRisk(WRAPPED_SOL_MINT, T_10_01, [usdcRisk])).toBeNull();
    expect(selectOutcomeSnapshot(WRAPPED_SOL_MINT, PAIR_ADDRESS, T_10_15, T_10_17, [otherTokenFuture])).toBeNull();
  });
});

describe('malformed inputs and invariants', () => {
  it('rejects duplicate identities, invalid timestamps, wrong chain, and invalid mints', () => {
    const snapshot = candidateSnapshot();
    expect(() =>
      runStudy({ marketSnapshots: [snapshot, { ...snapshot }], riskReports: [] }),
    ).toThrow(/Duplicate historical market identity/);
    expect(() =>
      runStudy({
        marketSnapshots: [snapshot],
        riskReports: [candidateRisk(), candidateRisk()],
      }),
    ).toThrow(/Duplicate historical risk identity/);
    expect(() =>
      runStudy({
        marketSnapshots: [{ ...snapshot, collectedAt: 'not-a-timestamp' }],
        riskReports: [],
      }),
    ).toThrow(/Invalid market.collectedAt/);
    expect(() =>
      runStudy({
        marketSnapshots: [{ ...snapshot, chain: 'ethereum' } as never],
        riskReports: [],
      }),
    ).toThrow(/Solana/);
    expect(() =>
      runStudy({
        marketSnapshots: [{ ...snapshot, tokenMint: 'not-a-mint' }],
        riskReports: [],
      }),
    ).toThrow(/invalid token mint/i);
  });

  it('rejects a mismatched risk report through the reused feature engine', () => {
    expect(() =>
      generateFeatureVector(
        {
          market: candidateSnapshot(),
          previousMarket: null,
          risk: candidateRisk({ tokenMint: USDC_MINT }),
          riskUnavailableReason: null,
          asOf: T_10_00,
        },
        { generatedAt: T_10_00 },
      ),
    ).toThrow(/token mint does not match/);
  });

  it('rejects forged resolved outcomes that violate the window, pair, or decision contract', () => {
    const current = candidateSnapshot({ priceUsd: 100 });
    const future = outcomeOnlySnapshot({ priceUsd: 110 });
    const dataset = { marketSnapshots: [current, future], riskReports: [candidateRisk()] };
    const result = runStudy(dataset);
    const resolved = eventAt(result, T_10_00);
    expect(resolved.outcome?.status).toBe('resolved');

    const beforeTarget = structuredClone(result);
    const beforeOutcome = beforeTarget.events.find((item) => item.asOf === T_10_00)?.outcome;
    if (beforeOutcome?.status === 'resolved') {
      beforeOutcome.targetAt = T_10_16;
      beforeOutcome.outcomeCollectedAt = T_10_15;
    }
    expect(() => {
      assertBacktestResult(beforeTarget, dataset);
    }).toThrow();

    const afterWindow = structuredClone(result);
    const afterOutcome = afterWindow.events.find((item) => item.asOf === T_10_00)?.outcome;
    if (afterOutcome?.status === 'resolved') {
      afterOutcome.windowEndAt = T_10_00;
    }
    expect(() => {
      assertBacktestResult(afterWindow, dataset);
    }).toThrow();

    const wrongPair = structuredClone(result);
    if (wrongPair.events[0]?.outcome?.status === 'resolved') {
      wrongPair.events[0].pairAddress = OTHER_PAIR;
    }
    expect(() => {
      assertBacktestResult(wrongPair, dataset);
    }).toThrow();

    const noEntryDataset = {
      marketSnapshots: [candidateSnapshot({ liquidityUsd: 1_000 })],
      riskReports: [candidateRisk()],
    };
    const noEntry = runStudy(noEntryDataset);
    const forgedNoEntry = structuredClone(noEntry);
    const noEntryEvent = forgedNoEntry.events[0];
    if (noEntryEvent === undefined) {
      throw new Error('expected a NO_ENTRY event');
    }
    noEntryEvent.outcome = resolved.outcome;
    expect(() => {
      assertBacktestResult(forgedNoEntry, noEntryDataset);
    }).toThrow(/must not carry an outcome/);
  });
});

