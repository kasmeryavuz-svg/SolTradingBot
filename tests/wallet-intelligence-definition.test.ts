import { describe, expect, it } from 'vitest';
import { WALLET_INTELLIGENCE_SPEC_NAME, WALLET_INTELLIGENCE_SPEC_VERSION } from '../src/wallet-intelligence/constants.js';
import {
  canonicalWalletIntelligenceDefinition,
  mutateCanonicalWalletIntelligenceDefinition,
} from '../src/wallet-intelligence/definition.js';
import {
  WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT,
  fingerprintWalletIntelligenceDefinition,
} from '../src/wallet-intelligence/identity.js';
import { formatWalletIntelligenceStatusLines } from '../src/wallet-intelligence/format.js';

describe('wi18_v1 definition', () => {
  it('freezes identity, name, and fingerprint', () => {
    expect(WALLET_INTELLIGENCE_SPEC_VERSION).toBe('wi18_v1');
    expect(WALLET_INTELLIGENCE_SPEC_NAME).toBe('public_onchain_holder_cohort_intelligence');
    expect(WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT).toBe(
      '61e341190e1b8b19a47ed11101932acfebc904b664ee00db7cefff0284d67f32',
    );
    expect(fingerprintWalletIntelligenceDefinition()).toBe(WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT);
    expect(fingerprintWalletIntelligenceDefinition(canonicalWalletIntelligenceDefinition())).toBe(
      WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT,
    );
  });

  it('changes fingerprint when a frozen semantic is mutated', () => {
    expect(
      fingerprintWalletIntelligenceDefinition(
        mutateCanonicalWalletIntelligenceDefinition((definition) => {
          definition.history.cap = 201;
        }),
      ),
    ).not.toBe(WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT);
    expect(
      fingerprintWalletIntelligenceDefinition(
        mutateCanonicalWalletIntelligenceDefinition((definition) => {
          definition.walletIntelligenceSpecVersion = 'wi18_v2';
        }),
      ),
    ).not.toBe(WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT);
  });

  it('binds no-score, no-PnL, no-copy-trade, and no-identity rules', () => {
    const definition = canonicalWalletIntelligenceDefinition();
    expect(definition.noCompositeScore).toBe(true);
    expect(definition.noPnl).toBe(true);
    expect(definition.noCopyTrade).toBe(true);
    expect(definition.noIdentityAttribution).toBe(true);
    expect(definition.noFundingCluster).toBe(true);
    expect(definition.noMachineLearning).toBe(true);
    expect(definition.language.positiveDeltaNotBuy).toBe(true);
    expect(definition.language.negativeDeltaNotSell).toBe(true);
    expect(definition.language.observedAgeNotWalletCreation).toBe(true);
    expect(definition.tokenDeltas.missingCounterpartPolicy).toBe(
      'mark_entire_transaction_incomplete_no_zero_inference',
    );
    expect(definition.tokenDeltas.incompleteTransactionAffectsDirectionalMetrics).toBe(false);
    expect(definition.tokenDeltas.incompleteTransactionAffectsUniqueMintMetrics).toBe(false);
    expect(definition.tokenDeltas.incompleteTransactionAffectsTargetMintNet).toBe(false);
    expect(definition.tokenDeltas.incompleteTransactionAffectsActiveDays).toBe(false);
    expect(definition.tokenDeltas.incompleteTransactionStillCountsAsObservedHistory).toBe(true);
    const status = formatWalletIntelligenceStatusLines().join('\n');
    expect(status).toContain('Checkpoint 18');
    expect(status).toContain('Signing: NONE');
    expect(status).toContain('Copy trading: NONE');
    expect(status).not.toMatch(/smartWalletScore|whaleScore|copy this wallet/i);
  });
});
