import { describe, expect, it } from 'vitest';
import { TOKEN_2022_PROGRAM_ID } from '../src/wallet-intelligence/constants.js';
import { runWalletIntelligenceHolders } from '../src/wallet-intelligence/engine.js';
import { WalletIntelligenceError } from '../src/wallet-intelligence/errors.js';
import { aggregateOwners, canonicalizeLargestTokenAccounts } from '../src/wallet-intelligence/holders.js';
import { observedTop20ShareBps } from '../src/wallet-intelligence/numbers.js';
import {
  defaultResolvedAccounts,
  fakeWalletIntelligenceProvider,
  largestAccount,
  mintAccountValue,
  ownerAccountValue,
  TOKEN_ACCOUNTS,
  tokenAccountValue,
  WALLET_A,
  WALLET_B,
  WI_MINT,
  WI_SCAN_MS,
} from './wallet-intelligence-fixtures.js';
import { SPL_TOKEN_PROGRAM_ID } from '../src/risk/constants.js';

describe('wallet intelligence holders', () => {
  it('treats a 20-row largest-token response as token accounts, not wallets', async () => {
    const parsedAccounts: Record<string, unknown> = {
      [WI_MINT]: ownerAccountValue(),
    };
    const largest = TOKEN_ACCOUNTS.map((address, index) => {
      parsedAccounts[address] = tokenAccountValue({ owner: WI_MINT, amountRaw: String(20 - index) });
      return largestAccount(address, String(20 - index));
    });
    const result = await runWalletIntelligenceHolders({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({ largest, parsedAccounts }),
    });
    expect(result.holders).toHaveLength(20);
    expect(result.owners).toHaveLength(1);
    expect(result.owners[0]?.top20TokenAccountCountOwned).toBe(20);
  });

  it('treats getTokenLargestAccounts results as token accounts and aggregates the same owner', async () => {
    const result = await runWalletIntelligenceHolders({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        parsedAccounts: defaultResolvedAccounts(),
      }),
    });
    expect(result.holders).toHaveLength(2);
    expect(result.holders[0]?.tokenAccount).toBe(TOKEN_ACCOUNTS[0]);
    expect(result.owners).toHaveLength(1);
    expect(result.owners[0]?.ownerAddress).toBe(WALLET_A);
    expect(result.owners[0]?.observedTop20AggregateRawAmount).toBe('700');
    expect(result.owners[0]?.top20TokenAccountCountOwned).toBe(2);
    expect(result.analyzedOwners).toHaveLength(1);
  });

  it('rejects duplicate token accounts and mint mismatches', async () => {
    expect(() =>
      canonicalizeLargestTokenAccounts([
        largestAccount(TOKEN_ACCOUNTS[0], '1'),
        largestAccount(TOKEN_ACCOUNTS[0], '2'),
      ]),
    ).toThrow(/Duplicate token account/);
    expect(() =>
      canonicalizeLargestTokenAccounts(
        Array.from({ length: 21 }, (_, index) => {
          const address = TOKEN_ACCOUNTS[index % TOKEN_ACCOUNTS.length];
          if (address === undefined) {
            throw new Error('expected a fixture token account');
          }
          return largestAccount(address, String(21 - index));
        }),
      ),
    ).toThrow(/more than 20/);
    await expect(
      runWalletIntelligenceHolders({
        tokenMint: WI_MINT,
        nowMs: WI_SCAN_MS,
        provider: fakeWalletIntelligenceProvider({
          parsedAccounts: defaultResolvedAccounts({
            [TOKEN_ACCOUNTS[0]]: tokenAccountValue({
              mint: TOKEN_ACCOUNTS[3],
              owner: WALLET_A,
              amountRaw: '400',
            }),
          }),
        }),
      }),
    ).rejects.toThrow(/does not match the requested mint/);
  });

  it('rejects malformed amounts, decimals mismatch, and supports BigInt beyond MAX_SAFE_INTEGER', async () => {
    expect(() => canonicalizeLargestTokenAccounts([largestAccount(TOKEN_ACCOUNTS[0], '-1')])).toThrow(
      /non-negative decimal integer string/,
    );
    const huge = '9007199254740993';
    const result = await runWalletIntelligenceHolders({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        largest: [largestAccount(TOKEN_ACCOUNTS[0], huge), largestAccount(TOKEN_ACCOUNTS[1], '1')],
        parsedAccounts: defaultResolvedAccounts({
          [TOKEN_ACCOUNTS[0]]: tokenAccountValue({ owner: WALLET_A, amountRaw: huge }),
          [TOKEN_ACCOUNTS[1]]: tokenAccountValue({ owner: WALLET_B, amountRaw: '1' }),
          [WALLET_B]: ownerAccountValue(),
        }),
      }),
    });
    expect(result.owners[0]?.observedTop20AggregateRawAmount).toBe(huge);
    await expect(
      runWalletIntelligenceHolders({
        tokenMint: WI_MINT,
        nowMs: WI_SCAN_MS,
        provider: fakeWalletIntelligenceProvider({
          largest: [largestAccount(TOKEN_ACCOUNTS[0], '1', 9)],
          parsedAccounts: {
            [TOKEN_ACCOUNTS[0]]: tokenAccountValue({ owner: WALLET_A, amountRaw: '1', decimals: 9 }),
            [WALLET_A]: ownerAccountValue(),
          },
        }),
      }),
    ).rejects.toThrow(/decimals/);
  });

  it('is deterministic from official RPC order and fails if raw amounts increase', async () => {
    const accounts = [
      largestAccount(TOKEN_ACCOUNTS[1], '100'),
      largestAccount(TOKEN_ACCOUNTS[0], '100'),
    ];
    const parsed = {
      [TOKEN_ACCOUNTS[0]]: tokenAccountValue({ owner: WALLET_B, amountRaw: '100' }),
      [TOKEN_ACCOUNTS[1]]: tokenAccountValue({ owner: WALLET_A, amountRaw: '100' }),
      [WALLET_A]: ownerAccountValue(),
      [WALLET_B]: ownerAccountValue(),
    };
    const first = await runWalletIntelligenceHolders({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({ largest: accounts, parsedAccounts: parsed }),
    });
    expect(first.holders.map((item) => item.tokenAccount)).toEqual([TOKEN_ACCOUNTS[1], TOKEN_ACCOUNTS[0]]);
    expect(first.holders[0]?.rank).toBe(1);
    expect(first.holders[1]?.rank).toBe(2);
    await expect(
      runWalletIntelligenceHolders({
        tokenMint: WI_MINT,
        nowMs: WI_SCAN_MS,
        provider: fakeWalletIntelligenceProvider({
          largest: [largestAccount(TOKEN_ACCOUNTS[0], '100'), largestAccount(TOKEN_ACCOUNTS[1], '200')],
          parsedAccounts: parsed,
        }),
      }),
    ).rejects.toThrow(/not in descending official RPC order/);
    const tied = aggregateOwners(first.holders);
    const firstOwner = tied[0]?.ownerAddress;
    const secondOwner = tied[1]?.ownerAddress;
    expect(firstOwner).toEqual(expect.any(String));
    expect(secondOwner).toEqual(expect.any(String));
    expect(firstOwner !== undefined && secondOwner !== undefined && firstOwner < secondOwner).toBe(true);
  });

  it('does not analyze program-owned or executable owners as wallet candidates', async () => {
    const result = await runWalletIntelligenceHolders({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        largest: [largestAccount(TOKEN_ACCOUNTS[0], '500'), largestAccount(TOKEN_ACCOUNTS[1], '50')],
        parsedAccounts: {
          [TOKEN_ACCOUNTS[0]]: tokenAccountValue({ owner: SPL_TOKEN_PROGRAM_ID, amountRaw: '500' }),
          [TOKEN_ACCOUNTS[1]]: tokenAccountValue({ owner: WALLET_A, amountRaw: '50' }),
          [SPL_TOKEN_PROGRAM_ID]: ownerAccountValue({ program: TOKEN_2022_PROGRAM_ID, executable: false }),
          [WALLET_A]: ownerAccountValue(),
        },
      }),
    });
    expect(result.owners[0]?.ownerKind).toBe('PROGRAM_OWNED_OR_EXECUTABLE');
    expect(result.analyzedOwners.map((item) => item.ownerAddress)).toEqual([WALLET_A]);
  });

  it('classifies a missing owner account as ACCOUNT_MISSING and an executable owner as program-like', async () => {
    const result = await runWalletIntelligenceHolders({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        largest: [largestAccount(TOKEN_ACCOUNTS[0], '10'), largestAccount(TOKEN_ACCOUNTS[1], '5')],
        parsedAccounts: {
          [TOKEN_ACCOUNTS[0]]: tokenAccountValue({ owner: WALLET_A, amountRaw: '10' }),
          [TOKEN_ACCOUNTS[1]]: tokenAccountValue({ owner: WALLET_B, amountRaw: '5' }),
          [WALLET_A]: null,
          [WALLET_B]: ownerAccountValue({ executable: true }),
        },
      }),
    });
    expect(result.owners.find((item) => item.ownerAddress === WALLET_A)?.ownerKind).toBe('ACCOUNT_MISSING');
    expect(result.owners.find((item) => item.ownerAddress === WALLET_B)?.ownerKind).toBe(
      'PROGRAM_OWNED_OR_EXECUTABLE',
    );
    expect(result.analyzedOwners).toEqual([]);
  });

  it('handles a zero observed balance total without claiming supply share', async () => {
    const result = await runWalletIntelligenceHolders({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        largest: [largestAccount(TOKEN_ACCOUNTS[0], '0')],
        parsedAccounts: {
          [TOKEN_ACCOUNTS[0]]: tokenAccountValue({ owner: WALLET_A, amountRaw: '0' }),
          [WALLET_A]: ownerAccountValue(),
        },
      }),
    });
    expect(result.owners[0]?.observedTop20BalanceShareBps).toBe(0);
    expect(result.analyzedOwners).toEqual([]);
  });

  it('rejects a program address pretending to be a mint and a wrong genesis', async () => {
    await expect(
      runWalletIntelligenceHolders({
        tokenMint: WI_MINT,
        provider: fakeWalletIntelligenceProvider({
          mintValue: mintAccountValue({ owner: TOKEN_ACCOUNTS[0], type: 'account' }),
        }),
      }),
    ).rejects.toBeInstanceOf(WalletIntelligenceError);
    await expect(
      runWalletIntelligenceHolders({
        tokenMint: WI_MINT,
        provider: fakeWalletIntelligenceProvider({ genesisHash: 'devnet-hash' }),
      }),
    ).rejects.toThrow(/mainnet-beta/);
  });

  it('fail-closes when ranking and resolution amounts or mints disagree, and ignores uiAmount', async () => {
    await expect(
      runWalletIntelligenceHolders({
        tokenMint: WI_MINT,
        nowMs: WI_SCAN_MS,
        provider: fakeWalletIntelligenceProvider({
          parsedAccounts: defaultResolvedAccounts({
            [TOKEN_ACCOUNTS[0]]: tokenAccountValue({ owner: WALLET_A, amountRaw: '399' }),
          }),
        }),
      }),
    ).rejects.toThrow(/does not match getTokenLargestAccounts raw amount/);
    const result = await runWalletIntelligenceHolders({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        parsedAccounts: defaultResolvedAccounts(),
      }),
    });
    expect(result.holderResolutionContextSlot).toBeGreaterThanOrEqual(result.holderContextSlot);
    expect(result.ownerClassificationContextSlot).toBeGreaterThanOrEqual(result.holderResolutionContextSlot);
    expect(observedTop20ShareBps(1n, 3n)).toBe(3333);
    expect(observedTop20ShareBps(2n, 3n)).toBe(6666);
    expect(observedTop20ShareBps(1n, 3n) + observedTop20ShareBps(2n, 3n)).toBe(9999);
  });
});
