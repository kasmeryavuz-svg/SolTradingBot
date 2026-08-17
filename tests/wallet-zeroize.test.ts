import { describe, expect, it } from 'vitest';
import { createWalletSelfTestChallenge } from '../src/wallet/challenge.js';
import { WalletError } from '../src/wallet/errors.js';
import { createWalletSignerFromSecretBytes } from '../src/wallet/signer.js';
import { withDecodedSecretSigner } from '../src/wallet/signer-scope.js';
import { signAndVerifySelfTest } from '../src/wallet/verify.js';
import { zeroizeBytes } from '../src/wallet/zeroize.js';
import { loadTestWalletFixture } from './wallet-fixtures.js';

describe('best-effort zeroization', () => {
  it('overwrites caller-owned decoded buffers after success', async () => {
    const fixture = await loadTestWalletFixture();
    const bytes = Uint8Array.from(fixture.secretBytes);
    await withDecodedSecretSigner(fixture.address, bytes, (signer) => {
      expect(signer.address).toBe(fixture.address);
      return Promise.resolve('ok');
    });
    expect(bytes.every((value) => value === 0)).toBe(true);
  });

  it('overwrites caller-owned buffers after an address mismatch', async () => {
    const fixture = await loadTestWalletFixture();
    const other = await loadTestWalletFixture('other');
    const bytes = Uint8Array.from(fixture.secretBytes);
    await expect(withDecodedSecretSigner(other.address, bytes, () => Promise.resolve('nope'))).rejects.toMatchObject({
      code: 'signer_address_mismatch',
    });
    expect(bytes.every((value) => value === 0)).toBe(true);
  });

  it('overwrites caller-owned buffers after a callback throw', async () => {
    const fixture = await loadTestWalletFixture();
    const bytes = Uint8Array.from(fixture.secretBytes);
    await expect(
      withDecodedSecretSigner(fixture.address, bytes, () => {
        throw new Error('callback failed');
      }),
    ).rejects.toThrow(/callback failed/);
    expect(bytes.every((value) => value === 0)).toBe(true);
  });

  it('overwrites caller-owned buffers after a signing throw', async () => {
    const fixture = await loadTestWalletFixture();
    const bytes = Uint8Array.from(fixture.secretBytes);
    await expect(
      withDecodedSecretSigner(fixture.address, bytes, async (signer) => {
        await signer.signMessages([
          {
            content: new Uint8Array([1, 2, 3]),
            signatures: {},
          },
        ]);
        throw new WalletError('signing throw', { code: 'wallet_operation_failed' });
      }),
    ).rejects.toMatchObject({ code: 'wallet_operation_failed' });
    expect(bytes.every((value) => value === 0)).toBe(true);
  });

  it('fills a Buffer copy with zeros', () => {
    const buffer = Buffer.from([1, 2, 3, 4]);
    zeroizeBytes(buffer);
    expect(buffer.equals(Buffer.alloc(4))).toBe(true);
  });

  it('keeps the Kit signer valid after the caller-owned 64-byte source is zeroized', async () => {
    const fixture = await loadTestWalletFixture();
    const bytes = Uint8Array.from(fixture.secretBytes);
    const signer = await createWalletSignerFromSecretBytes(bytes);
    zeroizeBytes(bytes);
    expect(bytes.every((value) => value === 0)).toBe(true);
    const challenge = createWalletSelfTestChallenge(signer.address);
    const signature = await signAndVerifySelfTest(signer, challenge.bytes);
    expect(signature.byteLength).toBe(64);
    signature.fill(0);
  });

  it('does not expose keypair or secret accessors on the public signer', async () => {
    const fixture = await loadTestWalletFixture();
    const signer = await createWalletSignerFromSecretBytes(Uint8Array.from(fixture.secretBytes));
    expect(signer.address).toBe(fixture.address);
    expect(signer).not.toHaveProperty('keyPair');
    expect(signer).not.toHaveProperty('privateKey');
    expect(signer).not.toHaveProperty('secretBytes');
    expect(signer).not.toHaveProperty('exportSecret');
  });
});
