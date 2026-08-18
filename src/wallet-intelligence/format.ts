import { formatCapabilityFooter } from '../persistence/format.js';
import {
  ANALYZED_WALLET_CAP,
  HISTORY_TX_CAP,
  HISTORY_WINDOW_MS,
  OBSERVED_FRESH_MS,
  OBSERVED_YOUNG_MS,
  REQUIRED_SCHEMA_VERSION,
  TOP_TOKEN_ACCOUNT_LIMIT,
  WALLET_INTELLIGENCE_CHECKPOINT,
  WALLET_INTELLIGENCE_SPEC_NAME,
  WALLET_INTELLIGENCE_SPEC_VERSION,
} from './constants.js';
import { WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT } from './identity.js';
import type {
  AggregatedOwner,
  HolderObservation,
  StoredWalletIntelligenceScan,
  WalletIntelligenceScanResult,
  WalletProfile,
} from './types.js';

export function formatWalletIntelligenceStatusLines(): string[] {
  return [
    'WALLET INTELLIGENCE',
    `Checkpoint ${WALLET_INTELLIGENCE_CHECKPOINT}`,
    `Spec: ${WALLET_INTELLIGENCE_SPEC_VERSION}`,
    `Name: ${WALLET_INTELLIGENCE_SPEC_NAME}`,
    `Fingerprint: ${WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT}`,
    `Schema expectation: ${String(REQUIRED_SCHEMA_VERSION)}`,
    `Top token account observation limit: ${String(TOP_TOKEN_ACCOUNT_LIMIT)}`,
    `Analysis wallet cap: ${String(ANALYZED_WALLET_CAP)}`,
    `History window: ${String(HISTORY_WINDOW_MS / (24 * 60 * 60 * 1000))}d`,
    `History tx cap: ${String(HISTORY_TX_CAP)}`,
    'Recent history pagination: page1 limit 100, optional page2 limit 100, optional page3 probe limit 1',
    `Freshness: ${String(OBSERVED_FRESH_MS / (24 * 60 * 60 * 1000))}d / ${String(OBSERVED_YOUNG_MS / (24 * 60 * 60 * 1000))}d`,
    'Provider: Helius getTransactionsForAddress + Solana RPC semantics',
    'Signing: NONE',
    'Execution: NONE',
    'Copy trading: NONE',
    'This is public on-chain holder-cohort evidence. It is not identity, PnL, or a trade signal.',
    '',
    ...formatCapabilityFooter(),
  ];
}

export function formatWalletIntelligenceHoldersLines(input: {
  tokenMint: string;
  tokenProgram: string;
  mintDecimals: number;
  scanStartedAtMs: number;
  holderContextSlot: number;
  holderResolutionContextSlot: number;
  ownerClassificationContextSlot: number;
  holders: readonly HolderObservation[];
  owners: readonly AggregatedOwner[];
  analyzedOwners: readonly AggregatedOwner[];
}): string[] {
  const lines = [
    'WALLET INTELLIGENCE — TOP OBSERVED TOKEN ACCOUNTS',
    `Mint: ${input.tokenMint}`,
    `Token program: ${input.tokenProgram}`,
    `Mint decimals: ${String(input.mintDecimals)}`,
    `Scan started at ms: ${String(input.scanStartedAtMs)}`,
    `Holder context slot: ${String(input.holderContextSlot)}`,
    `Holder resolution context slot: ${String(input.holderResolutionContextSlot)}`,
    `Owner classification context slot: ${String(input.ownerClassificationContextSlot)}`,
    'Largest-account ranking observed at holderContextSlot.',
    'Owner-resolution evidence observed at holderResolutionContextSlot.',
    'Owner classification observed at ownerClassificationContextSlot.',
    'These are later finalized observations, not one mathematically atomic historical RPC snapshot.',
    'wi18 fail-closes if token-account amount, mint, or decimals changed between ranking and resolution.',
    '',
    `Top ${String(input.holders.length)} observed token accounts (not wallets)`,
  ];
  for (const holder of input.holders) {
    lines.push(
      `  #${String(holder.rank)} tokenAccount=${holder.tokenAccount} amountRaw=${holder.amountRaw} owner=${holder.ownerAddress ?? 'n/a'} kind=${holder.ownerKind}`,
    );
  }
  lines.push('');
  lines.push('Aggregated owners inside the observed top-20 token-account set');
  lines.push('observedTop20AggregateRawAmount is not necessarily the owner’s complete balance.');
  for (const owner of input.owners) {
    lines.push(
      `  ${owner.ownerAddress} kind=${owner.ownerKind} aggregateRaw=${owner.observedTop20AggregateRawAmount} shareBps=${String(owner.observedTop20BalanceShareBps)} accounts=${String(owner.top20TokenAccountCountOwned)} bestRank=${String(owner.bestTop20Rank)}`,
    );
  }
  lines.push('');
  lines.push('System-owned non-executable wallet candidates selected for history (max 10)');
  if (input.analyzedOwners.length === 0) {
    lines.push('  none');
  }
  for (const owner of input.analyzedOwners) {
    lines.push(`  ${owner.ownerAddress}`);
  }
  lines.push('');
  lines.push('No wallet-history provider was called. No SQLite write.');
  lines.push('');
  lines.push(...formatCapabilityFooter());
  return lines;
}

export function formatWalletIntelligenceScanLines(
  scan: WalletIntelligenceScanResult,
  options: { persistedId?: number } = {},
): string[] {
  const lines = [
    'WALLET INTELLIGENCE REPORT',
    `Spec: ${scan.specVersion}`,
    `Name: ${scan.specName}`,
    `Spec fingerprint: ${scan.specFingerprint}`,
    `Scan fingerprint: ${scan.scanFingerprint}`,
    `Mint: ${scan.tokenMint}`,
    `Token program: ${scan.tokenProgram}`,
    `Scan started at ms: ${String(scan.scanStartedAtMs)}`,
    `Holder context slot: ${String(scan.holderContextSlot)}`,
    `Holder resolution context slot: ${String(scan.holderResolutionContextSlot)}`,
    `Owner classification context slot: ${String(scan.ownerClassificationContextSlot)}`,
    'Largest-account ranking observed at holderContextSlot.',
    'Owner-resolution evidence observed at holderResolutionContextSlot.',
    'Owner classification observed at ownerClassificationContextSlot.',
    'These are later finalized observations, not one mathematically atomic historical RPC snapshot.',
    'wi18 fail-closes if token-account amount, mint, or decimals changed between ranking and resolution.',
    `History window ms: ${String(scan.historyWindowStartMs)} .. ${String(scan.historyWindowEndMs)}`,
    '',
    'Cohort summary (observed top-20 token-account set, not total supply)',
    `topTokenAccountsObserved: ${String(scan.cohort.topTokenAccountsObserved)}`,
    `uniqueOwnersObserved: ${String(scan.cohort.uniqueOwnersObserved)}`,
    `systemWalletCandidatesObserved: ${String(scan.cohort.systemWalletCandidatesObserved)}`,
    `programOrExecutableOwnersObserved: ${String(scan.cohort.programOrExecutableOwnersObserved)}`,
    `unknownOwnersObserved: ${String(scan.cohort.unknownOwnersObserved)}`,
    `analyzedWalletCount: ${String(scan.cohort.analyzedWalletCount)}`,
    `historyCensoredWalletCount: ${String(scan.cohort.historyCensoredWalletCount)}`,
    `observedFresh7dCount: ${String(scan.cohort.observedFresh7dCount)}`,
    `observedYoung30dCount: ${String(scan.cohort.observedYoung30dCount)}`,
    `observedEstablished30dPlusCount: ${String(scan.cohort.observedEstablished30dPlusCount)}`,
    `observedAgeUnknownCount: ${String(scan.cohort.observedAgeUnknownCount)}`,
    `observedFresh7dFractionBps: ${String(scan.cohort.observedFresh7dFractionBps)}`,
    `observedYoung30dFractionBps: ${String(scan.cohort.observedYoung30dFractionBps)}`,
    `programOrExecutableObservedTop20BalanceBps: ${String(scan.cohort.programOrExecutableObservedTop20BalanceBps)}`,
    `unknownObservedTop20BalanceBps: ${String(scan.cohort.unknownObservedTop20BalanceBps)}`,
    `medianObservedHistoryTxCount30d: ${formatMedian(scan.cohort.medianObservedHistoryTxCount30d)}`,
    `medianActiveDaysObserved30d: ${formatMedian(scan.cohort.medianActiveDaysObserved30d)}`,
    `medianUniqueMintsTouched30d: ${formatMedian(scan.cohort.medianUniqueMintsTouched30d)}`,
    '',
    'Censored wallet counts remain visible. Transaction counts are observed/capped lower-bound evidence, not exact population totals.',
    'firstObservedActivity may be later than true first wallet activity. It is never wallet creation and never a guaranteed first chain transaction.',
    '',
    'Analyzed wallet-candidate profiles',
  ];
  if (scan.profiles.length === 0) {
    lines.push('  none');
  }
  for (const profile of scan.profiles) {
    lines.push(...formatProfileLines(profile));
  }
  lines.push('');
  lines.push('These features are factual public-chain observations.');
  lines.push('They are not a whale score, smart-money score, identity, or profit claim.');
  lines.push('positive_token_delta is not BUY. negative_token_delta is not SELL. bidirectional_token_change is not a guaranteed swap.');
  lines.push('observed age is first observed activity under the configured provider/history semantics, not wallet creation time.');
  if (options.persistedId !== undefined) {
    lines.push('');
    lines.push(`Persisted scan id: ${String(options.persistedId)}`);
  }
  lines.push('');
  lines.push(...formatCapabilityFooter());
  return lines;
}

export function formatWalletIntelligenceHistoryLines(
  tokenMint: string,
  scans: readonly StoredWalletIntelligenceScan[],
): string[] {
  const lines = [
    'WALLET INTELLIGENCE HISTORY',
    `Mint: ${tokenMint}`,
    `Scans: ${String(scans.length)}`,
    '',
  ];
  if (scans.length === 0) {
    lines.push('No wallet-intelligence scans found for this mint.');
  }
  for (const scan of scans) {
    lines.push(
      `id=${String(scan.id)} createdAtMs=${String(scan.createdAtMs)} slot=${String(scan.holderContextSlot)} fingerprint=${scan.scanFingerprint} analyzed=${String(scan.cohort.analyzedWalletCount)} censoredWallets=${String(scan.cohort.historyCensoredWalletCount)}`,
    );
  }
  lines.push('');
  lines.push(...formatCapabilityFooter());
  return lines;
}

function formatProfileLines(profile: WalletProfile): string[] {
  const txCount = profile.historyCensored
    ? `at least ${String(profile.historyTransactionsObserved)} observed within the capped query`
    : String(profile.historyTransactionsObserved);
  return [
    `  walletAddress: ${profile.walletAddress}`,
    `    observedTop20AggregateRawAmount: ${profile.observedTop20AggregateRawAmount}`,
    `    observedTop20BalanceShareBps: ${String(profile.observedTop20BalanceShareBps)}`,
    `    top20TokenAccountCountOwned: ${String(profile.top20TokenAccountCountOwned)}`,
    `    bestTop20Rank: ${String(profile.bestTop20Rank)}`,
    `    ownerKind: ${profile.ownerKind} (wallet candidate, not a guaranteed human)`,
    `    firstObservedActivitySlot: ${profile.firstObservedActivitySlot === null ? 'n/a' : String(profile.firstObservedActivitySlot)}`,
    `    firstObservedActivityAtMs: ${profile.firstObservedActivityAtMs === null ? 'n/a' : String(profile.firstObservedActivityAtMs)}`,
    `    observedAgeClass: ${profile.observedAgeClass}`,
    `    historyTransactionsObserved: ${txCount}`,
    `    historyCensored: ${profile.historyCensored ? 'true' : 'false'}`,
    `    activeDaysObserved30d: ${String(profile.activeDaysObserved30d)}`,
    `    uniqueMintsWithBalanceChange30d: ${String(profile.uniqueMintsWithBalanceChange30d)}`,
    `    positiveTokenDeltaTxCount30d: ${String(profile.positiveTokenDeltaTxCount30d)}`,
    `    negativeTokenDeltaTxCount30d: ${String(profile.negativeTokenDeltaTxCount30d)}`,
    `    bidirectionalTokenDeltaTxCount30d: ${String(profile.bidirectionalTokenDeltaTxCount30d)}`,
    `    targetMintPositiveDeltaTxCount30d: ${String(profile.targetMintPositiveDeltaTxCount30d)}`,
    `    targetMintNegativeDeltaTxCount30d: ${String(profile.targetMintNegativeDeltaTxCount30d)}`,
    `    targetMintNetRawDelta30d: ${profile.targetMintNetRawDelta30d}`,
    `    incompleteDeltaTxCount30d: ${String(profile.incompleteDeltaTxCount30d)}`,
    `    historyEvidenceSha256: ${profile.historyEvidenceSha256}`,
    `    profileFingerprint: ${profile.profileFingerprint}`,
  ];
}

function formatMedian(value: number | null): string {
  return value === null ? 'n/a' : String(value);
}
