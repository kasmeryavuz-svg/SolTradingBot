import { isPlausibleSolanaMint } from '../../utils/solana-mint.js';
import { SPL_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '../constants.js';
import { parseTokenExtensions } from '../extensions.js';
import { isRecord, parseDecimals, parseRawAmount, parseSafeSlot } from '../numbers.js';
import type { RiskMintAccountResponse, RiskTokenSupplyResponse } from '../provider.js';
import type { TokenExtensionObservation, TokenProgramKind } from '../types.js';
import { RiskScanError } from '../types.js';

export type ParsedMintAccount = {
  tokenProgram: TokenProgramKind;
  programOwner: string;
  mintContextSlot: number;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  extensions: TokenExtensionObservation[];
};

export type ParsedMintAccountWithUnsupported = Omit<ParsedMintAccount, 'tokenProgram'> & {
  tokenProgram: TokenProgramKind | 'unsupported';
};

export function parseMintAccountResponse(response: RiskMintAccountResponse): ParsedMintAccount {
  return parseMintAccountResponseInternal(response, false) as ParsedMintAccount;
}

/** Parses all mint invariants while retaining an unsupported owner as incomplete facts. */
export function parseMintAccountResponseAllowUnsupported(
  response: RiskMintAccountResponse,
): ParsedMintAccountWithUnsupported {
  return parseMintAccountResponseInternal(response, true);
}

function parseMintAccountResponseInternal(
  response: RiskMintAccountResponse,
  allowUnsupported: boolean,
): ParsedMintAccountWithUnsupported {
  if (response.value === null) {
    throw new RiskScanError('Token mint account was not found.');
  }

  if (!isRecord(response.value)) {
    throw new RiskScanError('Mint account payload is malformed.');
  }

  const owner = response.value['owner'];
  if (typeof owner !== 'string') {
    throw new RiskScanError('Mint account payload is malformed.');
  }

  const tokenProgram = tokenProgramFromOwner(owner, allowUnsupported);
  const parsed = readParsedMint(response.value['data']);
  if (parsed.info['isInitialized'] !== true) {
    throw new RiskScanError('Mint account is not initialized.');
  }

  return {
    tokenProgram,
    programOwner: owner,
    mintContextSlot: parseSafeSlot(response.contextSlot, 'mintContextSlot'),
    decimals: parseDecimals(parsed.info['decimals']),
    mintAuthority: readAuthority(parsed.info['mintAuthority'], 'mintAuthority'),
    freezeAuthority: readAuthority(parsed.info['freezeAuthority'], 'freezeAuthority'),
    extensions: tokenProgram === 'token_2022' ? parseTokenExtensions(parsed.info['extensions']) : [],
  };
}

export function parseSupplyResponse(response: RiskTokenSupplyResponse): {
  supplyRaw: string;
  supplyContextSlot: number;
  decimals: number;
} {
  return {
    supplyRaw: parseRawAmount(response.amount, 'token supply'),
    supplyContextSlot: parseSafeSlot(response.contextSlot, 'supplyContextSlot'),
    decimals: parseDecimals(response.decimals),
  };
}

function tokenProgramFromOwner(owner: string, allowUnsupported: boolean): TokenProgramKind | 'unsupported' {
  if (owner === SPL_TOKEN_PROGRAM_ID) {
    return 'spl_token';
  }

  if (owner === TOKEN_2022_PROGRAM_ID) {
    return 'token_2022';
  }

  if (allowUnsupported) return 'unsupported';
  throw new RiskScanError('Account owner is not a supported token program.');
}

function readParsedMint(data: unknown): { info: Record<string, unknown> } {
  if (Array.isArray(data)) {
    throw new RiskScanError('Account is not a parsed mint.');
  }

  if (!isRecord(data) || !isRecord(data['parsed'])) {
    throw new RiskScanError('Account is not a parsed mint.');
  }

  const parsed = data['parsed'];
  if (parsed['type'] !== 'mint' || !isRecord(parsed['info'])) {
    throw new RiskScanError('Account is not a parsed mint.');
  }

  return { info: parsed['info'] };
}

function readAuthority(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    throw new RiskScanError(`Mint account ${field} is malformed.`);
  }

  const trimmed = value.trim();
  if (!isPlausibleSolanaMint(trimmed)) {
    throw new RiskScanError(`Mint account ${field} is malformed.`);
  }

  return trimmed;
}
