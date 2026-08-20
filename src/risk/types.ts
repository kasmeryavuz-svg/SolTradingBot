export class RiskScanError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RiskScanError';
  }
}

/** A provider could not obtain the RPC response; callers may retry safely. */
export class RiskProviderUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RiskProviderUnavailableError';
  }
}

export const RISK_CHECK_NAMES = ['mint_account', 'supply', 'largest_accounts'] as const;
export const RISK_FINDING_CATEGORIES = [
  'authority',
  'token_extension',
  'concentration',
  'data_quality',
] as const;
export const RISK_FINDING_SEVERITIES = ['info', 'medium', 'high', 'critical'] as const;
export const HIGHEST_FINDING_SEVERITIES = ['none', 'info', 'medium', 'high', 'critical'] as const;
export const RISK_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export const TOKEN_PROGRAMS = ['spl_token', 'token_2022'] as const;
export const DATA_COMPLETENESS_VALUES = ['complete', 'partial'] as const;

export type RiskCheckName = (typeof RISK_CHECK_NAMES)[number];
export type RiskFindingCategory = (typeof RISK_FINDING_CATEGORIES)[number];
export type RiskFindingSeverity = (typeof RISK_FINDING_SEVERITIES)[number];
export type HighestFindingSeverity = (typeof HIGHEST_FINDING_SEVERITIES)[number];
export type RiskConfidence = (typeof RISK_CONFIDENCE_LEVELS)[number];
export type TokenProgramKind = (typeof TOKEN_PROGRAMS)[number];
export type DataCompleteness = (typeof DATA_COMPLETENESS_VALUES)[number];
export type RiskCommitment = 'confirmed' | 'finalized';

export type RiskFinding = {
  code: string;
  category: RiskFindingCategory;
  severity: RiskFindingSeverity;
  confidence: RiskConfidence;
  title: string;
  description: string;
};

export type RiskCheckResult = {
  check: RiskCheckName;
  ok: boolean;
  contextSlot: number | null;
  error: string | null;
};

export type TokenExtensionObservation = {
  name: string;
  rawName: string;
  authority: string | null;
  programId: string | null;
  state: string | null;
  transferFeeBasisPoints: number | null;
  maximumFeeRaw: string | null;
  olderTransferFeeBasisPoints: number | null;
  newerTransferFeeBasisPoints: number | null;
  olderMaximumFeeRaw: string | null;
  newerMaximumFeeRaw: string | null;
  parsed: boolean;
  classified: boolean;
};

export type LargestTokenAccountObservation = {
  rank: number;
  tokenAccount: string;
  amountRaw: string;
  shareBps: number | null;
};

export type TokenAccountConcentration = {
  top1Bps: number;
  top5Bps: number;
  top10Bps: number;
  top20Bps: number;
  observedAccountsCount: number;
};

export type TokenRiskReport = {
  chain: 'solana';
  tokenMint: string;
  scannedAt: string;
  commitment: RiskCommitment;
  tokenProgram: TokenProgramKind;
  programOwner: string;
  mintContextSlot: number;
  supplyContextSlot: number | null;
  largestAccountsContextSlot: number | null;
  decimals: number;
  supplyRaw: string | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  extensions: TokenExtensionObservation[];
  largestTokenAccounts: LargestTokenAccountObservation[];
  concentration: TokenAccountConcentration | null;
  concentrationUnavailableReason: string | null;
  checks: RiskCheckResult[];
  findings: RiskFinding[];
  dataCompleteness: DataCompleteness;
  highestFindingSeverity: HighestFindingSeverity;
};

export type TokenRiskFacts = {
  mintAuthority: string | null;
  freezeAuthority: string | null;
  extensions: readonly TokenExtensionObservation[];
  concentration: TokenAccountConcentration | null;
  concentrationUnavailableReason: string | null;
};
