import {
  ANALYZED_WALLET_CAP,
  FIRST_OBSERVED_ACTIVITY_LIMIT,
  HISTORY_CONCURRENCY,
  HISTORY_TX_CAP,
  HISTORY_WINDOW_MS,
  SOLANA_MAINNET_GENESIS_HASH,
  WALLET_INTELLIGENCE_SPEC_NAME,
  WALLET_INTELLIGENCE_SPEC_VERSION,
} from './constants.js';
import { assertAnalyzedWalletCap, summarizeCohort } from './cohort.js';
import { projectWalletTokenDeltas } from './deltas.js';
import { WalletIntelligenceError } from './errors.js';
import {
  aggregateOwners,
  assertContextSlotOrdering,
  buildHolderObservations,
  canonicalizeLargestTokenAccounts,
  classifyOwnerAccount,
  parseTokenAccountValue,
  selectAnalyzedOwners,
} from './holders.js';
import {
  classifyObservedAge,
  firstObservedActivityFromTransaction,
  partitionProvenRecentHistory,
} from './history.js';
import {
  WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT,
  historyEvidenceSha256,
  walletIntelligenceScanFingerprint,
  walletProfileFingerprint,
} from './identity.js';
import { parseMintAccountValue, validateCanonicalMintInput } from './mint.js';
import { msToUnixSeconds } from './numbers.js';
import { collectCappedRecentHistory } from './pagination.js';
import { deriveWalletHistoryFeatures, profileWithoutFingerprint } from './profile.js';
import type {
  AggregatedOwner,
  FirstObservedActivityRequest,
  HolderObservation,
  OwnerAccountClassification,
  ParsedTokenAccount,
  WalletIntelligenceProvider,
  WalletIntelligenceScanResult,
  WalletProfile,
  WalletTokenDeltaProjection,
} from './types.js';

export async function runWalletIntelligenceHolders(input: {
  tokenMint: string;
  provider: WalletIntelligenceProvider;
  nowMs?: number;
}): Promise<{
  tokenMint: string;
  tokenProgram: WalletIntelligenceScanResult['tokenProgram'];
  mintDecimals: number;
  scanStartedAtMs: number;
  holderContextSlot: number;
  holderResolutionContextSlot: number;
  ownerClassificationContextSlot: number;
  holders: readonly HolderObservation[];
  owners: readonly AggregatedOwner[];
  analyzedOwners: readonly AggregatedOwner[];
}> {
  const tokenMint = validateCanonicalMintInput(input.tokenMint);
  const scanStartedAtMs = input.nowMs ?? Date.now();
  const identity = await input.provider.verifyMainnetIdentity();
  if (identity.genesisHash !== SOLANA_MAINNET_GENESIS_HASH) {
    throw new WalletIntelligenceError(
      'Connected RPC genesis hash is not official Solana mainnet-beta. Wallet intelligence refuses to continue.',
      { code: 'cluster_mismatch' },
    );
  }
  const mint = parseMintAccountValue((await input.provider.getMintAccount(tokenMint)).value);
  const largest = await input.provider.getTokenLargestAccounts(tokenMint);
  const canonicalLargest = canonicalizeLargestTokenAccounts(largest.accounts);
  for (const account of canonicalLargest) {
    if (account.decimals !== mint.decimals) {
      throw new WalletIntelligenceError('Largest-token-account decimals do not match the mint decimals.', {
        code: 'provider_integrity_failure',
      });
    }
  }
  const resolved = await resolveTokenAccounts({
    provider: input.provider,
    mint: tokenMint,
    decimals: mint.decimals,
    tokenProgramOwner: mint.programOwner,
    largestAccounts: canonicalLargest,
    minContextSlot: largest.contextSlot,
  });
  const classified = await classifyOwners({
    provider: input.provider,
    owners: resolved.accounts.map((account) => account.owner),
    minContextSlot: resolved.contextSlot,
  });
  assertContextSlotOrdering({
    holderContextSlot: largest.contextSlot,
    holderResolutionContextSlot: resolved.contextSlot,
    ownerClassificationContextSlot: classified.contextSlot,
  });
  const holders = buildHolderObservations({
    largestAccounts: canonicalLargest,
    parsedAccounts: resolved.accounts,
    classifications: classified.classifications,
    mintDecimals: mint.decimals,
  });
  const owners = aggregateOwners(holders);
  const analyzedOwners = selectAnalyzedOwners(owners, ANALYZED_WALLET_CAP);
  return {
    tokenMint,
    tokenProgram: mint.tokenProgram,
    mintDecimals: mint.decimals,
    scanStartedAtMs,
    holderContextSlot: largest.contextSlot,
    holderResolutionContextSlot: resolved.contextSlot,
    ownerClassificationContextSlot: classified.contextSlot,
    holders,
    owners,
    analyzedOwners,
  };
}

export async function runWalletIntelligenceScan(input: {
  tokenMint: string;
  provider: WalletIntelligenceProvider;
  nowMs?: number;
}): Promise<WalletIntelligenceScanResult> {
  const holdersResult = await runWalletIntelligenceHolders(input);
  const historyWindowEndMs = holdersResult.scanStartedAtMs;
  const historyWindowStartMs = holdersResult.scanStartedAtMs - HISTORY_WINDOW_MS;
  const profiles = await mapPool(holdersResult.analyzedOwners, HISTORY_CONCURRENCY, async (owner) =>
    profileOwner({
      owner,
      tokenMint: holdersResult.tokenMint,
      provider: input.provider,
      holderContextSlot: holdersResult.holderContextSlot,
      holderResolutionContextSlot: holdersResult.holderResolutionContextSlot,
      ownerClassificationContextSlot: holdersResult.ownerClassificationContextSlot,
      scanStartedAtMs: holdersResult.scanStartedAtMs,
      historyWindowStartMs,
      historyWindowEndMs,
    }),
  );
  assertAnalyzedWalletCap(profiles.length);
  const cohort = summarizeCohort({
    holders: holdersResult.holders,
    owners: holdersResult.owners,
    profiles,
  });
  const specFingerprint = WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT;
  return {
    specVersion: WALLET_INTELLIGENCE_SPEC_VERSION,
    specName: WALLET_INTELLIGENCE_SPEC_NAME,
    specFingerprint,
    tokenMint: holdersResult.tokenMint,
    tokenProgram: holdersResult.tokenProgram,
    mintDecimals: holdersResult.mintDecimals,
    scanStartedAtMs: holdersResult.scanStartedAtMs,
    holderContextSlot: holdersResult.holderContextSlot,
    holderResolutionContextSlot: holdersResult.holderResolutionContextSlot,
    ownerClassificationContextSlot: holdersResult.ownerClassificationContextSlot,
    historyWindowStartMs,
    historyWindowEndMs,
    historyTxCap: HISTORY_TX_CAP,
    holders: holdersResult.holders,
    owners: holdersResult.owners,
    profiles,
    cohort,
    scanFingerprint: walletIntelligenceScanFingerprint({
      specFingerprint,
      tokenMint: holdersResult.tokenMint,
      scanStartedAtMs: holdersResult.scanStartedAtMs,
      holderContextSlot: holdersResult.holderContextSlot,
      holderResolutionContextSlot: holdersResult.holderResolutionContextSlot,
      ownerClassificationContextSlot: holdersResult.ownerClassificationContextSlot,
      holders: holdersResult.holders,
      owners: holdersResult.owners,
      profiles,
      cohort,
    }),
  };
}

async function profileOwner(input: {
  owner: AggregatedOwner;
  tokenMint: string;
  provider: WalletIntelligenceProvider;
  holderContextSlot: number;
  holderResolutionContextSlot: number;
  ownerClassificationContextSlot: number;
  scanStartedAtMs: number;
  historyWindowStartMs: number;
  historyWindowEndMs: number;
}): Promise<WalletProfile> {
  const collected = await collectCappedRecentHistory({
    provider: input.provider,
    walletAddress: input.owner.ownerAddress,
    holderContextSlot: input.holderContextSlot,
    scanStartedAtMs: input.scanStartedAtMs,
    historyWindowStartMs: input.historyWindowStartMs,
    windowStartUnix: msToUnixSeconds(input.historyWindowStartMs),
    windowEndUnix: msToUnixSeconds(input.historyWindowEndMs),
  });
  const { proven, unprovenNullBlockTime } = partitionProvenRecentHistory(collected.retained);
  const projections: WalletTokenDeltaProjection[] = [
    ...proven.map((transaction) =>
      projectWalletTokenDeltas({
        walletAddress: input.owner.ownerAddress,
        signature: transaction.signature,
        slot: transaction.slot,
        transactionIndex: transaction.transactionIndex,
        blockTime: transaction.blockTime,
        preTokenBalances: transaction.preTokenBalances,
        postTokenBalances: transaction.postTokenBalances,
      }),
    ),
    ...unprovenNullBlockTime.map((transaction) =>
      projectWalletTokenDeltas({
        walletAddress: input.owner.ownerAddress,
        signature: transaction.signature,
        slot: transaction.slot,
        transactionIndex: transaction.transactionIndex,
        blockTime: null,
        preTokenBalances: null,
        postTokenBalances: null,
      }),
    ),
  ];
  const firstObservedRequest: FirstObservedActivityRequest = {
    walletAddress: input.owner.ownerAddress,
    transactionDetails: 'signatures',
    sortOrder: 'asc',
    limit: FIRST_OBSERVED_ACTIVITY_LIMIT,
    commitment: 'finalized',
    status: 'succeeded',
    tokenAccounts: 'balanceChanged',
    slotLte: input.holderContextSlot,
  };
  const firstObserved = firstObservedActivityFromTransaction(
    await input.provider.getFirstObservedActivity(firstObservedRequest),
    input.holderContextSlot,
    input.scanStartedAtMs,
  );
  const features = deriveWalletHistoryFeatures({
    targetMint: input.tokenMint,
    projections,
  });
  const evidenceHash = historyEvidenceSha256(projections);
  const profileBase = {
    walletAddress: input.owner.ownerAddress,
    observedTop20AggregateRawAmount: input.owner.observedTop20AggregateRawAmount,
    observedTop20BalanceShareBps: input.owner.observedTop20BalanceShareBps,
    top20TokenAccountCountOwned: input.owner.top20TokenAccountCountOwned,
    bestTop20Rank: input.owner.bestTop20Rank,
    ownerKind: 'SYSTEM_OWNED_NON_EXECUTABLE' as const,
    firstObservedActivitySlot: firstObserved.slot,
    firstObservedActivityAtMs: firstObserved.atMs,
    observedAgeClass: classifyObservedAge(firstObserved.atMs, input.scanStartedAtMs),
    historyWindowStartMs: input.historyWindowStartMs,
    historyWindowEndMs: input.historyWindowEndMs,
    historyTransactionsObserved: proven.length,
    historyCensored: collected.historyCensored,
    activeDaysObserved30d: features.activeDaysObserved30d,
    uniqueMintsWithBalanceChange30d: features.uniqueMintsWithBalanceChange30d,
    uniqueMintsTouched30d: features.uniqueMintsTouched,
    positiveTokenDeltaTxCount30d: features.positiveTokenDeltaTxCount30d,
    negativeTokenDeltaTxCount30d: features.negativeTokenDeltaTxCount30d,
    bidirectionalTokenDeltaTxCount30d: features.bidirectionalTokenDeltaTxCount30d,
    targetMintPositiveDeltaTxCount30d: features.targetMintPositiveDeltaTxCount30d,
    targetMintNegativeDeltaTxCount30d: features.targetMintNegativeDeltaTxCount30d,
    targetMintNetRawDelta30d: features.targetMintNetRawDelta30d,
    incompleteDeltaTxCount30d: features.incompleteDeltaTxCount30d,
  };
  return {
    ...profileBase,
    historyEvidenceSha256: evidenceHash,
    profileFingerprint: walletProfileFingerprint({
      specFingerprint: WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT,
      tokenMint: input.tokenMint,
      scanStartedAtMs: input.scanStartedAtMs,
      holderContextSlot: input.holderContextSlot,
      holderResolutionContextSlot: input.holderResolutionContextSlot,
      ownerClassificationContextSlot: input.ownerClassificationContextSlot,
      walletAddress: input.owner.ownerAddress,
      holderEvidence: {
        observedTop20AggregateRawAmount: input.owner.observedTop20AggregateRawAmount,
        observedTop20BalanceShareBps: input.owner.observedTop20BalanceShareBps,
        top20TokenAccountCountOwned: input.owner.top20TokenAccountCountOwned,
        bestTop20Rank: input.owner.bestTop20Rank,
        ownerKind: input.owner.ownerKind,
      },
      historyEvidenceSha256: evidenceHash,
      profile: profileWithoutFingerprint(profileBase),
    }),
  };
}

async function resolveTokenAccounts(input: {
  provider: WalletIntelligenceProvider;
  mint: string;
  decimals: number;
  tokenProgramOwner: string;
  largestAccounts: readonly { address: string; amountRaw: string; decimals: number }[];
  minContextSlot: number;
}): Promise<{ accounts: ParsedTokenAccount[]; contextSlot: number }> {
  if (input.largestAccounts.length === 0) {
    return { accounts: [], contextSlot: input.minContextSlot };
  }
  const addresses = input.largestAccounts.map((account) => account.address);
  const response = await input.provider.getMultipleParsedAccounts(addresses, {
    minContextSlot: input.minContextSlot,
  });
  const accounts = input.largestAccounts.map((account, index) =>
    parseTokenAccountValue(
      account.address,
      response.values[index] ?? null,
      input.mint,
      input.decimals,
      account.amountRaw,
      input.tokenProgramOwner,
    ),
  );
  return { accounts, contextSlot: response.contextSlot };
}

async function classifyOwners(input: {
  provider: WalletIntelligenceProvider;
  owners: readonly string[];
  minContextSlot: number;
}): Promise<{
  classifications: Map<string, OwnerAccountClassification>;
  contextSlot: number;
}> {
  const unique = [...new Set(input.owners)];
  const classifications = new Map<string, OwnerAccountClassification>();
  if (unique.length === 0) {
    return { classifications, contextSlot: input.minContextSlot };
  }
  const response = await input.provider.getMultipleParsedAccounts(unique, {
    minContextSlot: input.minContextSlot,
  });
  unique.forEach((address, index) => {
    classifications.set(address, classifyOwnerAccount(address, response.values[index] ?? null));
  });
  return { classifications, contextSlot: response.contextSlot };
}

async function mapPool<T, R>(items: readonly T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const results: Array<R | undefined> = Array.from({ length: items.length });
  let next = 0;
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        const item = items[index];
        if (item === undefined) {
          return;
        }
        results[index] = await mapper(item);
      }
    }),
  );
  return results.map((value, index) => {
    if (value === undefined) {
      throw new WalletIntelligenceError(`Wallet-intelligence worker omitted result ${String(index)}.`, {
        code: 'wallet_intelligence_failed',
      });
    }
    return value;
  });
}
