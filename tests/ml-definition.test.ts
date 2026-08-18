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
import { WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT } from '../src/wallet-intelligence/identity.js';
import { LATEST_SCHEMA_VERSION, migrationSqlDigest } from '../src/persistence/sqlite/migrations.js';
import { OPTIMIZATION_DEFINITION_FINGERPRINT } from '../src/optimization/identity.js';
import { COST_DEFINITION_FINGERPRINT } from '../src/optimization/costs.js';
import { canonicalMlDefinition, mutateCanonicalMlDefinition } from '../src/ml/definition.js';
import { fingerprintMlDefinition, ML_DEFINITION_FINGERPRINT } from '../src/ml/identity.js';
import {
  ML_SPEC_NAME,
  ML_SPEC_VERSION,
  MODEL_SIGNAL_THRESHOLD,
  WALLET_INTELLIGENCE_USED,
} from '../src/ml/constants.js';

describe('ml definition', () => {
  it('freezes ml19_v1 identity and wallet-intelligence unused', () => {
    expect(ML_SPEC_VERSION).toBe('ml19_v1');
    expect(ML_SPEC_NAME).toBe('purged_walk_forward_regularized_logistic_research_lab');
    expect(fingerprintMlDefinition()).toBe(ML_DEFINITION_FINGERPRINT);
    expect(ML_DEFINITION_FINGERPRINT).toMatch(/^[0-9a-f]{64}$/);
    expect(MODEL_SIGNAL_THRESHOLD).toBe(0.65);
    const definition = canonicalMlDefinition();
    expect(definition.walletIntelligenceUsed).toBe(false);
    expect(WALLET_INTELLIGENCE_USED).toBe(false);
    expect(definition.baseline.usesLatestEntryInclusive).toBe(false);
    expect(definition.baseline.comparison).toBe(
      'same_chronological_evaluation_interval_different_frozen_entry_policies',
    );
    expect(definition.noLiveIntegration).toBe(true);
    expect(definition.noOosModelSelection).toBe(true);
    expect(definition.threshold.noSearch).toBe(true);
    expect(definition.schema.migration010).toBe('ABSENT');
  });

  it('changes fingerprint when semantics change', () => {
    expect(fingerprintMlDefinition(mutateCanonicalMlDefinition((definition) => {
      definition.threshold.value = 0.66;
    }))).not.toBe(ML_DEFINITION_FINGERPRINT);
  });

  it('reproves frozen upstream fingerprints and schema 9 without migration 010', () => {
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
    expect(WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT).toBe(
      '61e341190e1b8b19a47ed11101932acfebc904b664ee00db7cefff0284d67f32',
    );
    expect(LATEST_SCHEMA_VERSION).toBe(9);
    expect(migrationSqlDigest(9)).toBe(
      'f9f12785034c3181350b279a20e6baa7676fd8c48fb19dd02ce9ead922d12720',
    );
    expect(() => migrationSqlDigest(10)).toThrow();
  });
});
