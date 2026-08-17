import {
  CONCENTRATION_ELEVATED_TOP1_BPS,
  CONCENTRATION_ELEVATED_TOP5_BPS,
  CONCENTRATION_VERY_HIGH_TOP1_BPS,
  FINDING_CODES,
} from './constants.js';
import {
  hasPauseAuthority,
  isDefaultAccountStateFrozen,
  isMintCloseAuthority,
  isNonTransferable,
  isPausablePaused,
  isPermanentDelegateActive,
  isTransferFeeConfigured,
  isTransferHookActive,
} from './extensions.js';
import { formatBasisPoints } from './numbers.js';
import type {
  HighestFindingSeverity,
  RiskFinding,
  RiskFindingSeverity,
  TokenRiskFacts,
} from './types.js';

const SEVERITY_RANK: Readonly<Record<RiskFindingSeverity, number>> = {
  info: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function evaluateTokenRisk(facts: TokenRiskFacts): RiskFinding[] {
  const findings = new Map<string, RiskFinding>();

  addFinding(findings, mintAuthorityFinding(facts.mintAuthority));
  addFinding(findings, freezeAuthorityFinding(facts.freezeAuthority));

  for (const extension of facts.extensions) {
    addFinding(findings, permanentDelegateFinding(extension));
    addFinding(findings, nonTransferableFinding(extension));
    addFinding(findings, transferHookFinding(extension));
    addFinding(findings, defaultAccountStateFinding(extension));
    addFinding(findings, transferFeeFinding(extension));
    addFinding(findings, mintCloseAuthorityFinding(extension));
    addFinding(findings, pausablePausedFinding(extension));
    addFinding(findings, pauseAuthorityFinding(extension));
  }

  addFinding(findings, unclassifiedExtensionFinding(facts.extensions));
  addFinding(findings, concentrationFinding(facts));
  addFinding(findings, concentrationInconsistencyFinding(facts.concentrationUnavailableReason));

  return [...findings.values()].sort((left, right) => {
    const severityOrder = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
    return severityOrder !== 0 ? severityOrder : left.code.localeCompare(right.code);
  });
}

export function highestFindingSeverity(findings: readonly RiskFinding[]): HighestFindingSeverity {
  let highest: HighestFindingSeverity = 'none';
  for (const finding of findings) {
    if (highest === 'none' || SEVERITY_RANK[finding.severity] > SEVERITY_RANK[highest]) {
      highest = finding.severity;
    }
  }

  return highest;
}

function addFinding(findings: Map<string, RiskFinding>, finding: RiskFinding | null): void {
  if (finding !== null && !findings.has(finding.code)) {
    findings.set(finding.code, finding);
  }
}

function mintAuthorityFinding(mintAuthority: string | null): RiskFinding | null {
  if (mintAuthority === null) {
    return null;
  }

  return {
    code: FINDING_CODES.MINT_AUTHORITY_ACTIVE,
    category: 'authority',
    severity: 'high',
    confidence: 'high',
    title: 'Mint authority is active',
    description:
      `There is currently a mint authority (${mintAuthority}) capable of minting additional supply.`,
  };
}

function freezeAuthorityFinding(freezeAuthority: string | null): RiskFinding | null {
  if (freezeAuthority === null) {
    return null;
  }

  return {
    code: FINDING_CODES.FREEZE_AUTHORITY_ACTIVE,
    category: 'authority',
    severity: 'high',
    confidence: 'high',
    title: 'Freeze authority is active',
    description:
      `There is currently a freeze authority (${freezeAuthority}) that can freeze token accounts of this mint.`,
  };
}

function permanentDelegateFinding(
  extension: TokenRiskFacts['extensions'][number],
): RiskFinding | null {
  if (!isPermanentDelegateActive(extension) || extension.authority === null) {
    return null;
  }

  return {
    code: FINDING_CODES.PERMANENT_DELEGATE_ACTIVE,
    category: 'token_extension',
    severity: 'critical',
    confidence: 'high',
    title: 'Permanent delegate is active',
    description:
      `A permanent delegate (${extension.authority}) is a mint-level authority capable of authorizing transfers or burns for token accounts of this mint.`,
  };
}

function nonTransferableFinding(
  extension: TokenRiskFacts['extensions'][number],
): RiskFinding | null {
  if (!isNonTransferable(extension)) {
    return null;
  }

  return {
    code: FINDING_CODES.NON_TRANSFERABLE_TOKEN,
    category: 'token_extension',
    severity: 'critical',
    confidence: 'high',
    title: 'Token is non-transferable',
    description:
      'Normal token transfers between token accounts are disabled for this mint. This is a trading-compatibility constraint, not proof of intent.',
  };
}

function transferHookFinding(extension: TokenRiskFacts['extensions'][number]): RiskFinding | null {
  if (!isTransferHookActive(extension) || extension.programId === null) {
    return null;
  }

  return {
    code: FINDING_CODES.TRANSFER_HOOK_ACTIVE,
    category: 'token_extension',
    severity: 'high',
    confidence: 'high',
    title: 'Transfer hook is active',
    description:
      `Custom program logic (${extension.programId}) is invoked as part of transfers. This scan does not execute or judge that program.`,
  };
}

function defaultAccountStateFinding(
  extension: TokenRiskFacts['extensions'][number],
): RiskFinding | null {
  if (!isDefaultAccountStateFrozen(extension)) {
    return null;
  }

  return {
    code: FINDING_CODES.DEFAULT_ACCOUNT_STATE_FROZEN,
    category: 'token_extension',
    severity: 'high',
    confidence: 'high',
    title: 'New token accounts start frozen',
    description:
      'New token accounts for this mint start frozen until they are appropriately thawed.',
  };
}

function transferFeeFinding(extension: TokenRiskFacts['extensions'][number]): RiskFinding | null {
  if (!isTransferFeeConfigured(extension)) {
    return null;
  }

  return {
    code: FINDING_CODES.TRANSFER_FEE_CONFIGURED,
    category: 'token_extension',
    severity: 'medium',
    confidence: 'high',
    title: 'Transfer fee is configured',
    description:
      'A TransferFeeConfig extension is present with one or more non-zero configured or scheduled fee schedules. This scan does not determine which schedule is currently effective because epoch information is not collected.',
  };
}

function mintCloseAuthorityFinding(
  extension: TokenRiskFacts['extensions'][number],
): RiskFinding | null {
  if (!isMintCloseAuthority(extension)) {
    return null;
  }

  const authorityText =
    extension.authority === null ? 'an observed close authority' : `close authority ${extension.authority}`;

  return {
    code: FINDING_CODES.MINT_CLOSE_AUTHORITY_PRESENT,
    category: 'token_extension',
    severity: 'info',
    confidence: 'high',
    title: 'Mint close authority is present',
    description:
      `A MintCloseAuthority extension is present (${authorityText}). This does not by itself mean the mint can be closed while circulating supply exists.`,
  };
}

function pausablePausedFinding(
  extension: TokenRiskFacts['extensions'][number],
): RiskFinding | null {
  if (!isPausablePaused(extension)) {
    return null;
  }

  return {
    code: FINDING_CODES.PAUSABLE_TOKEN_PAUSED,
    category: 'token_extension',
    severity: 'critical',
    confidence: 'high',
    title: 'Pausable mint is paused',
    description: 'The Pausable extension reports that this mint is currently paused.',
  };
}

function pauseAuthorityFinding(
  extension: TokenRiskFacts['extensions'][number],
): RiskFinding | null {
  if (!hasPauseAuthority(extension) || extension.authority === null) {
    return null;
  }

  return {
    code: FINDING_CODES.PAUSE_AUTHORITY_ACTIVE,
    category: 'token_extension',
    severity: 'high',
    confidence: 'high',
    title: 'Pause authority is active',
    description: `A pause authority (${extension.authority}) can change the paused state of this mint.`,
  };
}

function unclassifiedExtensionFinding(
  extensions: TokenRiskFacts['extensions'],
): RiskFinding | null {
  const unclassified = extensions.filter((extension) => !extension.classified);
  if (unclassified.length === 0) {
    return null;
  }

  const names = unclassified.map((extension) => extension.name).join(', ');
  return {
    code: FINDING_CODES.UNCLASSIFIED_TOKEN_EXTENSION_PRESENT,
    category: 'token_extension',
    severity: 'info',
    confidence: 'medium',
    title: 'Unclassified token extension present',
    description:
      `One or more Token-2022 extensions were observed without Checkpoint 05-specific semantics (${names}). Their names are recorded; capabilities were not inferred.`,
  };
}

function concentrationFinding(facts: TokenRiskFacts): RiskFinding | null {
  const concentration = facts.concentration;
  if (concentration === null) {
    return null;
  }

  if (concentration.top1Bps >= CONCENTRATION_VERY_HIGH_TOP1_BPS) {
    return {
      code: FINDING_CODES.TOKEN_ACCOUNT_CONCENTRATION_VERY_HIGH,
      category: 'concentration',
      severity: 'high',
      confidence: 'low',
      title: 'Largest token-account concentration is very high',
      description:
        `The largest token account contains approximately ${formatBasisPoints(concentration.top1Bps)} of current supply. This is a token account, not a verified beneficial owner.`,
    };
  }

  if (
    concentration.top1Bps >= CONCENTRATION_ELEVATED_TOP1_BPS ||
    concentration.top5Bps >= CONCENTRATION_ELEVATED_TOP5_BPS
  ) {
    return {
      code: FINDING_CODES.TOKEN_ACCOUNT_CONCENTRATION_ELEVATED,
      category: 'concentration',
      severity: 'medium',
      confidence: 'low',
      title: 'Largest token-account concentration is elevated',
      description:
        `The largest token account contains approximately ${formatBasisPoints(concentration.top1Bps)} of current supply, and the largest ${String(Math.min(5, concentration.observedAccountsCount))} observed token account(s) contain approximately ${formatBasisPoints(concentration.top5Bps)}. These are token accounts, not verified beneficial owners.`,
    };
  }

  return null;
}

function concentrationInconsistencyFinding(reason: string | null): RiskFinding | null {
  if (reason !== 'observed token-account amounts exceed supply') {
    return null;
  }

  return {
    code: FINDING_CODES.CONCENTRATION_DATA_INCONSISTENT,
    category: 'data_quality',
    severity: 'medium',
    confidence: 'medium',
    title: 'Concentration data is inconsistent',
    description:
      'Observed largest-account amounts exceed reported supply, so concentration was not calculated and was not clamped to 100%.',
  };
}
