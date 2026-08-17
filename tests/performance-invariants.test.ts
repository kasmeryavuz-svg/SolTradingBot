import { describe, expect, it } from 'vitest';
import { nextRepresentableNumber } from './paper-fixtures.js';
import { OTHER_PAIR } from './feature-fixtures.js';
import {
  FROZEN_P09_V1_DEFINITION_FINGERPRINT,
  FROZEN_PM10_V1_DEFINITION_FINGERPRINT,
  FROZEN_S07_V1_DEFINITION_FINGERPRINT,
  FROZEN_X11_V1_DEFINITION_FINGERPRINT,
  assertCompletedTradeEvidence,
  normalizeCompletedPaperTrade,
} from '../src/performance/index.js';
import { PerformanceError } from '../src/performance/types.js';
import { addMs, T_10_00, validEvidence } from './performance-fixtures.js';

describe('a12_v1 completed-trade evidence invariants', () => {
  it('normalizes valid evidence into an unrounded GROSS paper trade', () => {
    const trade = normalizeCompletedPaperTrade(validEvidence());
    expect(trade.grossPnlUsd).toBe(20);
    expect(trade.grossReturnPct).toBe((120 / 100 - 1) * 100);
    expect(trade.outcome).toBe('win');
    expect(trade.quantityTokens).toBe(1);
  });

  it('rejects corrupted or incompatible frozen-chain evidence', () => {
    const cases: Array<[string, ReturnType<typeof validEvidence>]> = [
      ['wrong token', validEvidence({ tokenMint: '   ' })],
      ['wrong pair', validEvidence({ exitPairAddress: OTHER_PAIR })],
      ['wrong opening pair', validEvidence({ openingPaperPairAddress: OTHER_PAIR })],
      ['wrong pm10 version', validEvidence({ positionSpecVersion: 'pm10_v2' })],
      ['wrong pm10 fingerprint', validEvidence({ positionDefinitionFingerprint: '0'.repeat(64) })],
      ['wrong x11 version', validEvidence({ exitEvaluationSpecVersion: 'x11_v2' })],
      [
        'wrong x11 fingerprint',
        validEvidence({ exitEvaluationDefinitionFingerprint: '0'.repeat(64) }),
      ],
      [
        'wrong p09 fingerprint',
        validEvidence({ openingPaperDefinitionFingerprint: '0'.repeat(64) }),
      ],
      ['wrong s07 fingerprint', validEvidence({ strategyDefinitionFingerprint: '0'.repeat(64) })],
      [
        'wrong position source identity',
        validEvidence({ closingPositionSourceIdentity: 'other-position' }),
      ],
      ['exit references another position', validEvidence({ exitEvaluationPositionId: 99 })],
      ['exit evaluation references another token', validEvidence({ exitEvaluationTokenId: 9 })],
      ['exit quantity differs', validEvidence({ exitQuantityTokens: 2 })],
      [
        'one-ULP quantity difference',
        validEvidence({ exitQuantityTokens: nextRepresentableNumber(1) }),
      ],
      [
        'exit evaluation closed quantity differs',
        validEvidence({ exitEvaluationClosedQuantityTokens: 2 }),
      ],
      [
        'exit price differs from evaluation price',
        validEvidence({ exitEvaluationSimulatedExitPriceUsd: 119 }),
      ],
      [
        'negative exit price',
        validEvidence({ exitPriceUsd: -0.01, exitEvaluationSimulatedExitPriceUsd: -0.01 }),
      ],
      [
        'nonfinite exit price',
        validEvidence({
          exitPriceUsd: Number.NaN,
          exitEvaluationSimulatedExitPriceUsd: Number.NaN,
        }),
      ],
      ['entry <= 0', validEvidence({ entryPriceUsd: 0 })],
      ['notional != 100', validEvidence({ entryNotionalUsd: 99 })],
      [
        'quantity <= 0',
        validEvidence({
          positionQuantityTokens: 0,
          exitQuantityTokens: 0,
          exitEvaluationClosedQuantityTokens: 0,
        }),
      ],
      [
        'exit before entry',
        validEvidence({
          exitedAt: '2026-08-17T09:59:59.999Z',
          exitMarketCollectedAt: '2026-08-17T09:59:59.999Z',
          exitEvaluationMarketCollectedAt: '2026-08-17T09:59:59.999Z',
          exitEvaluationEvaluatedAt: '2026-08-17T09:59:59.999Z',
          exitEvaluationAsOf: '2026-08-17T09:59:59.999Z',
          exitMarketSnapshotCollectedAt: '2026-08-17T09:59:59.999Z',
        }),
      ],
      [
        'no_change exit evaluation used as a completed trade',
        validEvidence({
          exitAction: 'no_change',
          exitReason: 'exit_conditions_not_met',
          exitEvaluationSimulatedExitPriceUsd: null,
          exitEvaluationClosedQuantityTokens: null,
        }),
      ],
      ['completed position still marked current-open', validEvidence({ currentlyOpen: true })],
      [
        'stored quantity 3 with entry 50 instead of frozen 2',
        validEvidence({
          entryPriceUsd: 50,
          positionQuantityTokens: 3,
          exitQuantityTokens: 3,
          exitEvaluationClosedQuantityTokens: 3,
        }),
      ],
      [
        'one-ULP stored quantity difference from frozen pm10 formula',
        validEvidence({
          entryPriceUsd: 50,
          positionQuantityTokens: nextRepresentableNumber(2),
          exitQuantityTokens: nextRepresentableNumber(2),
          exitEvaluationClosedQuantityTokens: nextRepresentableNumber(2),
        }),
      ],
    ];

    for (const [, evidence] of cases) {
      expect(() => {
        assertCompletedTradeEvidence(evidence);
      }).toThrow(PerformanceError);
      expect(() => {
        normalizeCompletedPaperTrade(evidence);
      }).toThrow(PerformanceError);
    }

    expect(FROZEN_S07_V1_DEFINITION_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/);
    expect(FROZEN_P09_V1_DEFINITION_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/);
    expect(FROZEN_PM10_V1_DEFINITION_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/);
    expect(FROZEN_X11_V1_DEFINITION_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/);
  });

  it('fails when facts change while stored source identities stay the same', () => {
    const original = validEvidence();
    expect(() => {
      assertCompletedTradeEvidence(original);
    }).not.toThrow();

    expect(() => {
      assertCompletedTradeEvidence({ ...original, entryPriceUsd: 50 });
    }).toThrow(PerformanceError);
    expect(() => {
      assertCompletedTradeEvidence({
        ...original,
        positionQuantityTokens: 3,
        exitQuantityTokens: 3,
        exitEvaluationClosedQuantityTokens: 3,
        positionEvaluationQuantityTokens: 3,
      });
    }).toThrow(PerformanceError);
    expect(() => {
      assertCompletedTradeEvidence({ ...original, exitPriceUsd: 150 });
    }).toThrow(PerformanceError);
    expect(() => {
      assertCompletedTradeEvidence({ ...original, exitedAt: addMs(T_10_00, 90_000) });
    }).toThrow(PerformanceError);
    expect(() => {
      assertCompletedTradeEvidence({ ...original, positionPairAddress: OTHER_PAIR });
    }).toThrow(PerformanceError);
  });
});
