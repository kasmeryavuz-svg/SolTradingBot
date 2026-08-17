import { describe, expect, it } from 'vitest';
import { WalletError } from '../src/wallet/errors.js';
import { fingerprintWalletSigner } from '../src/wallet/identity.js';
import { executeWalletVerify } from '../src/wallet/index.js';
import { assertSignerMatchesTaker, createWalletSignerFromSecretBytes } from '../src/wallet/signer.js';
import { withInteractiveSigner } from '../src/wallet/signer-scope.js';
import { loadTestWalletFixture } from './wallet-fixtures.js';

describe('interactive memory signer', () => {
  it('creates a scoped signer whose address matches the configured taker', async () => {
    const fixture = await loadTestWalletFixture();
    const seen: string[] = [];
    await withInteractiveSigner(
      fixture.address,
      (signer) => {
        seen.push(signer.address);
        assertSignerMatchesTaker(signer, fixture.address);
        return Promise.resolve(signer.address);
      },
      { promptSecret: () => Promise.resolve(fixture.secretBase58) },
    );
    expect(seen).toEqual([fixture.address]);
  });

  it('refuses a signer that does not match the configured taker', async () => {
    const fixture = await loadTestWalletFixture();
    const other = await loadTestWalletFixture('other');
    await expect(
      withInteractiveSigner(other.address, () => Promise.resolve('nope'), {
        promptSecret: () => Promise.resolve(fixture.secretBase58),
      }),
    ).rejects.toMatchObject({ code: 'signer_address_mismatch' });
  });

  it('does not keep a global signer after the callback', async () => {
    const fixture = await loadTestWalletFixture();
    let captured: { address: string } | undefined;
    await withInteractiveSigner(
      fixture.address,
      (signer) => {
        captured = signer;
        return Promise.resolve();
      },
      { promptSecret: () => Promise.resolve(fixture.secretBase58) },
    );
    expect(captured?.address).toBe(fixture.address);
    expect(globalThis).not.toHaveProperty('getGlobalWallet');
  });

  it('verify reports a public match and never returns the secret', async () => {
    const fixture = await loadTestWalletFixture();
    const report = await executeWalletVerify(
      {
        TRADING_ENABLED: 'false',
        EXECUTION_TAKER_PUBKEY: fixture.address,
      },
      { promptSecret: () => Promise.resolve(fixture.secretBase58) },
    );
    expect(report.matchesConfiguredTaker).toBe(true);
    expect(report.signerAddress).toBe(fixture.address);
    expect(report.walletSignerFingerprint).toBe(fingerprintWalletSigner(fixture.address));
    expect(JSON.stringify(report)).not.toContain(fixture.secretBase58);
  });

  it('refuses TRADING_ENABLED=true before prompting', async () => {
    const fixture = await loadTestWalletFixture();
    let prompts = 0;
    await expect(
      executeWalletVerify(
        {
          TRADING_ENABLED: 'true',
          EXECUTION_TAKER_PUBKEY: fixture.address,
        },
        {
          promptSecret: () => {
            prompts += 1;
            return Promise.resolve(fixture.secretBase58);
          },
        },
      ),
    ).rejects.toBeInstanceOf(WalletError);
    expect(prompts).toBe(0);
  });

  it('creates a signer from exact 64-byte fixture material', async () => {
    const fixture = await loadTestWalletFixture();
    const signer = await createWalletSignerFromSecretBytes(Uint8Array.from(fixture.secretBytes));
    expect(signer.address).toBe(fixture.address);
  });
});
