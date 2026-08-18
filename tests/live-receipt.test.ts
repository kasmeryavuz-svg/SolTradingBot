import { describe, expect, it } from 'vitest';
import { USDC_MINT } from '../src/config/index.js';
import { deriveTakerUsdcOutputRaw, verifyConfirmedReceipt } from '../src/live/receipt.js';
import { signedWireSha256FromBase64 } from '../src/live/identity.js';

const WIRE = Buffer.from('signed-wire-fixture', 'utf8').toString('base64');
const HASH = signedWireSha256FromBase64(WIRE);
const TAKER = 'GkwFnmMDvn3HGMpJpWBg8tgJxr3NxNvg3AXxvXVPbRGJ';
const EXPECTED = 'ExpectedTxid';

describe('live receipt', () => {
  it('derives taker USDC output from raw token balances and treats missing pre as zero', () => {
    expect(
      deriveTakerUsdcOutputRaw(
        [],
        [{ mint: USDC_MINT, owner: TAKER, amountRaw: '1980000', accountIndex: 1 }],
        TAKER,
      ),
    ).toBe('1980000');
    expect(deriveTakerUsdcOutputRaw([], [], TAKER)).toBeNull();
  });

  it('returns null for negative USDC delta, missing owner, and duplicate account indexes', () => {
    expect(
      deriveTakerUsdcOutputRaw(
        [{ mint: USDC_MINT, owner: TAKER, amountRaw: '5', accountIndex: 1 }],
        [{ mint: USDC_MINT, owner: TAKER, amountRaw: '1', accountIndex: 1 }],
        TAKER,
      ),
    ).toBeNull();
    expect(
      deriveTakerUsdcOutputRaw(
        [],
        [{ mint: USDC_MINT, owner: null, amountRaw: '1980000', accountIndex: 1 }],
        TAKER,
      ),
    ).toBeNull();
    expect(
      deriveTakerUsdcOutputRaw(
        [],
        [
          { mint: USDC_MINT, owner: TAKER, amountRaw: '1', accountIndex: 1 },
          { mint: USDC_MINT, owner: TAKER, amountRaw: '2', accountIndex: 1 },
        ],
        TAKER,
      ),
    ).toBeNull();
  });

  it('rejects a confirmed wire hash mismatch', () => {
    expect(() =>
      verifyConfirmedReceipt({
        receipt: {
          slot: '1',
          err: null,
          feeLamports: 5000n,
          transactionBase64: WIRE,
          firstSignature: EXPECTED,
          preTokenBalances: [],
          postTokenBalances: [{ mint: USDC_MINT, owner: TAKER, amountRaw: '1980000', accountIndex: 1 }],
        },
        localSignedWireSha256: '0'.repeat(64),
        expectedSignature: EXPECTED,
        takerAddress: TAKER,
        minimumOutputRaw: '1980000',
        requireSuccess: true,
      }),
    ).toThrow(/confirmation_integrity_error/);
  });

  it('rejects derived output below the Jupiter minimum threshold', () => {
    expect(() =>
      verifyConfirmedReceipt({
        receipt: {
          slot: '1',
          err: null,
          feeLamports: 5000n,
          transactionBase64: WIRE,
          firstSignature: EXPECTED,
          preTokenBalances: [],
          postTokenBalances: [{ mint: USDC_MINT, owner: TAKER, amountRaw: '1', accountIndex: 1 }],
        },
        localSignedWireSha256: HASH,
        expectedSignature: EXPECTED,
        takerAddress: TAKER,
        minimumOutputRaw: '1980000',
        requireSuccess: true,
      }),
    ).toThrow(/receipt_integrity_error/);
  });
});
