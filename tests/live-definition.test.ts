import { describe, expect, it } from 'vitest';
import { DASHBOARD_DEFINITION_FINGERPRINT } from '../src/dashboard/identity.js';
import { EXECUTION_DEFINITION_FINGERPRINT } from '../src/execution/identity.js';
import {
  LIVE_DEFINITION_FINGERPRINT,
  canonicalLiveDefinition,
  fingerprintLiveDefinition,
  mutateCanonicalLiveDefinition,
} from '../src/live/index.js';
import { WALLET_DEFINITION_FINGERPRINT } from '../src/wallet/identity.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../src/strategy/identity.js';
import { BACKTEST_DEFINITION_FINGERPRINT } from '../src/backtest/identity.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../src/paper/identity.js';
import { POSITION_DEFINITION_FINGERPRINT } from '../src/position/identity.js';
import { EXIT_DEFINITION_FINGERPRINT } from '../src/exit/identity.js';
import { PERFORMANCE_DEFINITION_FINGERPRINT } from '../src/performance/identity.js';
import { RESEARCH_DEFINITION_FINGERPRINT } from '../src/research/identity.js';

describe('live definition', () => {
  it('fingerprints l16_v1 deterministically', () => {
    expect(LIVE_DEFINITION_FINGERPRINT).toBe(
      '57a6fc872f7e51f1e4b041ed5b93413efe0779dea61a88b9dc1b4ed9f05e395d',
    );
    expect(fingerprintLiveDefinition()).toBe(LIVE_DEFINITION_FINGERPRINT);
    expect(fingerprintLiveDefinition(canonicalLiveDefinition())).toBe(LIVE_DEFINITION_FINGERPRINT);
  });

  it('changes identity when a semantic field changes', () => {
    const mutated = mutateCanonicalLiveDefinition((definition) => {
      definition.broadcaster.maxRetries = '1';
    });
    expect(fingerprintLiveDefinition(mutated)).not.toBe(LIVE_DEFINITION_FINGERPRINT);
  });

  it('reproves frozen upstream fingerprints', () => {
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
  });

  it('binds the fixed WSOL→USDC pair and hard caps', () => {
    const definition = canonicalLiveDefinition();
    expect(definition.pair.inputMint).toBe('So11111111111111111111111111111111111111112');
    expect(definition.pair.outputMint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(definition.caps.maxInputLamportsPerAttempt).toBe('1000000');
    expect(definition.caps.maxBroadcastInputLamportsPerUtcDay).toBe('2000000');
    expect(definition.caps.maxBroadcastAttemptsPerUtcDay).toBe(2);
    expect(definition.broadcaster.maxRetries).toBe('0');
    expect(definition.broadcaster.jito).toBe(false);
    expect(definition.interface.strategyAutomation).toBe(false);
  });
});