import { describe, expect, it } from 'vitest';
import {
  executeWalletStatus,
  formatWalletSignPreflightLines,
  formatWalletSignTestLines,
  formatWalletStatusLines,
  formatWalletVerifyLines,
} from '../src/wallet/index.js';
import { loadTestWalletFixture } from './wallet-fixtures.js';

describe('wallet formatters', () => {
  it('prints status without secrets, RPC URLs, or API keys', () => {
    const lines = formatWalletStatusLines(
      executeWalletStatus({
        TRADING_ENABLED: 'false',
        JUPITER_API_KEY: 'SUPER_SECRET_JUP_KEY_123',
        SOLANA_RPC_URL: 'https://user:password@example.invalid/?api-key=RPC_SECRET',
        WALLET_PRIVATE_KEY: 'SHOULD_NEVER_LOAD',
        PRIVATE_KEY: 'SHOULD_NEVER_LOAD',
        SECRET_KEY: 'SHOULD_NEVER_LOAD',
        SEED_PHRASE: 'abandon abandon abandon',
      }),
    );
    const text = lines.join('\n');
    expect(text).toContain('Checkpoint: 15');
    expect(text).toContain('w15_v1');
    expect(text).toContain('Backend: interactive memory');
    expect(text).toContain('Secret source: hidden TTY only');
    expect(text).toContain('Secret persisted: NO');
    expect(text).toContain('Env private key: NOT SUPPORTED');
    expect(text).toContain('File private key: NOT SUPPORTED');
    expect(text).toContain('Wallet module broadcast capability: unavailable');
    expect(text).toContain('Live broadcast, when enabled, is owned exclusively by l16');
    expect(text).toContain('Jito send: unavailable');
    expect(text).toContain('Dashboard signing: unavailable');
    expect(text).not.toContain('SUPER_SECRET_JUP_KEY_123');
    expect(text).not.toContain('SHOULD_NEVER_LOAD');
    expect(text).not.toContain('abandon');
    expect(text).not.toContain('example.invalid');
    expect(text).not.toContain('RPC_SECRET');
  });

  it('prints public verify and sign-test proofs without raw signatures', async () => {
    const fixture = await loadTestWalletFixture();
    const verify = formatWalletVerifyLines({
      specVersion: 'w15_v1',
      specName: 'interactive_in_memory_signer_security_boundary',
      walletDefinitionFingerprint: 'a'.repeat(64),
      signerAddress: fixture.address,
      configuredTakerPublicKey: fixture.address,
      matchesConfiguredTaker: true,
      walletSignerFingerprint: 'b'.repeat(64),
    }).join('\n');
    expect(verify).toContain(fixture.address);
    expect(verify).toContain('Matches configured taker: YES');
    expect(verify).not.toContain(fixture.secretBase58);

    const signTest = formatWalletSignTestLines({
      walletSpecVersion: 'w15_v1',
      walletDefinitionFingerprint: 'a'.repeat(64),
      signerAddress: fixture.address,
      walletSignerFingerprint: 'b'.repeat(64),
      purpose: 'w15_self_test_challenge',
      challengeFingerprint: 'c'.repeat(64),
      signatureFingerprint: 'd'.repeat(64),
      signatureVerified: true,
      walletSigningProofFingerprint: 'e'.repeat(64),
    }).join('\n');
    expect(signTest).toContain('Verification: passed');
    expect(signTest).not.toContain(fixture.secretBase58);

    const preflight = formatWalletSignPreflightLines({
      specVersion: 'w15_v1',
      specName: 'interactive_in_memory_signer_security_boundary',
      walletDefinitionFingerprint: 'a'.repeat(64),
      executionStatus: 'simulation_passed',
      proof: {
        walletSpecVersion: 'w15_v1',
        walletDefinitionFingerprint: 'a'.repeat(64),
        signerAddress: fixture.address,
        walletSignerFingerprint: 'b'.repeat(64),
        purpose: 'exact_e14_final_preflight_candidate',
        executionDefinitionFingerprint: 'f'.repeat(64),
        executionIntentFingerprint: '1'.repeat(64),
        jupiterBuildFingerprint: '2'.repeat(64),
        executionCandidateFingerprint: '3'.repeat(64),
        compiledMessageSha256: '4'.repeat(64),
        signatureVerified: true,
        signedTransactionFingerprint: '5'.repeat(64),
        walletSigningProofFingerprint: '6'.repeat(64),
      },
    }).join('\n');
    expect(preflight).toContain('SIGNED IN MEMORY / NOT BROADCAST / NOT RETURNED');
    expect(preflight).not.toContain('signedTransaction');
    expect(preflight).not.toContain(fixture.secretBase58);
  });
});
