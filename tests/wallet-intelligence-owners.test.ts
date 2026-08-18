import { describe, expect, it } from 'vitest';
import { ANALYZED_WALLET_CAP } from '../src/wallet-intelligence/constants.js';
import { compareAggregatedOwners, selectAnalyzedOwners } from '../src/wallet-intelligence/holders.js';
import type { AggregatedOwner } from '../src/wallet-intelligence/types.js';
import { WALLET_A, WALLET_B, WALLET_C, TOKEN_ACCOUNTS } from './wallet-intelligence-fixtures.js';

function owner(overrides: Partial<AggregatedOwner> & { ownerAddress: string }): AggregatedOwner {
  return {
    ownerKind: 'SYSTEM_OWNED_NON_EXECUTABLE',
    ownerAccountProgram: '11111111111111111111111111111111',
    ownerExecutable: false,
    observedTop20AggregateRawAmount: '1',
    observedTop20BalanceShareBps: 1,
    top20TokenAccountCountOwned: 1,
    bestTop20Rank: 1,
    ...overrides,
  };
}

describe('wallet intelligence owners', () => {
  it('selects only system-owned non-executable owners using the frozen ordering', () => {
    const owners: AggregatedOwner[] = [
      owner({
        ownerAddress: WALLET_A,
        ownerKind: 'PROGRAM_OWNED_OR_EXECUTABLE',
        observedTop20AggregateRawAmount: '999',
      }),
      owner({ ownerAddress: WALLET_C, observedTop20AggregateRawAmount: '50', bestTop20Rank: 3 }),
      owner({ ownerAddress: WALLET_B, observedTop20AggregateRawAmount: '50', bestTop20Rank: 2 }),
      owner({ ownerAddress: TOKEN_ACCOUNTS[13], observedTop20AggregateRawAmount: '0', bestTop20Rank: 1 }),
    ];
    const selected = selectAnalyzedOwners(owners, ANALYZED_WALLET_CAP);
    expect(selected.map((item) => item.ownerAddress)).toEqual([WALLET_B, WALLET_C]);
    const first = selected[0];
    const second = selected[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) {
      throw new Error('expected two analyzed owners');
    }
    expect(compareAggregatedOwners(first, second)).toBeLessThan(0);
  });
});
