import { describe, expect, it } from 'vitest';
import { summarizeCohort } from '../src/wallet-intelligence/cohort.js';
import { formatWalletIntelligenceScanLines } from '../src/wallet-intelligence/format.js';
import type { WalletIntelligenceScanResult, WalletProfile } from '../src/wallet-intelligence/types.js';
import { WALLET_A, WALLET_B, WI_MINT, WI_SCAN_MS } from './wallet-intelligence-fixtures.js';

function profile(overrides: Partial<WalletProfile> & { walletAddress: string }): WalletProfile {
  return {
    observedTop20AggregateRawAmount: '1',
    observedTop20BalanceShareBps: 1,
    top20TokenAccountCountOwned: 1,
    bestTop20Rank: 1,
    ownerKind: 'SYSTEM_OWNED_NON_EXECUTABLE',
    firstObservedActivitySlot: 1,
    firstObservedActivityAtMs: WI_SCAN_MS,
    observedAgeClass: 'OBSERVED_FRESH_7D',
    historyWindowStartMs: 0,
    historyWindowEndMs: WI_SCAN_MS,
    historyTransactionsObserved: 200,
    historyCensored: true,
    activeDaysObserved30d: 3,
    uniqueMintsWithBalanceChange30d: 2,
    uniqueMintsTouched30d: [WI_MINT],
    positiveTokenDeltaTxCount30d: 1,
    negativeTokenDeltaTxCount30d: 0,
    bidirectionalTokenDeltaTxCount30d: 0,
    targetMintPositiveDeltaTxCount30d: 1,
    targetMintNegativeDeltaTxCount30d: 0,
    targetMintNetRawDelta30d: '1',
    incompleteDeltaTxCount30d: 0,
    historyEvidenceSha256: 'a'.repeat(64),
    profileFingerprint: 'b'.repeat(64),
    ...overrides,
  };
}

describe('wallet intelligence cohort', () => {
  it('keeps censored wallet counts visible and labels capped transaction counts', () => {
    const cohort = summarizeCohort({
      holders: [
        {
          rank: 1,
          tokenAccount: WALLET_A,
          amountRaw: '10',
          decimals: 6,
          ownerAddress: WALLET_A,
          ownerKind: 'SYSTEM_OWNED_NON_EXECUTABLE',
          ownerAccountProgram: '11111111111111111111111111111111',
          ownerExecutable: false,
        },
      ],
      owners: [
        {
          ownerAddress: WALLET_A,
          ownerKind: 'SYSTEM_OWNED_NON_EXECUTABLE',
          ownerAccountProgram: '11111111111111111111111111111111',
          ownerExecutable: false,
          observedTop20AggregateRawAmount: '10',
          observedTop20BalanceShareBps: 10000,
          top20TokenAccountCountOwned: 1,
          bestTop20Rank: 1,
        },
      ],
      profiles: [
        profile({ walletAddress: WALLET_A, historyCensored: true, historyTransactionsObserved: 200 }),
        profile({
          walletAddress: WALLET_B,
          historyCensored: false,
          historyTransactionsObserved: 10,
          observedAgeClass: 'OBSERVED_ESTABLISHED_30D_PLUS',
        }),
      ],
    });
    expect(cohort.historyCensoredWalletCount).toBe(1);
    expect(cohort.medianObservedHistoryTxCount30d).toBe(105);
    const scan = {
      specVersion: 'wi18_v1',
      specName: 'public_onchain_holder_cohort_intelligence',
      specFingerprint: 'c'.repeat(64),
      tokenMint: WI_MINT,
      tokenProgram: 'spl_token',
      mintDecimals: 6,
      scanStartedAtMs: WI_SCAN_MS,
      holderContextSlot: 1,
      holderResolutionContextSlot: 1,
      ownerClassificationContextSlot: 1,
      historyWindowStartMs: 0,
      historyWindowEndMs: WI_SCAN_MS,
      historyTxCap: 200,
      holders: [],
      owners: [],
      profiles: [profile({ walletAddress: WALLET_A })],
      cohort,
      scanFingerprint: 'd'.repeat(64),
    } satisfies WalletIntelligenceScanResult;
    const text = formatWalletIntelligenceScanLines(scan).join('\n');
    expect(text).toContain('historyCensoredWalletCount: 1');
    expect(text).toContain('at least 200 observed within the capped query');
    expect(text).not.toMatch(/wallet made exactly 200 transactions/i);
  });
});
