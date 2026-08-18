import {
  HISTORY_CENSOR_PROBE_LIMIT,
  HISTORY_FULL_PAGE_LIMIT,
  HISTORY_MAX_INSPECTED,
  HISTORY_MAX_RECENT_PAGES,
  HISTORY_TX_CAP,
} from './constants.js';
import { WalletIntelligenceError } from './errors.js';
import { fenceHistoryTransactions, sortHistoryNewestFirst } from './history.js';
import { parsePaginationToken } from './pagination-token.js';
import type {
  RecentHistoryFilterSnapshot,
  RecentHistoryPageRequest,
  WalletHistoryTransaction,
  WalletIntelligenceProvider,
} from './types.js';

export function canonicalRecentHistoryFilters(input: {
  walletAddress: string;
  holderContextSlot: number;
  windowStartUnix: number;
  windowEndUnix: number;
}): RecentHistoryFilterSnapshot {
  return {
    walletAddress: input.walletAddress,
    transactionDetails: 'full',
    encoding: 'jsonParsed',
    maxSupportedTransactionVersion: 0,
    sortOrder: 'desc',
    commitment: 'finalized',
    status: 'succeeded',
    tokenAccounts: 'balanceChanged',
    blockTimeGte: input.windowStartUnix,
    blockTimeLte: input.windowEndUnix,
    slotLte: input.holderContextSlot,
  };
}

export function assertRecentHistoryFilterInvariance(
  canonical: RecentHistoryFilterSnapshot,
  request: RecentHistoryPageRequest,
): void {
  const keys: (keyof RecentHistoryFilterSnapshot)[] = [
    'walletAddress',
    'transactionDetails',
    'encoding',
    'maxSupportedTransactionVersion',
    'sortOrder',
    'commitment',
    'status',
    'tokenAccounts',
    'blockTimeGte',
    'blockTimeLte',
    'slotLte',
  ];
  for (const key of keys) {
    if (canonical[key] !== request[key]) {
      throw new WalletIntelligenceError(
        'Recent-history pagination changed a semantic filter across pages. Provider integrity failure.',
        { code: 'provider_integrity_failure' },
      );
    }
  }
  if (request.limit > HISTORY_FULL_PAGE_LIMIT) {
    throw new WalletIntelligenceError(
      `Refusing a full-history request with limit ${String(request.limit)}. Maximum full-page limit is ${String(HISTORY_FULL_PAGE_LIMIT)}.`,
      { code: 'provider_integrity_failure' },
    );
  }
  if (request.limit !== HISTORY_FULL_PAGE_LIMIT && request.limit !== HISTORY_CENSOR_PROBE_LIMIT) {
    throw new WalletIntelligenceError(
      'Recent-history page limit must be 100 or the 1-row censor probe.',
      { code: 'provider_integrity_failure' },
    );
  }
}

export function canonicalTransactionEvidence(transaction: WalletHistoryTransaction): string {
  return JSON.stringify({
    signature: transaction.signature,
    slot: transaction.slot,
    transactionIndex: transaction.transactionIndex,
    blockTime: transaction.blockTime,
    err: transaction.err ?? null,
    preTokenBalances: transaction.preTokenBalances,
    postTokenBalances: transaction.postTokenBalances,
  });
}

export function deduplicateHistoryTransactions(
  transactions: readonly WalletHistoryTransaction[],
): WalletHistoryTransaction[] {
  const bySignature = new Map<string, WalletHistoryTransaction>();
  for (const transaction of transactions) {
    const existing = bySignature.get(transaction.signature);
    if (existing === undefined) {
      bySignature.set(transaction.signature, transaction);
      continue;
    }
    if (canonicalTransactionEvidence(existing) !== canonicalTransactionEvidence(transaction)) {
      throw new WalletIntelligenceError(
        'Duplicate transaction signature carried conflicting history evidence. Provider integrity failure.',
        { code: 'provider_integrity_failure' },
      );
    }
  }
  return [...bySignature.values()];
}

export async function collectCappedRecentHistory(input: {
  provider: WalletIntelligenceProvider;
  walletAddress: string;
  holderContextSlot: number;
  scanStartedAtMs: number;
  historyWindowStartMs: number;
  windowStartUnix: number;
  windowEndUnix: number;
}): Promise<{
  retained: WalletHistoryTransaction[];
  historyCensored: boolean;
  requests: number;
  pageRequests: RecentHistoryPageRequest[];
}> {
  const canonical = canonicalRecentHistoryFilters({
    walletAddress: input.walletAddress,
    holderContextSlot: input.holderContextSlot,
    windowStartUnix: input.windowStartUnix,
    windowEndUnix: input.windowEndUnix,
  });
  const pageRequests: RecentHistoryPageRequest[] = [];
  const inspected: WalletHistoryTransaction[] = [];
  const seenTokens: string[] = [];
  let historyCensored = false;
  let totalInspected = 0;

  const page1 = await fetchHistoryPage({
    provider: input.provider,
    canonical,
    limit: HISTORY_FULL_PAGE_LIMIT,
    paginationToken: null,
    seenTokens,
    pageRequests,
  });
  inspected.push(...page1.transactions);
  totalInspected += page1.transactions.length;

  if (page1.paginationToken !== null && inspected.length < HISTORY_TX_CAP) {
    const page2 = await fetchHistoryPage({
      provider: input.provider,
      canonical,
      limit: HISTORY_FULL_PAGE_LIMIT,
      paginationToken: page1.paginationToken,
      seenTokens,
      pageRequests,
    });
    inspected.push(...page2.transactions);
    totalInspected += page2.transactions.length;
    if (page2.paginationToken !== null && inspected.length >= HISTORY_TX_CAP) {
      const probe = await fetchHistoryPage({
        provider: input.provider,
        canonical,
        limit: HISTORY_CENSOR_PROBE_LIMIT,
        paginationToken: page2.paginationToken,
        seenTokens,
        pageRequests,
      });
      totalInspected += probe.transactions.length;
      historyCensored = probe.transactions.length >= 1;
    }
  }

  if (pageRequests.length > HISTORY_MAX_RECENT_PAGES) {
    throw new WalletIntelligenceError(
      'Recent-history pagination exceeded three requests for one wallet.',
      { code: 'provider_integrity_failure' },
    );
  }
  if (totalInspected > HISTORY_MAX_INSPECTED) {
    throw new WalletIntelligenceError(
      'Recent-history pagination inspected more than 201 rows.',
      { code: 'provider_integrity_failure' },
    );
  }

  const unique = deduplicateHistoryTransactions(inspected);
  const fenced = fenceHistoryTransactions({
    transactions: unique,
    holderContextSlot: input.holderContextSlot,
    scanStartedAtMs: input.scanStartedAtMs,
    windowStartMs: input.historyWindowStartMs,
  });
  const retained = sortHistoryNewestFirst(fenced).slice(0, HISTORY_TX_CAP);
  return {
    retained,
    historyCensored,
    requests: pageRequests.length,
    pageRequests,
  };
}

async function fetchHistoryPage(input: {
  provider: WalletIntelligenceProvider;
  canonical: RecentHistoryFilterSnapshot;
  limit: number;
  paginationToken: string | null;
  seenTokens: string[];
  pageRequests: RecentHistoryPageRequest[];
}): Promise<{ transactions: readonly WalletHistoryTransaction[]; paginationToken: string | null }> {
  const request: RecentHistoryPageRequest = {
    ...input.canonical,
    limit: input.limit,
    paginationToken: input.paginationToken,
  };
  assertRecentHistoryFilterInvariance(input.canonical, request);
  if (input.pageRequests.length >= HISTORY_MAX_RECENT_PAGES) {
    throw new WalletIntelligenceError(
      'Recent-history pagination exceeded three requests for one wallet.',
      { code: 'provider_integrity_failure' },
    );
  }
  input.pageRequests.push(request);
  const page = await input.provider.getRecentWalletHistoryPage(request);
  if (page.transactions.length > request.limit) {
    throw new WalletIntelligenceError(
      'Provider returned more history rows than the requested page limit.',
      { code: 'provider_integrity_failure' },
    );
  }
  const nextToken =
    page.paginationToken === null
      ? null
      : parsePaginationToken(page.paginationToken, input.seenTokens);
  if (nextToken !== null) {
    input.seenTokens.push(nextToken);
  }
  return { transactions: page.transactions, paginationToken: nextToken };
}
