import { describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import {
  fingerprintExecutionIntent,
  isCanonicalAmountRaw,
  validateExecutionIntent,
} from '../src/execution/index.js';
import { executionIntent } from './execution-fixtures.js';

describe('execution intent', () => {
  it('accepts a canonical ExactIn intent', () => {
    expect(validateExecutionIntent(executionIntent())).toEqual(executionIntent());
  });

  it('rejects non-canonical amountRaw forms rather than normalizing them', () => {
    for (const amountRaw of ['0', '-1', '+1', '1.0', '1e9', '01', ' 1', '1 ', 'NaN', 'Infinity', '0x10', '']) {
      expect(isCanonicalAmountRaw(amountRaw)).toBe(false);
      expect(() => validateExecutionIntent(executionIntent({ amountRaw }))).toThrow(/amountRaw/);
    }
  });

  it('rejects values above u64 max', () => {
    expect(() =>
      validateExecutionIntent(executionIntent({ amountRaw: '18446744073709551616' })),
    ).toThrow(/amountRaw/);
  });

  it('rejects identical mints and invalid addresses', () => {
    expect(() =>
      validateExecutionIntent(executionIntent({ outputMint: WRAPPED_SOL_MINT })),
    ).toThrow(/must be different/);
    expect(() => validateExecutionIntent(executionIntent({ inputMint: 'not-an-address' }))).toThrow(
      /input mint/,
    );
    expect(() => validateExecutionIntent(executionIntent({ takerPublicKey: 'short' }))).toThrow(/taker/);
  });

  it('changes the intent fingerprint when each bound field mutates', () => {
    const base = fingerprintExecutionIntent(executionIntent());
    expect(fingerprintExecutionIntent(executionIntent({ inputMint: USDC_MINT, outputMint: WRAPPED_SOL_MINT }))).not.toBe(
      base,
    );
    expect(fingerprintExecutionIntent(executionIntent({ amountRaw: '2' }))).not.toBe(base);
    expect(
      fingerprintExecutionIntent(
        executionIntent({ takerPublicKey: '11111111111111111111111111111111' }),
      ),
    ).not.toBe(base);
  });
});
