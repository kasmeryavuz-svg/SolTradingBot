import { formatCapabilityFooter } from '../persistence/format.js';
import type { RecordedRiskScan, TokenRiskHistory } from '../persistence/types.js';
import { formatBasisPoints } from './numbers.js';
import type {
  HighestFindingSeverity,
  TokenAccountConcentration,
  TokenExtensionObservation,
  TokenProgramKind,
  TokenRiskReport,
} from './types.js';

export function formatRiskCheckLines(report: TokenRiskReport): string[] {
  return [
    'Token Risk Scanner — TECHNICAL INDICATORS',
    `Mint: ${report.tokenMint}`,
    `Program: ${formatTokenProgram(report.tokenProgram)}`,
    `Commitment: ${report.commitment}`,
    `Scanned at: ${report.scannedAt}`,
    `Data completeness: ${report.dataCompleteness}`,
    'Risk facts were gathered using several RPC requests at nearby chain states. Slots may differ.',
    `Mint context slot: ${String(report.mintContextSlot)}`,
    `Supply context slot: ${formatOptionalSlot(report.supplyContextSlot)}`,
    `Largest-accounts context slot: ${formatOptionalSlot(report.largestAccountsContextSlot)}`,
    '',
    'Authorities',
    `Mint authority: ${report.mintAuthority ?? 'none'}`,
    `Freeze authority: ${report.freezeAuthority ?? 'none'}`,
    '',
    'Supply',
    `Raw supply: ${report.supplyRaw ?? 'unavailable'}`,
    `Decimals: ${String(report.decimals)}`,
    '',
    ...formatConcentrationSection(report),
    '',
    ...formatExtensionSection(report.extensions),
    '',
    ...formatFindingsSection(report),
    '',
    `Highest finding severity: ${formatHighestSeverity(report.highestFindingSeverity)}`,
    ...formatNoFindingsDisclaimer(report),
    '',
    'Limitations:',
    '- no LP-lock analysis',
    '- no wallet ownership classification',
    '- no creator-history analysis',
    '- no honeypot/sell simulation',
    '- no buy/sell signal',
    'No configured finding is proof of safety or fraud.',
    '',
    ...formatCapabilityFooter(),
  ];
}

export function formatRiskRecordLines(report: TokenRiskReport, recorded: RecordedRiskScan): string[] {
  return [
    ...formatRiskCheckLines(report),
    '',
    `Persisted risk scan id: ${String(recorded.scanId)}`,
    recorded.tokenInserted
      ? 'Canonical token row created from this risk scan. first_observed_at is when this database recorded the mint, not token launch time.'
      : 'Existing canonical token observation times were updated with this scan time.',
  ];
}

export function formatRiskHistoryLines(tokenMint: string, history: TokenRiskHistory | null): string[] {
  if (history === null) {
    return [
      'Token risk history',
      `Mint: ${tokenMint}`,
      '',
      'No risk history found for this mint.',
      '',
      ...formatCapabilityFooter(),
    ];
  }

  const lines = [
    'Token risk history',
    `Mint: ${history.token.mint}`,
    `First observed by bot: ${history.token.firstObservedAt}`,
    `Last observed by bot: ${history.token.lastObservedAt}`,
    'These are database observation times, not token creation or launch time.',
    '',
  ];

  if (history.scans.length === 0) {
    lines.push('No stored risk scans for this mint.');
  }

  for (const scan of history.scans) {
    lines.push(`Scanned at: ${scan.scannedAt}`);
    lines.push(`Token program: ${formatTokenProgram(scan.tokenProgram)}`);
    lines.push(`Mint authority: ${scan.mintAuthority ?? 'none'}`);
    lines.push(`Freeze authority: ${scan.freezeAuthority ?? 'none'}`);
    lines.push(`Supply raw: ${scan.supplyRaw ?? 'unavailable'}`);
    lines.push(`Top 1 concentration: ${formatOptionalBps(scan.top1Bps)}`);
    lines.push(`Top 5 concentration: ${formatOptionalBps(scan.top5Bps)}`);
    lines.push(`Highest finding severity: ${formatHighestSeverity(scan.highestFindingSeverity)}`);
    lines.push(
      `Finding codes: ${scan.findingCodes.length === 0 ? 'none' : scan.findingCodes.join(', ')}`,
    );
    lines.push('');
  }

  lines.push(...formatCapabilityFooter());
  return lines;
}

function formatConcentrationSection(report: TokenRiskReport): string[] {
  const lines = [
    'Largest token-account concentration',
    'These are token accounts, not verified beneficial owners.',
    'DEX vaults, program accounts or exchange accounts may be included.',
  ];

  if (report.concentration === null) {
    lines.push(`Concentration: unavailable (${report.concentrationUnavailableReason ?? 'not calculated'})`);
    return lines;
  }

  lines.push(
    'Top N is the share held by the first min(N, observed) ranked token accounts.',
  );
  lines.push(`Observed token accounts: ${String(report.concentration.observedAccountsCount)}`);
  lines.push(`Top 1: ${formatConcentration(report.concentration, 1, 'top1Bps')}`);
  lines.push(`Top 5: ${formatConcentration(report.concentration, 5, 'top5Bps')}`);
  lines.push(`Top 10: ${formatConcentration(report.concentration, 10, 'top10Bps')}`);
  lines.push(`Top 20: ${formatConcentration(report.concentration, 20, 'top20Bps')}`);
  return lines;
}

function formatExtensionSection(extensions: readonly TokenExtensionObservation[]): string[] {
  const lines = ['Token extensions'];
  if (extensions.length === 0) {
    lines.push('None observed.');
    return lines;
  }

  for (const extension of extensions) {
    if (extension.name === 'TransferFeeConfig') {
      const metadata =
        extension.state === null
          ? 'configured/scheduled transfer-fee metadata present'
          : `configured/scheduled metadata: ${extension.state}`;
      lines.push(`- TransferFeeConfig (${metadata}; not proven currently effective)`);
      continue;
    }

    lines.push(`- ${extension.name}`);
  }

  return lines;
}

function formatFindingsSection(report: TokenRiskReport): string[] {
  const lines = ['Findings'];
  if (report.findings.length === 0) {
    lines.push('None of the risk indicators implemented in Checkpoint 05 triggered.');
    return lines;
  }

  for (const finding of report.findings) {
    lines.push(
      `[${finding.severity.toUpperCase()} / ${finding.confidence.toUpperCase()} confidence] ${finding.code}`,
    );
    lines.push(finding.description);
  }

  return lines;
}

function formatNoFindingsDisclaimer(report: TokenRiskReport): string[] {
  if (report.findings.length > 0) {
    return [];
  }

  return [
    'No configured Checkpoint 05 risk indicators triggered. This does not prove the token is safe.',
  ];
}

function formatTokenProgram(program: TokenProgramKind): string {
  return program === 'token_2022' ? 'SPL Token-2022' : 'SPL Token';
}

function formatHighestSeverity(severity: HighestFindingSeverity): string {
  return severity.toUpperCase();
}

function formatOptionalSlot(slot: number | null): string {
  return slot === null ? 'unavailable' : String(slot);
}

function formatOptionalBps(bps: number | null): string {
  return bps === null ? 'unavailable' : formatBasisPoints(bps);
}

function formatConcentration(
  concentration: TokenAccountConcentration,
  prefix: 1 | 5 | 10 | 20,
  key: keyof Pick<TokenAccountConcentration, 'top1Bps' | 'top5Bps' | 'top10Bps' | 'top20Bps'>,
): string {
  const used = Math.min(prefix, concentration.observedAccountsCount);
  return `${formatBasisPoints(concentration[key])} (first ${String(used)} of ${String(concentration.observedAccountsCount)} observed token accounts)`;
}
