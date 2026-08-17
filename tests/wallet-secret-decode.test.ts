import { describe, expect, it } from 'vitest';
import { getBase58Decoder } from '@solana/kit';
import { WalletError } from '../src/wallet/errors.js';
import { decodeBase58KeypairSecret, isBase58SecretSyntax } from '../src/wallet/secret-decode.js';
import { loadTestWalletFixture } from './wallet-fixtures.js';

describe('w15 secret decode', () => {
  it('decodes the frozen base58 64-byte format and rejects every other form', async () => {
    const fixture = await loadTestWalletFixture();
    const decoded = decodeBase58KeypairSecret(fixture.secretBase58);
    expect(decoded.byteLength).toBe(64);
    expect(getBase58Decoder().decode(decoded)).toBe(fixture.secretBase58);

    expect(() => decodeBase58KeypairSecret('')).toThrow(WalletError);
    expect(() => decodeBase58KeypairSecret(` ${fixture.secretBase58.slice(0, 16)}`)).toThrow(/encoding/);
    expect(() => decodeBase58KeypairSecret('0OIldeadbeef')).toThrow(/encoding/);
    expect(() => decodeBase58KeypairSecret('0123456789abcdef')).toThrow(/encoding/);
    expect(() => decodeBase58KeypairSecret('AQIDBA==')).toThrow(/encoding/);
    expect(() => decodeBase58KeypairSecret('[1,2,3,4]')).toThrow(/encoding/);
    expect(() => decodeBase58KeypairSecret('abandon abandon abandon')).toThrow(/encoding/);
    expect(() => decodeBase58KeypairSecret('~/.config/solana/id.json')).toThrow(/encoding/);
    expect(isBase58SecretSyntax('0OIl')).toBe(false);
    expect(() => decodeBase58KeypairSecret(`1${fixture.secretBase58}`.slice(0, fixture.secretBase58.length))).toThrow(
      /encoding|64-byte/,
    );
    expect(() => decodeBase58KeypairSecret('abc\n')).toThrow(/encoding/);
    expect(() => decodeBase58KeypairSecret('abc\t')).toThrow(/encoding/);
    expect(() => decodeBase58KeypairSecret(`\u0000${fixture.secretBase58.slice(1)}`)).toThrow(/encoding/);
  });

  it('rejects a well-formed base58 string that is not 64 decoded bytes', () => {
    expect(() => decodeBase58KeypairSecret('2')).toThrow(/64-byte/);
  });
});
