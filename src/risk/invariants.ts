import { SPL_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from './constants.js';
import { highestFindingSeverity } from './evaluator.js';
import { RAW_AMOUNT_PATTERN } from './numbers.js';
import type { RiskCheckName, TokenRiskReport } from './types.js';
import { RISK_CHECK_NAMES, RiskScanError } from './types.js';

export function assertRiskReportInvariants(report: TokenRiskReport): void {
  requireSafeInteger(report.mintContextSlot, 'mintContextSlot');
  requireSafeIntegerOrNull(report.supplyContextSlot, 'supplyContextSlot');
  requireSafeIntegerOrNull(report.largestAccountsContextSlot, 'largestAccountsContextSlot');
  requireDecimals(report.decimals);
  requireRawAmountOrNull(report.supplyRaw, 'supplyRaw');
  assertProgramOwner(report);
  assertChecks(report);
  assertFindings(report);
  assertLargestAccounts(report);
  assertConcentration(report);
  assertExtensions(report);
}

function assertProgramOwner(report: TokenRiskReport): void {
  const expected =
    report.tokenProgram === 'spl_token' ? SPL_TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
  if (report.programOwner !== expected) {
    throw new RiskScanError('tokenProgram does not match programOwner.');
  }
}

function assertChecks(report: TokenRiskReport): void {
  const names = report.checks.map((check) => check.check);
  if (names.length !== RISK_CHECK_NAMES.length || new Set(names).size !== names.length) {
    throw new RiskScanError('Risk report checks must contain each data-source check exactly once.');
  }

  for (const required of RISK_CHECK_NAMES) {
    if (!names.includes(required)) {
      throw new RiskScanError(`Risk report is missing the ${required} check.`);
    }
  }

  const mintCheck = requireCheck(report, 'mint_account');
  if (!mintCheck.ok) {
    throw new RiskScanError('A TokenRiskReport cannot be persisted when the mint-account check failed.');
  }

  const completeness: string = report.dataCompleteness;
  if (completeness !== 'complete' && completeness !== 'partial') {
    throw new RiskScanError('dataCompleteness must be complete or partial.');
  }

  const allOk = report.checks.every((check) => check.ok);
  if (report.dataCompleteness === 'complete' && !allOk) {
    throw new RiskScanError('dataCompleteness=complete requires every risk check to succeed.');
  }
  if (report.dataCompleteness === 'partial' && allOk) {
    throw new RiskScanError('dataCompleteness=partial requires at least one failed optional check.');
  }

  const supplyCheck = requireCheck(report, 'supply');
  if (supplyCheck.ok && report.supplyRaw === null) {
    throw new RiskScanError('Successful supply check cannot have a null supply.');
  }
  if (!supplyCheck.ok && report.supplyRaw !== null) {
    throw new RiskScanError('Failed supply check cannot carry a supply value.');
  }

  const largestCheck = requireCheck(report, 'largest_accounts');
  if (!largestCheck.ok && report.largestTokenAccounts.length > 0) {
    throw new RiskScanError('Failed largest-accounts check cannot carry token-account rows.');
  }

  for (const check of report.checks) {
    requireSafeIntegerOrNull(check.contextSlot, `${check.check}.contextSlot`);
  }
}

function assertFindings(report: TokenRiskReport): void {
  const codes = new Set<string>();
  for (const finding of report.findings) {
    if (codes.has(finding.code)) {
      throw new RiskScanError('Risk report contains duplicate finding codes.');
    }
    codes.add(finding.code);
  }

  const expected = highestFindingSeverity(report.findings);
  if (report.highestFindingSeverity !== expected) {
    throw new RiskScanError('highestFindingSeverity does not match the persisted findings.');
  }
}

function assertLargestAccounts(report: TokenRiskReport): void {
  const accounts = report.largestTokenAccounts;
  if (accounts.length > 20) {
    throw new RiskScanError('largestTokenAccounts cannot contain more than 20 rows.');
  }

  const addresses = new Set<string>();
  for (const [index, account] of accounts.entries()) {
    if (account.rank !== index + 1 || account.rank < 1 || account.rank > 20) {
      throw new RiskScanError('largestTokenAccounts ranks must be contiguous from 1.');
    }
    if (addresses.has(account.tokenAccount)) {
      throw new RiskScanError('largestTokenAccounts contains duplicate token-account addresses.');
    }
    addresses.add(account.tokenAccount);
    requireRawAmountOrNull(account.amountRaw, 'largestTokenAccount.amountRaw');
    requireBasisPointsOrNull(account.shareBps, 'largestTokenAccount.shareBps');
  }
}

function assertConcentration(report: TokenRiskReport): void {
  const supplyOk = requireCheck(report, 'supply').ok;
  const largestOk = requireCheck(report, 'largest_accounts').ok;
  const concentration = report.concentration;

  if (concentration === null) {
    return;
  }

  if (!supplyOk || !largestOk || report.supplyRaw === null || report.supplyRaw === '0') {
    throw new RiskScanError('Concentration cannot exist when required supply or largest-account data is unavailable.');
  }

  if (concentration.observedAccountsCount !== report.largestTokenAccounts.length) {
    throw new RiskScanError('observedAccountsCount does not match largestTokenAccounts.length.');
  }

  requireBasisPointsOrNull(concentration.top1Bps, 'top1Bps');
  requireBasisPointsOrNull(concentration.top5Bps, 'top5Bps');
  requireBasisPointsOrNull(concentration.top10Bps, 'top10Bps');
  requireBasisPointsOrNull(concentration.top20Bps, 'top20Bps');

  if (
    concentration.top1Bps > concentration.top5Bps ||
    concentration.top5Bps > concentration.top10Bps ||
    concentration.top10Bps > concentration.top20Bps
  ) {
    throw new RiskScanError('Concentration top-N basis points must be non-decreasing.');
  }
}

function assertExtensions(report: TokenRiskReport): void {
  for (const extension of report.extensions) {
    requireBasisPointsOrNull(extension.transferFeeBasisPoints, 'extension.transferFeeBasisPoints');
    requireBasisPointsOrNull(extension.olderTransferFeeBasisPoints, 'extension.olderTransferFeeBasisPoints');
    requireBasisPointsOrNull(extension.newerTransferFeeBasisPoints, 'extension.newerTransferFeeBasisPoints');
    requireRawAmountOrNull(extension.maximumFeeRaw, 'extension.maximumFeeRaw');
    requireRawAmountOrNull(extension.olderMaximumFeeRaw, 'extension.olderMaximumFeeRaw');
    requireRawAmountOrNull(extension.newerMaximumFeeRaw, 'extension.newerMaximumFeeRaw');
  }
}

function requireCheck(report: TokenRiskReport, name: RiskCheckName) {
  const check = report.checks.find((item) => item.check === name);
  if (check === undefined) {
    throw new RiskScanError(`Risk report is missing the ${name} check.`);
  }
  return check;
}

function requireDecimals(value: number): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) {
    throw new RiskScanError('Invalid mint decimals. Expected an integer from 0 to 255.');
  }
}

function requireSafeInteger(value: number, field: string): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || !Number.isFinite(value)) {
    throw new RiskScanError(`Invalid ${field}. Expected a non-negative safe integer.`);
  }
}

function requireSafeIntegerOrNull(value: number | null, field: string): void {
  if (value !== null) {
    requireSafeInteger(value, field);
  }
}

function requireBasisPointsOrNull(value: number | null, field: string): void {
  if (value === null) {
    return;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10_000 || !Number.isFinite(value)) {
    throw new RiskScanError(`Invalid ${field}. Expected an integer from 0 to 10000.`);
  }
}

function requireRawAmountOrNull(value: string | null, field: string): void {
  if (value === null) {
    return;
  }

  if (typeof value !== 'string' || !RAW_AMOUNT_PATTERN.test(value)) {
    throw new RiskScanError(`Invalid ${field}. Expected a non-negative decimal integer string.`);
  }
}
