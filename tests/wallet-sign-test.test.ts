import { describe, expect, it } from 'vitest';
import { createWalletSelfTestChallenge } from '../src/wallet/challenge.js';
import { fingerprintWalletChallenge } from '../src/wallet/identity.js';
import { executeWalletSignTest } from '../src/wallet/index.js';
import { verifyMessageSignature } from '../src/wallet/verify.js';
import { loadTestWalletFixture } from './wallet-fixtures.js';

describe('wallet sign-test challenge', () => {
  it('signs a domain-separated challenge and verifies it locally', async () => {
    const fixture = await loadTestWalletFixture();
    const proof = await executeWalletSignTest(
      {
        TRADING_ENABLED: 'false',
        EXECUTION_TAKER_PUBKEY: fixture.address,
      },
      { promptSecret: () => Promise.resolve(fixture.secretBase58) },
    );
    expect(proof.signatureVerified).toBe(true);
    expect(proof.purpose).toBe('w15_self_test_challenge');
    expect(proof.signerAddress).toBe(fixture.address);
    expect(proof.challengeFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(proof.signatureFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(proof)).not.toContain(fixture.secretBase58);
    expect(proof).not.toHaveProperty('signature');
    expect(proof).not.toHaveProperty('signatureBytes');
  });

  it('keeps the challenge deterministic and not valid transaction bytes', async () => {
    const fixture = await loadTestWalletFixture();
    const first = createWalletSelfTestChallenge(fixture.address);
    const second = createWalletSelfTestChallenge(fixture.address);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.fingerprint).toBe(fingerprintWalletChallenge(first.bytes));
    expect(first.text).toBe(`SolTradingBot\nw15_v1\nsigner-self-test\n${fixture.address}`);
    expect(first.bytes[0]).toBe('S'.charCodeAt(0));
  });

  it('fails verification when the message bytes change', async () => {
    const fixture = await loadTestWalletFixture();
    const challenge = createWalletSelfTestChallenge(fixture.address);
    await expect(
      verifyMessageSignature({
        signerAddress: fixture.address,
        messageBytes: challenge.bytes,
        signatureBytes: new Uint8Array(64),
      }),
    ).rejects.toMatchObject({ code: 'signature_verification_failed' });
  });
});
