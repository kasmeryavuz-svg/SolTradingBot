import { describe, expect, it } from 'vitest';
import { TOKEN_2022_PROGRAM_ID } from '../src/wallet-intelligence/constants.js';
import { extractJsonParsedAccountKeys, projectWalletTokenDeltas } from '../src/wallet-intelligence/deltas.js';
import { historyEvidenceSha256 } from '../src/wallet-intelligence/identity.js';
import { deriveWalletHistoryFeatures } from '../src/wallet-intelligence/profile.js';
import type { WalletTokenDeltaProjection } from '../src/wallet-intelligence/types.js';
import { WALLET_A, WALLET_B, WI_MINT, tokenBalance } from './wallet-intelligence-fixtures.js';

const MINT_B = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11MCCe8BenwNYB';

function project(input: Parameters<typeof projectWalletTokenDeltas>[0]) {
  return projectWalletTokenDeltas(input);
}

describe('wallet intelligence token deltas', () => {
  it('aggregates the same wallet and mint across token accounts before delta', () => {
    const projection = project({
      walletAddress: WALLET_A,
      signature: 'sig-agg',
      slot: 1,
      transactionIndex: 0,
      blockTime: 1,
      preTokenBalances: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '100' }),
        tokenBalance({ accountIndex: 2, mint: WI_MINT, owner: WALLET_A, amountRaw: '40' }),
      ],
      postTokenBalances: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '130' }),
        tokenBalance({ accountIndex: 2, mint: WI_MINT, owner: WALLET_A, amountRaw: '60' }),
      ],
    });
    expect(projection.incomplete).toBe(false);
    expect(projection.mintDeltas).toEqual([{ mint: WI_MINT, netRawDelta: '50' }]);
    expect(projection.kind).toBe('positive_token_delta');
  });

  it('marks bidirectional only when different mints move in opposite directions', () => {
    const bidirectional = project({
      walletAddress: WALLET_A,
      signature: 'sig-bi',
      slot: 1,
      transactionIndex: 0,
      blockTime: 1,
      preTokenBalances: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '100' }),
        tokenBalance({ accountIndex: 2, mint: MINT_B, owner: WALLET_A, amountRaw: '200' }),
      ],
      postTokenBalances: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '150' }),
        tokenBalance({ accountIndex: 2, mint: MINT_B, owner: WALLET_A, amountRaw: '180' }),
      ],
    });
    expect(bidirectional.kind).toBe('bidirectional_token_change');
    expect(bidirectional.kind).not.toBe('swap' as typeof bidirectional.kind);
    const onlyPositive = project({
      walletAddress: WALLET_A,
      signature: 'sig-pos',
      slot: 1,
      transactionIndex: 0,
      blockTime: 1,
      preTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '100' })],
      postTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '150' })],
    });
    expect(onlyPositive.kind).toBe('positive_token_delta');
    const onlyNegative = project({
      walletAddress: WALLET_A,
      signature: 'sig-neg',
      slot: 1,
      transactionIndex: 0,
      blockTime: 1,
      preTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '100' })],
      postTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '40' })],
    });
    expect(onlyNegative.kind).toBe('negative_token_delta');
    const netZeroSameMint = project({
      walletAddress: WALLET_A,
      signature: 'sig-zero',
      slot: 1,
      transactionIndex: 0,
      blockTime: 1,
      preTokenBalances: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '100' }),
        tokenBalance({ accountIndex: 2, mint: WI_MINT, owner: WALLET_A, amountRaw: '50' }),
      ],
      postTokenBalances: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '150' }),
        tokenBalance({ accountIndex: 2, mint: WI_MINT, owner: WALLET_A, amountRaw: '0' }),
      ],
    });
    expect(netZeroSameMint.kind).toBe('no_net_token_delta');
    const plusAMinusBPlusC = project({
      walletAddress: WALLET_A,
      signature: 'sig-three',
      slot: 1,
      transactionIndex: 0,
      blockTime: 1,
      preTokenBalances: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '100' }),
        tokenBalance({ accountIndex: 2, mint: MINT_B, owner: WALLET_A, amountRaw: '200' }),
        tokenBalance({ accountIndex: 3, mint: WALLET_A, owner: WALLET_A, amountRaw: '1' }),
      ],
      postTokenBalances: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '150' }),
        tokenBalance({ accountIndex: 2, mint: MINT_B, owner: WALLET_A, amountRaw: '180' }),
        tokenBalance({ accountIndex: 3, mint: WALLET_A, owner: WALLET_A, amountRaw: '8' }),
      ],
    });
    expect(plusAMinusBPlusC.kind).toBe('bidirectional_token_change');
  });

  it('does not label a complete transfer-in as BUY or a complete transfer-out as SELL', () => {
    const incoming = project({
      walletAddress: WALLET_A,
      signature: 'transfer-in',
      slot: 1,
      transactionIndex: 0,
      blockTime: 1,
      preTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '0' })],
      postTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '9' })],
    });
    expect(incoming.kind).toBe('positive_token_delta');
    expect(JSON.stringify(incoming)).not.toMatch(/BUY|SELL|SWAP/);
    const outgoing = project({
      walletAddress: WALLET_A,
      signature: 'transfer-out',
      slot: 1,
      transactionIndex: 0,
      blockTime: 1,
      preTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '9' })],
      postTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '0' })],
    });
    expect(outgoing.kind).toBe('negative_token_delta');
    expect(JSON.stringify(outgoing)).not.toMatch(/BUY|SELL|SWAP/);
  });

  it('marks missing balance arrays and malformed ownership as incomplete instead of fabricating zero', () => {
    const missingArray = project({
      walletAddress: WALLET_A,
      signature: 'missing-pre',
      slot: 1,
      transactionIndex: 0,
      blockTime: 1,
      preTokenBalances: null,
      postTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '9' })],
    });
    expect(missingArray.incomplete).toBe(true);
    expect(missingArray.mintDeltas).toEqual([]);
    const projection = project({
      walletAddress: WALLET_A,
      signature: 'malformed',
      slot: 1,
      transactionIndex: 0,
      blockTime: 1,
      preTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: null, amountRaw: '100' })],
      postTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '100' })],
    });
    expect(projection.incomplete).toBe(true);
    expect(projection.kind).toBe('incomplete_token_delta');
    expect(projection.mintDeltas).toEqual([]);
  });

  it('parses account-key objects and strings the same way and does not use them for owner mapping', () => {
    const asStrings = extractJsonParsedAccountKeys(
      { accountKeys: [WALLET_A, WI_MINT] },
      { loadedAddresses: { writable: [WALLET_B], readonly: [] } },
    );
    const asObjects = extractJsonParsedAccountKeys(
      { accountKeys: [{ pubkey: WALLET_A, signer: true, writable: true }, { pubkey: WI_MINT }] },
      { loadedAddresses: { writable: [WALLET_B], readonly: [] } },
    );
    expect(asStrings).toEqual(asObjects);
    const mappedByOwner = project({
      walletAddress: WALLET_A,
      signature: 'keys',
      slot: 1,
      transactionIndex: 0,
      blockTime: 1,
      preTokenBalances: [tokenBalance({ accountIndex: 99, mint: WI_MINT, owner: WALLET_A, amountRaw: '1' })],
      postTokenBalances: [tokenBalance({ accountIndex: 99, mint: WI_MINT, owner: WALLET_A, amountRaw: '2' })],
    });
    expect(mappedByOwner.kind).toBe('positive_token_delta');
  });
});

describe('wallet intelligence incomplete counterpart policy', () => {
  const base = {
    walletAddress: WALLET_A,
    slot: 1,
    transactionIndex: 0,
    blockTime: 1_700_000_000,
  } as const;

  function features(projections: readonly WalletTokenDeltaProjection[]) {
    return deriveWalletHistoryFeatures({ targetMint: WI_MINT, projections });
  }

  it('A: pre without matching post is incomplete and does not invent a negative delta', () => {
    const projection = project({
      ...base,
      signature: 'case-a',
      preTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '100' })],
      postTokenBalances: [],
    });
    expect(projection.incomplete).toBe(true);
    expect(projection.kind).toBe('incomplete_token_delta');
    expect(projection.mintDeltas).toEqual([]);
    const derived = features([projection]);
    expect(derived.incompleteDeltaTxCount30d).toBe(1);
    expect(derived.negativeTokenDeltaTxCount30d).toBe(0);
    expect(derived.targetMintNetRawDelta30d).toBe('0');
  });

  it('B: post without matching pre is incomplete and does not invent a positive delta', () => {
    const projection = project({
      ...base,
      signature: 'case-b',
      preTokenBalances: [],
      postTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '100' })],
    });
    expect(projection.incomplete).toBe(true);
    expect(projection.mintDeltas).toEqual([]);
    const derived = features([projection]);
    expect(derived.positiveTokenDeltaTxCount30d).toBe(0);
    expect(derived.targetMintPositiveDeltaTxCount30d).toBe(0);
  });

  it('C: a complete +A pair plus an incomplete Mint B pair marks the entire transaction incomplete', () => {
    const projection = project({
      ...base,
      signature: 'case-c',
      preTokenBalances: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '100' }),
        tokenBalance({ accountIndex: 2, mint: MINT_B, owner: WALLET_A, amountRaw: '10' }),
      ],
      postTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '150' })],
    });
    expect(projection.incomplete).toBe(true);
    const derived = features([projection]);
    expect(derived.positiveTokenDeltaTxCount30d).toBe(0);
    expect(derived.bidirectionalTokenDeltaTxCount30d).toBe(0);
    expect(derived.uniqueMintsWithBalanceChange30d).toBe(0);
  });

  it('D: complete +A and complete -B remain bidirectional', () => {
    const projection = project({
      ...base,
      signature: 'case-d',
      preTokenBalances: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '100' }),
        tokenBalance({ accountIndex: 2, mint: MINT_B, owner: WALLET_A, amountRaw: '200' }),
      ],
      postTokenBalances: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '150' }),
        tokenBalance({ accountIndex: 2, mint: MINT_B, owner: WALLET_A, amountRaw: '180' }),
      ],
    });
    expect(projection.incomplete).toBe(false);
    expect(projection.kind).toBe('bidirectional_token_change');
    const derived = features([projection]);
    expect(derived.bidirectionalTokenDeltaTxCount30d).toBe(1);
    expect(derived.positiveTokenDeltaTxCount30d).toBe(0);
    expect(derived.negativeTokenDeltaTxCount30d).toBe(0);
  });

  it('E: complete target +50 plus another incomplete wallet mint does not move target metrics', () => {
    const projection = project({
      ...base,
      signature: 'case-e',
      preTokenBalances: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '100' }),
        tokenBalance({ accountIndex: 2, mint: MINT_B, owner: WALLET_A, amountRaw: '7' }),
      ],
      postTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '150' })],
    });
    expect(projection.incomplete).toBe(true);
    const derived = features([projection]);
    expect(derived.targetMintPositiveDeltaTxCount30d).toBe(0);
    expect(derived.targetMintNetRawDelta30d).toBe('0');
    expect(derived.activeDaysObserved30d).toBe(0);
  });

  it('F: target mint itself missing counterpart is incomplete with no target net delta', () => {
    const projection = project({
      ...base,
      signature: 'case-f',
      preTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '50' })],
      postTokenBalances: [tokenBalance({ accountIndex: 2, mint: MINT_B, owner: WALLET_A, amountRaw: '1' })],
    });
    expect(projection.incomplete).toBe(true);
    const derived = features([projection]);
    expect(derived.targetMintNetRawDelta30d).toBe('0');
    expect(derived.targetMintPositiveDeltaTxCount30d).toBe(0);
    expect(derived.targetMintNegativeDeltaTxCount30d).toBe(0);
  });

  it('G: several incomplete rows in one transaction increment incompleteDeltaTxCount once', () => {
    const projection = project({
      ...base,
      signature: 'case-g',
      preTokenBalances: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '100' }),
        tokenBalance({ accountIndex: 2, mint: MINT_B, owner: WALLET_A, amountRaw: '20' }),
      ],
      postTokenBalances: [],
    });
    expect(projection.incomplete).toBe(true);
    const once = features([projection]);
    expect(once.incompleteDeltaTxCount30d).toBe(1);
  });

  it('H/I: null pre or post arrays are incomplete when wallet-relevant', () => {
    const nullPre = project({
      ...base,
      signature: 'case-h',
      preTokenBalances: null,
      postTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '9' })],
    });
    const nullPost = project({
      ...base,
      signature: 'case-i',
      preTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '9' })],
      postTokenBalances: null,
    });
    expect(nullPre.incomplete).toBe(true);
    expect(nullPost.incomplete).toBe(true);
    expect(nullPre.mintDeltas).toEqual([]);
    expect(nullPost.mintDeltas).toEqual([]);
  });

  it('J: both empty arrays fabricate neither a delta nor an active day', () => {
    const projection = project({
      ...base,
      signature: 'case-j',
      preTokenBalances: [],
      postTokenBalances: [],
    });
    expect(projection.incomplete).toBe(false);
    expect(projection.kind).toBe('no_net_token_delta');
    expect(projection.mintDeltas).toEqual([]);
    const derived = features([projection]);
    expect(derived.activeDaysObserved30d).toBe(0);
    expect(derived.positiveTokenDeltaTxCount30d).toBe(0);
    expect(derived.incompleteDeltaTxCount30d).toBe(0);
  });

  it('K: huge BigInt complete pre/post still computes exactly', () => {
    const huge = '9007199254740993000';
    const projection = project({
      ...base,
      signature: 'case-k',
      preTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: huge })],
      postTokenBalances: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '9007199254740993050' }),
      ],
    });
    expect(projection.incomplete).toBe(false);
    expect(projection.mintDeltas).toEqual([{ mint: WI_MINT, netRawDelta: '50' }]);
    const derived = features([projection]);
    expect(derived.targetMintNetRawDelta30d).toBe('50');
    expect(derived.positiveTokenDeltaTxCount30d).toBe(1);
  });

  it('identity mismatch on decimals or programId marks the entire transaction incomplete', () => {
    const decimalsMismatch = project({
      ...base,
      signature: 'decimals',
      preTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '10', decimals: 6 })],
      postTokenBalances: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '11', decimals: 9 }),
      ],
    });
    const programMismatch = project({
      ...base,
      signature: 'program',
      preTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '10' })],
      postTokenBalances: [
        tokenBalance({
          accountIndex: 1,
          mint: WI_MINT,
          owner: WALLET_A,
          amountRaw: '11',
          programId: TOKEN_2022_PROGRAM_ID,
        }),
      ],
    });
    const missingProgram = project({
      ...base,
      signature: 'missing-program',
      preTokenBalances: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '10', programId: null }),
      ],
      postTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '11' })],
    });
    expect(decimalsMismatch.incomplete).toBe(true);
    expect(programMismatch.incomplete).toBe(true);
    expect(missingProgram.incomplete).toBe(true);
  });

  it('binds complete versus incomplete evidence in the history digest', () => {
    const complete = project({
      ...base,
      signature: 'same-sig',
      preTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '10' })],
      postTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '12' })],
    });
    const incomplete = project({
      ...base,
      signature: 'same-sig',
      preTokenBalances: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '10' })],
      postTokenBalances: [],
    });
    expect(complete.incomplete).toBe(false);
    expect(incomplete.incomplete).toBe(true);
    expect(historyEvidenceSha256([complete])).not.toBe(historyEvidenceSha256([incomplete]));
  });
});
