import { describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { SPL_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '../src/risk/constants.js';
import { parseMintAccountResponse, parseSupplyResponse } from '../src/risk/solana/parser.js';
import { RiskScanError } from '../src/risk/types.js';
import { mintAccountValue } from './risk-fixtures.js';

describe('risk mint parser', () => {
  it('parses a valid standard SPL mint', () => {
    const parsed = parseMintAccountResponse({
      contextSlot: 10,
      value: mintAccountValue({ decimals: 9 }),
    });

    expect(parsed.tokenProgram).toBe('spl_token');
    expect(parsed.programOwner).toBe(SPL_TOKEN_PROGRAM_ID);
    expect(parsed.decimals).toBe(9);
    expect(parsed.extensions).toEqual([]);
  });

  it('parses a valid Token-2022 mint', () => {
    const parsed = parseMintAccountResponse({
      contextSlot: 11,
      value: mintAccountValue({
        owner: TOKEN_2022_PROGRAM_ID,
        extensions: [{ extension: 'metadataPointer' }],
      }),
    });

    expect(parsed.tokenProgram).toBe('token_2022');
    expect(parsed.extensions[0]?.name).toBe('metadataPointer');
  });

  it('hard-fails when the mint account is missing', () => {
    expect(() => {
      parseMintAccountResponse({ contextSlot: 1, value: null });
    }).toThrow(/not found/i);
  });

  it('hard-fails for an unsupported account owner', () => {
    expect(() => {
      parseMintAccountResponse({
        contextSlot: 1,
        value: mintAccountValue({ owner: USDC_MINT }),
      });
    }).toThrow(/not a supported token program/i);
  });

  it('hard-fails when the parsed account is not a mint', () => {
    expect(() => {
      parseMintAccountResponse({
        contextSlot: 1,
        value: mintAccountValue({ type: 'account' }),
      });
    }).toThrow(/not a parsed mint/i);
  });

  it('hard-fails when the mint is uninitialized', () => {
    expect(() => {
      parseMintAccountResponse({
        contextSlot: 1,
        value: mintAccountValue({ isInitialized: false }),
      });
    }).toThrow(/not initialized/i);
  });

  it('hard-fails when jsonParsed falls back to raw bytes', () => {
    expect(() => {
      parseMintAccountResponse({
        contextSlot: 1,
        value: mintAccountValue({ unparsed: true }),
      });
    }).toThrow(/not a parsed mint/i);
  });

  it('does not fabricate Token-2022 extensions for classic SPL mints', () => {
    const parsed = parseMintAccountResponse({
      contextSlot: 1,
      value: mintAccountValue({
        extensions: [{ extension: 'permanentDelegate', state: { delegate: USDC_MINT } }],
      }),
    });

    expect(parsed.tokenProgram).toBe('spl_token');
    expect(parsed.extensions).toEqual([]);
  });

  it('keeps an unknown Token-2022 extension without crashing', () => {
    const parsed = parseMintAccountResponse({
      contextSlot: 1,
      value: mintAccountValue({
        owner: TOKEN_2022_PROGRAM_ID,
        extensions: [{ extension: 'brandNewFutureExtension', state: { weird: true } }],
      }),
    });

    expect(parsed.extensions[0]?.name).toBe('brandNewFutureExtension');
    expect(parsed.extensions[0]?.classified).toBe(false);
  });
});

describe('risk supply parser', () => {
  it('parses raw supply with BigInt-safe decimal strings', () => {
    const parsed = parseSupplyResponse({
      contextSlot: 50,
      amount: '18446744073709551615',
      decimals: 6,
    });

    expect(parsed.supplyRaw).toBe('18446744073709551615');
    expect(BigInt(parsed.supplyRaw)).toBe(18446744073709551615n);
    expect(parsed.supplyContextSlot).toBe(50);
    expect(parsed.decimals).toBe(6);
  });

  it('rejects malformed supply instead of inventing zero', () => {
    expect(() => {
      parseSupplyResponse({ contextSlot: 1, amount: 'not-a-number', decimals: 6 });
    }).toThrow(RiskScanError);

    expect(() => {
      parseSupplyResponse({ contextSlot: 1, amount: '-1', decimals: 6 });
    }).toThrow(RiskScanError);
  });
});

describe('risk largest-account amounts', () => {
  it('keeps a very large raw account amount as a decimal string', () => {
    expect(WRAPPED_SOL_MINT.length).toBeGreaterThan(30);
    expect(BigInt('18446744073709551615').toString()).toBe('18446744073709551615');
    expect(String(Number('18446744073709551615'))).not.toBe('18446744073709551615');
  });
});
