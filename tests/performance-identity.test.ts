import { describe, expect, it } from 'vitest';
import {
  PERFORMANCE_DEFINITION_FINGERPRINT,
  PERFORMANCE_SPEC_NAME,
  PERFORMANCE_SPEC_VERSION,
  buildPerformanceReport,
  canonicalPerformanceDefinition,
  fingerprintPerformanceDefinition,
  mutateCanonicalPerformanceDefinition,
} from '../src/performance/index.js';
import { TRADE_A, TRADE_B } from './performance-fixtures.js';

describe('a12_v1 definition fingerprint', () => {
  it('derives a stable SHA-256 fingerprint from the canonical definition', () => {
    expect(PERFORMANCE_SPEC_VERSION).toBe('a12_v1');
    expect(PERFORMANCE_SPEC_NAME).toBe('gross_closed_paper_trade_analytics');
    expect(fingerprintPerformanceDefinition()).toBe(PERFORMANCE_DEFINITION_FINGERPRINT);
    expect(PERFORMANCE_DEFINITION_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/);
    expect(PERFORMANCE_DEFINITION_FINGERPRINT).toBe(
      fingerprintPerformanceDefinition(canonicalPerformanceDefinition()),
    );
  });

  it('changes when frozen analytics semantics change', () => {
    const mutated = [
      mutateCanonicalPerformanceDefinition((definition) => {
        definition.fees = 'dex_fee_modeled';
      }),
      mutateCanonicalPerformanceDefinition((definition) => {
        definition.sharpe = 'sample_sharpe';
      }),
      mutateCanonicalPerformanceDefinition((definition) => {
        definition.aggregateFormulas.summation = 'naive_sum';
      }),
      mutateCanonicalPerformanceDefinition((definition) => {
        definition.drawdown.portfolioDrawdown = true;
      }),
      mutateCanonicalPerformanceDefinition((definition) => {
        definition.entryValue.recomputeQuantityFromNotional = true;
      }),
      mutateCanonicalPerformanceDefinition((definition) => {
        definition.integrity.recomputeOpeningPaperSourceIdentity = false;
      }),
      mutateCanonicalPerformanceDefinition((definition) => {
        definition.entryValue.validateStoredQuantityAgainstFrozenPm10Formula = false;
      }),
      mutateCanonicalPerformanceDefinition((definition) => {
        definition.numericDomain.signedZero = 'preserve_negative_zero';
      }),
      mutateCanonicalPerformanceDefinition((definition) => {
        definition.readConsistency = 'independent_selects';
      }),
      mutateCanonicalPerformanceDefinition((definition) => {
        definition.drawdown.runningSummation = 'naive_sum';
      }),
      mutateCanonicalPerformanceDefinition((definition) => {
        definition.concentration.equalWinnerTieBreaker = 'db_rowid';
      }),
      mutateCanonicalPerformanceDefinition((definition) => {
        definition.displayLimitAffectsAggregates = true;
      }),
    ];

    for (const definition of mutated) {
      expect(fingerprintPerformanceDefinition(definition)).not.toBe(
        PERFORMANCE_DEFINITION_FINGERPRINT,
      );
    }
  });

  it('builds a dataset fingerprint from ordered immutable identities, not row ids or clocks', () => {
    const first = buildPerformanceReport([TRADE_A, TRADE_B]);
    const second = buildPerformanceReport([TRADE_B, TRADE_A]);
    expect(first.dataset.datasetFingerprint).toBe(second.dataset.datasetFingerprint);
    expect(first.dataset.datasetFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first.dataset.performanceDefinitionFingerprint).toBe(PERFORMANCE_DEFINITION_FINGERPRINT);
    expect(buildPerformanceReport([]).dataset.datasetFingerprint).not.toBe(
      first.dataset.datasetFingerprint,
    );
  });
});
