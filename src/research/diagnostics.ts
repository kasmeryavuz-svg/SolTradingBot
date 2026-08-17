/**
 * Test/debug gate diagnostics. Not a CLI, not an optimizer, not a ranking score.
 */
import type { FeatureVector } from '../features/types.js';
import {
  evaluateCommonMarketRiskGate,
  decisionFromResearchRules,
} from './candidates/common.js';
import { evaluateResearchCandidate } from './evaluator.js';
import { reconstructPointInTimeVector } from './timeline.js';
import type {
  ResearchCandidateId,
  ResearchDataset,
  ResearchRuleEvidence,
} from './types.js';

export const COMMON_GATE_RULE_CODES = [
  'PRICE_POSITIVE',
  'LIQUIDITY_MINIMUM',
  'PAIR_AGE_RANGE',
  'MARKET_FRESHNESS',
  'TRADES_5M_MINIMUM',
  'RISK_BLOCKER_risk_finding_mint_authority_active',
  'RISK_BLOCKER_risk_finding_freeze_authority_active',
  'RISK_BLOCKER_risk_finding_permanent_delegate_active',
  'RISK_BLOCKER_risk_finding_non_transferable',
  'RISK_BLOCKER_risk_finding_transfer_hook_active',
  'RISK_BLOCKER_risk_finding_default_account_state_frozen',
  'RISK_BLOCKER_risk_finding_transfer_fee_configured',
] as const;

export type ResearchDecisionDiagnostic = {
  candidateId: ResearchCandidateId;
  evaluatedSnapshotCount: number;
  entryCandidateCount: number;
  noEntryCount: number;
  insufficientDataCount: number;
  commonGateFullPassCount: number;
  failPrice: number;
  failLiquidity: number;
  failPairAge: number;
  failMarketFreshness: number;
  failTrades5m: number;
  unavailableRequiredRisk: number;
  blockingRiskTrue: number;
  candidateSpecificFail: number;
  candidateSpecificUnavailable: number;
};

export function summarizeResearchDecisionDiagnostics(
  dataset: ResearchDataset,
  candidateId: ResearchCandidateId,
): ResearchDecisionDiagnostic {
  const counts: ResearchDecisionDiagnostic = {
    candidateId,
    evaluatedSnapshotCount: 0,
    entryCandidateCount: 0,
    noEntryCount: 0,
    insufficientDataCount: 0,
    commonGateFullPassCount: 0,
    failPrice: 0,
    failLiquidity: 0,
    failPairAge: 0,
    failMarketFreshness: 0,
    failTrades5m: 0,
    unavailableRequiredRisk: 0,
    blockingRiskTrue: 0,
    candidateSpecificFail: 0,
    candidateSpecificUnavailable: 0,
  };

  for (const snapshot of dataset.marketSnapshots) {
    const vector = reconstructPointInTimeVector({
      snapshot,
      researchMarketSnapshots: dataset.marketSnapshots,
      riskReports: dataset.riskReports,
    });
    const evaluation = evaluateResearchCandidate(candidateId, vector);
    counts.evaluatedSnapshotCount += 1;
    if (evaluation.decision === 'entry_candidate') {
      counts.entryCandidateCount += 1;
    } else if (evaluation.decision === 'no_entry') {
      counts.noEntryCount += 1;
    } else {
      counts.insufficientDataCount += 1;
    }

    const common = evaluateCommonMarketRiskGate(vector);
    if (decisionFromResearchRules(common) === 'entry_candidate') {
      counts.commonGateFullPassCount += 1;
    }
    addCommonCounts(counts, common);
    addCandidateSpecificCounts(counts, common, evaluation.rules);
  }

  return counts;
}

export function inspectReconstructedRules(
  dataset: ResearchDataset,
  candidateId: ResearchCandidateId,
  snapshotIndex: number,
): {
  decision: string;
  rules: readonly ResearchRuleEvidence[];
  vector: FeatureVector;
} {
  const snapshot = dataset.marketSnapshots[snapshotIndex];
  if (snapshot === undefined) {
    throw new Error(`No research snapshot at index ${String(snapshotIndex)}.`);
  }
  const vector = reconstructPointInTimeVector({
    snapshot,
    researchMarketSnapshots: dataset.marketSnapshots,
    riskReports: dataset.riskReports,
  });
  const evaluation = evaluateResearchCandidate(candidateId, vector);
  return { decision: evaluation.decision, rules: evaluation.rules, vector };
}

function addCommonCounts(
  counts: ResearchDecisionDiagnostic,
  common: readonly ResearchRuleEvidence[],
): void {
  if (statusOf(common, 'PRICE_POSITIVE') === 'fail') {
    counts.failPrice += 1;
  }
  if (statusOf(common, 'LIQUIDITY_MINIMUM') === 'fail') {
    counts.failLiquidity += 1;
  }
  if (statusOf(common, 'PAIR_AGE_RANGE') === 'fail') {
    counts.failPairAge += 1;
  }
  if (statusOf(common, 'MARKET_FRESHNESS') === 'fail') {
    counts.failMarketFreshness += 1;
  }
  if (statusOf(common, 'TRADES_5M_MINIMUM') === 'fail') {
    counts.failTrades5m += 1;
  }
  if (common.some((rule) => rule.code.startsWith('RISK_BLOCKER_') && rule.status === 'unavailable')) {
    counts.unavailableRequiredRisk += 1;
  }
  if (common.some((rule) => rule.code.startsWith('RISK_BLOCKER_') && rule.status === 'fail')) {
    counts.blockingRiskTrue += 1;
  }
}

function statusOf(rules: readonly ResearchRuleEvidence[], code: string): ResearchRuleEvidence['status'] | null {
  return rules.find((rule) => rule.code === code)?.status ?? null;
}

function addCandidateSpecificCounts(
  counts: ResearchDecisionDiagnostic,
  common: readonly ResearchRuleEvidence[],
  allRules: readonly ResearchRuleEvidence[],
): void {
  const commonCodes = new Set(common.map((rule) => rule.code));
  for (const rule of allRules) {
    if (commonCodes.has(rule.code)) {
      continue;
    }
    if (rule.status === 'fail') {
      counts.candidateSpecificFail += 1;
    }
    if (rule.status === 'unavailable') {
      counts.candidateSpecificUnavailable += 1;
    }
  }
}
