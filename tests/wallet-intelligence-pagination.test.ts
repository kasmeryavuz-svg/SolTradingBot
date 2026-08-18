import { describe, expect, it } from 'vitest';
import { HISTORY_TX_CAP, HISTORY_WINDOW_MS } from '../src/wallet-intelligence/constants.js';
import { collectCappedRecentHistory } from '../src/wallet-intelligence/pagination.js';
import { WalletIntelligenceError } from '../src/wallet-intelligence/errors.js';
import {
  fakeWalletIntelligenceProvider,
  historyTx,
  WALLET_A,
  WI_HOLDER_SLOT,
  WI_SCAN_MS,
  type FakeWalletIntelligenceStats,
} from './wallet-intelligence-fixtures.js';
import type { RecentHistoryPageRequest, WalletHistoryTransaction } from '../src/wallet-intelligence/types.js';

function tx(index: number, extra: Partial<WalletHistoryTransaction> = {}): WalletHistoryTransaction {
  return historyTx({
    signature: `sig-${String(index).padStart(3, '0')}`,
    slot: 4000 - index,
    transactionIndex: 10,
    blockTime: Math.floor(WI_SCAN_MS / 1000),
    ...extra,
  });
}

async function collect(
  rows: readonly WalletHistoryTransaction[],
  pager?: (request: RecentHistoryPageRequest) => {
    transactions: readonly WalletHistoryTransaction[];
    paginationToken: string | null;
  },
) {
  const stats: FakeWalletIntelligenceStats = {
    historyPageRequests: [],
    firstObservedRequests: [],
    multipleAccountCalls: [],
    maxHistoryInFlight: 0,
    currentHistoryInFlight: 0,
  };
  const provider = fakeWalletIntelligenceProvider({
    recentHistory: { [WALLET_A]: rows },
    ...(pager === undefined ? {} : { historyPager: pager }),
    stats,
  });
  const result = await collectCappedRecentHistory({
    provider,
    walletAddress: WALLET_A,
    holderContextSlot: WI_HOLDER_SLOT,
    scanStartedAtMs: WI_SCAN_MS,
    historyWindowStartMs: WI_SCAN_MS - HISTORY_WINDOW_MS,
    windowStartUnix: Math.floor((WI_SCAN_MS - HISTORY_WINDOW_MS) / 1000),
    windowEndUnix: Math.floor(WI_SCAN_MS / 1000),
  });
  return { ...result, stats };
}

describe('wallet intelligence recent-history pagination', () => {
  it('covers the hostile censor matrix without requesting full limit above 100', async () => {
    const zero = await collect([]);
    expect(zero.retained).toHaveLength(0);
    expect(zero.historyCensored).toBe(false);
    expect(zero.requests).toBe(1);

    const ninetyNine = await collect(Array.from({ length: 99 }, (_, index) => tx(index)));
    expect(ninetyNine.retained).toHaveLength(99);
    expect(ninetyNine.historyCensored).toBe(false);
    expect(ninetyNine.requests).toBe(1);

    const hundredNoToken = await collect(Array.from({ length: 100 }, (_, index) => tx(index)));
    expect(hundredNoToken.retained).toHaveLength(100);
    expect(hundredNoToken.historyCensored).toBe(false);
    expect(hundredNoToken.requests).toBe(1);

    const hundredPlusOne = await collect(Array.from({ length: 101 }, (_, index) => tx(index)));
    expect(hundredPlusOne.retained).toHaveLength(101);
    expect(hundredPlusOne.historyCensored).toBe(false);
    expect(hundredPlusOne.requests).toBe(2);

    const twoHundred = await collect(Array.from({ length: 200 }, (_, index) => tx(index)));
    expect(twoHundred.retained).toHaveLength(200);
    expect(twoHundred.historyCensored).toBe(false);
    expect(twoHundred.requests).toBe(2);

    const probeEmpty = await collect(Array.from({ length: 200 }, (_, index) => tx(index)), (request) => {
      if (request.paginationToken === null) {
        return { transactions: Array.from({ length: 100 }, (_, index) => tx(index)), paginationToken: 'page-2' };
      }
      if (request.paginationToken === 'page-2') {
        return { transactions: Array.from({ length: 100 }, (_, index) => tx(index + 100)), paginationToken: 'page-3' };
      }
      expect(request.limit).toBe(1);
      return { transactions: [], paginationToken: null };
    });
    expect(probeEmpty.retained).toHaveLength(200);
    expect(probeEmpty.historyCensored).toBe(false);
    expect(probeEmpty.requests).toBe(3);

    const censored = await collect(Array.from({ length: 201 }, (_, index) => tx(index)));
    expect(censored.retained).toHaveLength(HISTORY_TX_CAP);
    expect(censored.historyCensored).toBe(true);
    expect(censored.requests).toBe(3);
    expect(censored.pageRequests.every((request) => request.limit <= 100)).toBe(true);
    expect(censored.pageRequests[2]?.limit).toBe(1);
  });

  it('keeps semantic filters invariant and only changes paginationToken and page limit', async () => {
    const result = await collect(Array.from({ length: 201 }, (_, index) => tx(index)));
    const [page1, page2, page3] = result.pageRequests;
    expect(page1).toBeDefined();
    expect(page2).toBeDefined();
    expect(page3).toBeDefined();
    if (page1 === undefined || page2 === undefined || page3 === undefined) {
      throw new Error('expected three page requests');
    }
    for (const page of [page2, page3]) {
      expect(page.walletAddress).toBe(page1.walletAddress);
      expect(page.transactionDetails).toBe('full');
      expect(page.encoding).toBe('jsonParsed');
      expect(page.maxSupportedTransactionVersion).toBe(0);
      expect(page.sortOrder).toBe('desc');
      expect(page.commitment).toBe('finalized');
      expect(page.status).toBe('succeeded');
      expect(page.tokenAccounts).toBe('balanceChanged');
      expect(page.blockTimeGte).toBe(page1.blockTimeGte);
      expect(page.blockTimeLte).toBe(page1.blockTimeLte);
      expect(page.slotLte).toBe(page1.slotLte);
    }
    expect(page1.paginationToken).toBeNull();
    expect(page1.limit).toBe(100);
    expect(page2.paginationToken).toBe('100');
    expect(page2.limit).toBe(100);
    expect(page3.paginationToken).toBe('200');
    expect(page3.limit).toBe(1);
    expect(page3.paginationToken).not.toBe(page2.paginationToken);
  });

  it('fails closed on repeated pagination tokens, malformed tokens, and over-limit pages', async () => {
    await expect(
      collect([], (request) => {
        if (request.paginationToken === null) {
          return { transactions: Array.from({ length: 100 }, (_, index) => tx(index)), paginationToken: 'same' };
        }
        return { transactions: Array.from({ length: 100 }, (_, index) => tx(index + 100)), paginationToken: 'same' };
      }),
    ).rejects.toThrow(/repeated a pagination token/);

    await expect(
      collect([], () => ({ transactions: Array.from({ length: 100 }, (_, index) => tx(index)), paginationToken: '  bad  ' })),
    ).rejects.toBeInstanceOf(WalletIntelligenceError);

    await expect(
      collect([], () => ({
        transactions: Array.from({ length: 101 }, (_, index) => tx(index)),
        paginationToken: null,
      })),
    ).rejects.toThrow(/more history rows than the requested page limit/);
  });

  it('deduplicates identical signature evidence and fails on conflicting duplicates', async () => {
    const first = tx(0);
    const identical = tx(0);
    const result = await collect([], (request) => {
      if (request.paginationToken === null) {
        return { transactions: Array.from({ length: 100 }, (_, index) => (index === 0 ? first : tx(index))), paginationToken: 'next' };
      }
      return {
        transactions: [identical, ...Array.from({ length: 1 }, () => tx(200))],
        paginationToken: null,
      };
    });
    expect(result.retained.filter((item) => item.signature === first.signature)).toHaveLength(1);

    await expect(
      collect([], (request) => {
        if (request.paginationToken === null) {
          return { transactions: Array.from({ length: 100 }, (_, index) => tx(index)), paginationToken: 'next' };
        }
        return { transactions: [tx(0, { slot: 1 })], paginationToken: null };
      }),
    ).rejects.toThrow(/conflicting history evidence/);
  });

  it('sorts by slot desc, transactionIndex desc, then signature, not response array order', async () => {
    const result = await collect([
      historyTx({ signature: 'b', slot: 9, transactionIndex: 1, blockTime: Math.floor(WI_SCAN_MS / 1000) }),
      historyTx({ signature: 'a', slot: 9, transactionIndex: 2, blockTime: Math.floor(WI_SCAN_MS / 1000) }),
      historyTx({ signature: 'c', slot: 8, transactionIndex: 9, blockTime: Math.floor(WI_SCAN_MS / 1000) }),
    ]);
    expect(result.retained.map((item) => item.signature)).toEqual(['a', 'b', 'c']);
  });
});
