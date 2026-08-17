import { FINDING_CODES } from '../risk/constants.js';
import type { RiskFinding, RiskFindingSeverity, TokenRiskReport } from '../risk/types.js';
import type { FeatureName } from './definitions.js';
import { availableBoolean, availableInteger, secondsBetween, unavailable } from './numbers.js';
import { FeatureEngineError, type FeatureValue, type RiskFeatureInput } from './types.js';

const FINDING_FEATURES: readonly { name: FeatureName; code: string }[] = [
  { name: 'risk_finding_mint_authority_active', code: FINDING_CODES.MINT_AUTHORITY_ACTIVE },
  { name: 'risk_finding_freeze_authority_active', code: FINDING_CODES.FREEZE_AUTHORITY_ACTIVE },
  { name: 'risk_finding_permanent_delegate_active', code: FINDING_CODES.PERMANENT_DELEGATE_ACTIVE },
  { name: 'risk_finding_non_transferable', code: FINDING_CODES.NON_TRANSFERABLE_TOKEN },
  { name: 'risk_finding_transfer_hook_active', code: FINDING_CODES.TRANSFER_HOOK_ACTIVE },
  { name: 'risk_finding_default_account_state_frozen', code: FINDING_CODES.DEFAULT_ACCOUNT_STATE_FROZEN },
  { name: 'risk_finding_transfer_fee_configured', code: FINDING_CODES.TRANSFER_FEE_CONFIGURED },
];

const CONCENTRATION_FEATURES: readonly {
  name: FeatureName;
  key: 'top1Bps' | 'top5Bps' | 'top10Bps' | 'top20Bps';
}[] = [
  { name: 'risk_top1_token_account_concentration_bps', key: 'top1Bps' },
  { name: 'risk_top5_token_account_concentration_bps', key: 'top5Bps' },
  { name: 'risk_top10_token_account_concentration_bps', key: 'top10Bps' },
  { name: 'risk_top20_token_account_concentration_bps', key: 'top20Bps' },
];

export const RISK_REPORT_UNAVAILABLE_REASON = 'risk_report_unavailable';
export const CONCENTRATION_UNAVAILABLE_REASON = 'token_account_concentration_unavailable';

/**
 * Live Checkpoint 06 adapter. Picks only the facts c06_v1 risk features use.
 * Extra TokenRiskReport parser fields are ignored, not copied into history.
 */
export function riskFeatureInputFromReport(report: TokenRiskReport): RiskFeatureInput {
  return {
    tokenMint: report.tokenMint,
    scannedAt: report.scannedAt,
    tokenProgram: report.tokenProgram,
    dataCompleteness: report.dataCompleteness,
    findings: report.findings,
    concentration: report.concentration,
  };
}

export function riskDerivedFeatures(risk: TokenRiskReport | null, asOf: string): FeatureValue[] {
  return riskDerivedFeaturesFromFacts(risk === null ? null : riskFeatureInputFromReport(risk), asOf);
}

/**
 * Single c06_v1 risk-derived feature implementation.
 * Live TokenRiskReport values and historical SQLite projections both enter here.
 */
export function riskDerivedFeaturesFromFacts(risk: RiskFeatureInput | null, asOf: string): FeatureValue[] {
  if (risk === null) {
    return unavailableRiskFeatures(RISK_REPORT_UNAVAILABLE_REASON);
  }

  const codes = new Set(risk.findings.map((finding) => finding.code));
  const values: FeatureValue[] = [
    availableBoolean('risk_data_complete', risk.dataCompleteness === 'complete'),
    availableBoolean('risk_token_2022', risk.tokenProgram === 'token_2022'),
  ];

  for (const feature of FINDING_FEATURES) {
    values.push(availableBoolean(feature.name, codes.has(feature.code)));
  }

  if (risk.concentration === null) {
    for (const feature of CONCENTRATION_FEATURES) {
      values.push(unavailable(feature.name, CONCENTRATION_UNAVAILABLE_REASON));
    }
  } else {
    for (const feature of CONCENTRATION_FEATURES) {
      values.push(availableInteger(feature.name, risk.concentration[feature.key]));
    }
  }

  values.push(availableInteger('risk_finding_count', risk.findings.length));
  values.push(availableInteger('risk_critical_finding_count', countSeverity(risk.findings, 'critical')));
  values.push(availableInteger('risk_high_finding_count', countSeverity(risk.findings, 'high')));
  values.push(availableInteger('risk_medium_finding_count', countSeverity(risk.findings, 'medium')));
  values.push(availableInteger('risk_info_finding_count', countSeverity(risk.findings, 'info')));
  const riskAge = secondsBetween(asOf, risk.scannedAt, 'risk_age_seconds');
  if (riskAge < 0) {
    throw new FeatureEngineError('risk_age_seconds must not be negative.');
  }
  values.push(availableInteger('risk_age_seconds', riskAge));
  return values;
}

function unavailableRiskFeatures(reason: string): FeatureValue[] {
  return [
    unavailable('risk_data_complete', reason),
    unavailable('risk_token_2022', reason),
    ...FINDING_FEATURES.map((feature) => unavailable(feature.name, reason)),
    ...CONCENTRATION_FEATURES.map((feature) => unavailable(feature.name, reason)),
    unavailable('risk_finding_count', reason),
    unavailable('risk_critical_finding_count', reason),
    unavailable('risk_high_finding_count', reason),
    unavailable('risk_medium_finding_count', reason),
    unavailable('risk_info_finding_count', reason),
    unavailable('risk_age_seconds', reason),
  ];
}

function countSeverity(findings: readonly RiskFinding[], severity: RiskFindingSeverity): number {
  return findings.filter((finding) => finding.severity === severity).length;
}
