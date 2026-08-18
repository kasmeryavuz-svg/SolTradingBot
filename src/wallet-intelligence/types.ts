import type {
  OBSERVED_AGE_CLASSES,
  OWNER_KINDS,
  TOKEN_DELTA_KINDS,
  WALLET_INTELLIGENCE_SPEC_NAME,
  WALLET_INTELLIGENCE_SPEC_VERSION,
} from './constants.js';

export type OwnerKind = (typeof OWNER_KINDS)[number];
export type ObservedAgeClass = (typeof OBSERVED_AGE_CLASSES)[number];
export type TokenDeltaKind = (typeof TOKEN_DELTA_KINDS)[number];

export type TokenProgramKind = 'spl_token' | 'token_2022';

export type ParsedMintAccount = {
  tokenProgram: TokenProgramKind;
  programOwner: string;
  decimals: number;
  initialized: true;
};

export type LargestTokenAccount = {
  address: string;
  amountRaw: string;
  decimals: number;
};

export type ParsedTokenAccount = {
  tokenAccount: string;
  mint: string;
  owner: string;
  amountRaw: string;
  decimals: number;
  state: string;
  tokenProgramOwner: string;
};

export type OwnerAccountClassification = {
  address: string;
  ownerKind: OwnerKind;
  ownerAccountProgram: string | null;
  ownerExecutable: boolean | null;
};

export type HolderObservation = {
  rank: number;
  tokenAccount: string;
  amountRaw: string;
  decimals: number;
  ownerAddress: string | null;
  ownerKind: OwnerKind;
  ownerAccountProgram: string | null;
  ownerExecutable: boolean | null;
};

export type AggregatedOwner = {
  ownerAddress: string;
  ownerKind: OwnerKind;
  ownerAccountProgram: string | null;
  ownerExecutable: boolean | null;
  observedTop20AggregateRawAmount: string;
  observedTop20BalanceShareBps: number;
  top20TokenAccountCountOwned: number;
  bestTop20Rank: number;
};

export type TokenBalanceEvidence = {
  accountIndex: number;
  mint: string;
  owner: string | null;
  programId: string | null;
  amountRaw: string;
  decimals: number;
};

export type WalletHistoryTransaction = {
  signature: string;
  slot: number;
  transactionIndex: number;
  blockTime: number | null;
  err: unknown;
  preTokenBalances: readonly TokenBalanceEvidence[] | null;
  postTokenBalances: readonly TokenBalanceEvidence[] | null;
};

export type MintRawDelta = {
  mint: string;
  netRawDelta: string;
};

export type WalletTokenDeltaProjection = {
  signature: string;
  slot: number;
  transactionIndex: number;
  blockTime: number | null;
  kind: TokenDeltaKind;
  mintDeltas: readonly MintRawDelta[];
  incomplete: boolean;
};

export type FirstObservedActivity = {
  slot: number | null;
  blockTime: number | null;
  atMs: number | null;
};

export type WalletProfile = {
  walletAddress: string;
  observedTop20AggregateRawAmount: string;
  observedTop20BalanceShareBps: number;
  top20TokenAccountCountOwned: number;
  bestTop20Rank: number;
  ownerKind: 'SYSTEM_OWNED_NON_EXECUTABLE';
  firstObservedActivitySlot: number | null;
  firstObservedActivityAtMs: number | null;
  observedAgeClass: ObservedAgeClass;
  historyWindowStartMs: number;
  historyWindowEndMs: number;
  historyTransactionsObserved: number;
  historyCensored: boolean;
  activeDaysObserved30d: number;
  uniqueMintsWithBalanceChange30d: number;
  uniqueMintsTouched30d: readonly string[];
  positiveTokenDeltaTxCount30d: number;
  negativeTokenDeltaTxCount30d: number;
  bidirectionalTokenDeltaTxCount30d: number;
  targetMintPositiveDeltaTxCount30d: number;
  targetMintNegativeDeltaTxCount30d: number;
  targetMintNetRawDelta30d: string;
  incompleteDeltaTxCount30d: number;
  historyEvidenceSha256: string;
  profileFingerprint: string;
};

export type CohortSummary = {
  topTokenAccountsObserved: number;
  uniqueOwnersObserved: number;
  systemWalletCandidatesObserved: number;
  programOrExecutableOwnersObserved: number;
  unknownOwnersObserved: number;
  analyzedWalletCount: number;
  historyCensoredWalletCount: number;
  observedFresh7dCount: number;
  observedYoung30dCount: number;
  observedEstablished30dPlusCount: number;
  observedAgeUnknownCount: number;
  observedFresh7dFractionBps: number;
  observedYoung30dFractionBps: number;
  programOrExecutableObservedTop20BalanceBps: number;
  unknownObservedTop20BalanceBps: number;
  medianObservedHistoryTxCount30d: number | null;
  medianActiveDaysObserved30d: number | null;
  medianUniqueMintsTouched30d: number | null;
};

export type WalletIntelligenceScanResult = {
  specVersion: typeof WALLET_INTELLIGENCE_SPEC_VERSION;
  specName: typeof WALLET_INTELLIGENCE_SPEC_NAME;
  specFingerprint: string;
  tokenMint: string;
  tokenProgram: TokenProgramKind;
  mintDecimals: number;
  scanStartedAtMs: number;
  holderContextSlot: number;
  holderResolutionContextSlot: number;
  ownerClassificationContextSlot: number;
  historyWindowStartMs: number;
  historyWindowEndMs: number;
  historyTxCap: number;
  holders: readonly HolderObservation[];
  owners: readonly AggregatedOwner[];
  profiles: readonly WalletProfile[];
  cohort: CohortSummary;
  scanFingerprint: string;
};

export type StoredWalletIntelligenceScan = WalletIntelligenceScanResult & {
  id: number;
  createdAtMs: number;
};

export type RecentHistoryFilterSnapshot = {
  walletAddress: string;
  transactionDetails: 'full';
  encoding: 'jsonParsed';
  maxSupportedTransactionVersion: 0;
  sortOrder: 'desc';
  commitment: 'finalized';
  status: 'succeeded';
  tokenAccounts: 'balanceChanged';
  blockTimeGte: number;
  blockTimeLte: number;
  slotLte: number;
};

export type RecentHistoryPageRequest = RecentHistoryFilterSnapshot & {
  limit: number;
  paginationToken: string | null;
};

export type RecentHistoryPageResult = {
  transactions: readonly WalletHistoryTransaction[];
  paginationToken: string | null;
};

export type FirstObservedActivityRequest = {
  walletAddress: string;
  transactionDetails: 'signatures';
  sortOrder: 'asc';
  limit: 1;
  commitment: 'finalized';
  status: 'succeeded';
  tokenAccounts: 'balanceChanged';
  slotLte: number;
};

export type GetMultipleAccountsOptions = {
  minContextSlot: number;
};

export type WalletIntelligenceProvider = {
  verifyMainnetIdentity(): Promise<{ genesisHash: string }>;
  getMintAccount(tokenMint: string): Promise<{ contextSlot: number; value: unknown }>;
  getTokenLargestAccounts(tokenMint: string): Promise<{
    contextSlot: number;
    accounts: readonly LargestTokenAccount[];
  }>;
  getMultipleParsedAccounts(
    addresses: readonly string[],
    options: GetMultipleAccountsOptions,
  ): Promise<{
    contextSlot: number;
    values: readonly unknown[];
  }>;
  getRecentWalletHistoryPage(request: RecentHistoryPageRequest): Promise<RecentHistoryPageResult>;
  getFirstObservedActivity(request: FirstObservedActivityRequest): Promise<WalletHistoryTransaction | null>;
};

export type WalletIntelligenceFetchInit = {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
  redirect: 'error';
};

export type WalletIntelligenceFetchLike = (
  url: string,
  init: WalletIntelligenceFetchInit,
) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export type PersistHooks = {
  afterScanInsert?: (scanId: number) => void;
  afterHolderInsert?: (index: number, scanId: number) => void;
  afterProfileInsert?: (index: number, scanId: number) => void;
};
