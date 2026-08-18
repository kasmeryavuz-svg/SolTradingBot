import { isAddress } from '@solana/kit';
import { SPL_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from './constants.js';
import { WalletIntelligenceError } from './errors.js';
import { isRecord, parseDecimals } from './numbers.js';
import type { ParsedMintAccount, TokenProgramKind } from './types.js';

export function validateCanonicalMintInput(value: string): string {
  const trimmed = value.trim();
  if (trimmed !== value) {
    throw new WalletIntelligenceError(
      'Invalid token mint. Provide a canonical base58 Solana pubkey with no surrounding whitespace.',
      { code: 'invalid_mint' },
    );
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    throw new WalletIntelligenceError('Invalid token mint. URL input is not accepted.', {
      code: 'invalid_mint',
    });
  }
  if (!isAddress(trimmed)) {
    throw new WalletIntelligenceError('Invalid token mint. Expected a canonical base58 Solana pubkey.', {
      code: 'invalid_mint',
    });
  }
  return trimmed;
}

export function parseMintAccountValue(value: unknown): ParsedMintAccount {
  if (value === null) {
    throw new WalletIntelligenceError('Token mint account was not found.', { code: 'invalid_mint' });
  }
  if (!isRecord(value)) {
    throw new WalletIntelligenceError('Mint account payload is malformed.', {
      code: 'provider_integrity_failure',
    });
  }
  const owner = value['owner'];
  if (typeof owner !== 'string') {
    throw new WalletIntelligenceError('Mint account payload is malformed.', {
      code: 'provider_integrity_failure',
    });
  }
  const tokenProgram = tokenProgramFromOwner(owner);
  const parsed = readParsedMint(value['data']);
  if (parsed.info['isInitialized'] !== true) {
    throw new WalletIntelligenceError('Mint account is not initialized.', { code: 'invalid_mint' });
  }
  return {
    tokenProgram,
    programOwner: owner,
    decimals: parseDecimals(parsed.info['decimals']),
    initialized: true,
  };
}

function tokenProgramFromOwner(owner: string): TokenProgramKind {
  if (owner === SPL_TOKEN_PROGRAM_ID) {
    return 'spl_token';
  }
  if (owner === TOKEN_2022_PROGRAM_ID) {
    return 'token_2022';
  }
  throw new WalletIntelligenceError(
    'Account is not a supported SPL token mint. A program address cannot be analyzed as a mint.',
    { code: 'invalid_mint' },
  );
}

function readParsedMint(data: unknown): { info: Record<string, unknown> } {
  if (Array.isArray(data)) {
    throw new WalletIntelligenceError('Account is not a parsed mint.', { code: 'invalid_mint' });
  }
  if (!isRecord(data) || !isRecord(data['parsed'])) {
    throw new WalletIntelligenceError('Account is not a parsed mint.', { code: 'invalid_mint' });
  }
  const parser = data['program'];
  if (parser !== 'spl-token' && parser !== 'spl-token-2022') {
    throw new WalletIntelligenceError('Account is not a parsed mint.', { code: 'invalid_mint' });
  }
  const parsed = data['parsed'];
  if (parsed['type'] !== 'mint' || !isRecord(parsed['info'])) {
    throw new WalletIntelligenceError('Account is not a parsed mint.', { code: 'invalid_mint' });
  }
  return { info: parsed['info'] };
}
