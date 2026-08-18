import { createHash } from 'node:crypto';
import { WALLET_INTELLIGENCE_SPEC_VERSION } from './constants.js';
import { canonicalWalletIntelligenceDefinition, type CanonicalWalletIntelligenceDefinition } from './definition.js';
import type {
  AggregatedOwner,
  CohortSummary,
  HolderObservation,
  WalletProfile,
  WalletTokenDeltaProjection,
} from './types.js';

export function fingerprintWalletIntelligenceDefinition(
  definition: CanonicalWalletIntelligenceDefinition = canonicalWalletIntelligenceDefinition(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export const WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT = fingerprintWalletIntelligenceDefinition();

export function historyEvidenceSha256(projections: readonly WalletTokenDeltaProjection[]): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        projections.map((item) => ({
          signature: item.signature,
          slot: item.slot,
          transactionIndex: item.transactionIndex,
          blockTime: item.blockTime,
          kind: item.kind,
          incomplete: item.incomplete,
          mintDeltas: item.mintDeltas,
        })),
      ),
      'utf8',
    )
    .digest('hex');
}

export function walletProfileFingerprint(input: {
  specFingerprint: string;
  tokenMint: string;
  scanStartedAtMs: number;
  holderContextSlot: number;
  holderResolutionContextSlot: number;
  ownerClassificationContextSlot: number;
  walletAddress: string;
  holderEvidence: {
    observedTop20AggregateRawAmount: string;
    observedTop20BalanceShareBps: number;
    top20TokenAccountCountOwned: number;
    bestTop20Rank: number;
    ownerKind: string;
  };
  historyEvidenceSha256: string;
  profile: Omit<WalletProfile, 'profileFingerprint' | 'historyEvidenceSha256'>;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        specVersion: WALLET_INTELLIGENCE_SPEC_VERSION,
        specFingerprint: input.specFingerprint,
        tokenMint: input.tokenMint,
        scanStartedAtMs: input.scanStartedAtMs,
        holderContextSlot: input.holderContextSlot,
        holderResolutionContextSlot: input.holderResolutionContextSlot,
        ownerClassificationContextSlot: input.ownerClassificationContextSlot,
        walletAddress: input.walletAddress,
        holderEvidence: input.holderEvidence,
        historyEvidenceSha256: input.historyEvidenceSha256,
        profile: input.profile,
      }),
      'utf8',
    )
    .digest('hex');
}

export function walletIntelligenceScanFingerprint(input: {
  specFingerprint: string;
  tokenMint: string;
  scanStartedAtMs: number;
  holderContextSlot: number;
  holderResolutionContextSlot: number;
  ownerClassificationContextSlot: number;
  holders: readonly HolderObservation[];
  owners: readonly AggregatedOwner[];
  profiles: readonly WalletProfile[];
  cohort: CohortSummary;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        specVersion: WALLET_INTELLIGENCE_SPEC_VERSION,
        specFingerprint: input.specFingerprint,
        tokenMint: input.tokenMint,
        scanStartedAtMs: input.scanStartedAtMs,
        holderContextSlot: input.holderContextSlot,
        holderResolutionContextSlot: input.holderResolutionContextSlot,
        ownerClassificationContextSlot: input.ownerClassificationContextSlot,
        holders: input.holders,
        owners: input.owners,
        profiles: input.profiles.map((profile) => ({
          walletAddress: profile.walletAddress,
          profileFingerprint: profile.profileFingerprint,
          historyEvidenceSha256: profile.historyEvidenceSha256,
          observedTop20AggregateRawAmount: profile.observedTop20AggregateRawAmount,
          observedAgeClass: profile.observedAgeClass,
          historyCensored: profile.historyCensored,
          historyTransactionsObserved: profile.historyTransactionsObserved,
          targetMintNetRawDelta30d: profile.targetMintNetRawDelta30d,
        })),
        cohort: input.cohort,
      }),
      'utf8',
    )
    .digest('hex');
}
