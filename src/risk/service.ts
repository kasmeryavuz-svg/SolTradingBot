import { isPlausibleSolanaMint } from '../utils/solana-mint.js';
import { sanitizeErrorText } from '../utils/sanitize-rpc-url.js';
import { computeConcentration, normalizeLargestAccounts } from './concentration.js';
import { evaluateTokenRisk, highestFindingSeverity } from './evaluator.js';
import type { RiskDataProvider } from './provider.js';
import { parseMintAccountResponse, parseSupplyResponse } from './solana/parser.js';
import type {
  RiskCheckResult,
  RiskCommitment,
  TokenRiskReport,
} from './types.js';
import { RiskScanError } from './types.js';

export async function scanTokenRisk(options: {
  tokenMint: string;
  provider: RiskDataProvider;
  commitment: RiskCommitment;
  now?: () => Date;
}): Promise<TokenRiskReport> {
  const tokenMint = options.tokenMint.trim();
  if (!isPlausibleSolanaMint(tokenMint)) {
    throw new RiskScanError(
      'Invalid token mint. Provide a syntactically plausible Solana mint address.',
    );
  }

  const scannedAt = (options.now ?? (() => new Date()))().toISOString();
  const mint = parseMintAccountResponse(await fetchMintAccount(options.provider, tokenMint));

  const supplyCheck = await readSupply(options.provider, tokenMint, mint.decimals);
  const largestCheck = await readLargestAccounts(
    options.provider,
    tokenMint,
    supplyCheck.supplyRaw,
    mint.decimals,
  );
  const concentration = computeConcentration(
    supplyCheck.supplyRaw,
    largestCheck.accounts,
    largestCheck.available,
  );

  const checks: RiskCheckResult[] = [
    {
      check: 'mint_account',
      ok: true,
      contextSlot: mint.mintContextSlot,
      error: null,
    },
    supplyCheck.check,
    largestCheck.check,
  ];

  const findings = evaluateTokenRisk({
    mintAuthority: mint.mintAuthority,
    freezeAuthority: mint.freezeAuthority,
    extensions: mint.extensions,
    concentration: concentration.concentration,
    concentrationUnavailableReason: concentration.unavailableReason,
  });

  return {
    chain: 'solana',
    tokenMint,
    scannedAt,
    commitment: options.commitment,
    tokenProgram: mint.tokenProgram,
    programOwner: mint.programOwner,
    mintContextSlot: mint.mintContextSlot,
    supplyContextSlot: supplyCheck.check.contextSlot,
    largestAccountsContextSlot: largestCheck.check.contextSlot,
    decimals: mint.decimals,
    supplyRaw: supplyCheck.supplyRaw,
    mintAuthority: mint.mintAuthority,
    freezeAuthority: mint.freezeAuthority,
    extensions: mint.extensions,
    largestTokenAccounts: largestCheck.accounts,
    concentration: concentration.concentration,
    concentrationUnavailableReason: concentration.unavailableReason,
    checks,
    findings,
    dataCompleteness: checks.every((check) => check.ok) ? 'complete' : 'partial',
    highestFindingSeverity: highestFindingSeverity(findings),
  };
}

async function fetchMintAccount(provider: RiskDataProvider, tokenMint: string) {
  try {
    return await provider.getMintAccount(tokenMint);
  } catch (error: unknown) {
    if (error instanceof RiskScanError) {
      throw error;
    }

    throw new RiskScanError(
      `Mint account could not be obtained from Solana RPC. ${sanitizeProviderError(error)}`,
      { cause: error },
    );
  }
}

async function readSupply(
  provider: RiskDataProvider,
  tokenMint: string,
  expectedDecimals: number,
): Promise<{
  supplyRaw: string | null;
  check: RiskCheckResult;
}> {
  try {
    const parsed = parseSupplyResponse(await provider.getTokenSupply(tokenMint));
    if (parsed.decimals !== expectedDecimals) {
      return {
        supplyRaw: null,
        check: {
          check: 'supply',
          ok: false,
          contextSlot: parsed.supplyContextSlot,
          error: 'getTokenSupply decimals do not match mint decimals',
        },
      };
    }

    return {
      supplyRaw: parsed.supplyRaw,
      check: {
        check: 'supply',
        ok: true,
        contextSlot: parsed.supplyContextSlot,
        error: null,
      },
    };
  } catch (error: unknown) {
    return {
      supplyRaw: null,
      check: {
        check: 'supply',
        ok: false,
        contextSlot: null,
        error: sanitizeProviderError(error),
      },
    };
  }
}

async function readLargestAccounts(
  provider: RiskDataProvider,
  tokenMint: string,
  supplyRaw: string | null,
  expectedDecimals: number,
): Promise<{
  accounts: TokenRiskReport['largestTokenAccounts'];
  available: boolean;
  check: RiskCheckResult;
}> {
  try {
    const response = await provider.getLargestTokenAccounts(tokenMint);
    const normalized = normalizeLargestAccounts(response.accounts, supplyRaw, expectedDecimals);
    if (normalized.unavailableReason !== null) {
      return {
        accounts: [],
        available: false,
        check: {
          check: 'largest_accounts',
          ok: false,
          contextSlot: response.contextSlot,
          error: normalized.unavailableReason,
        },
      };
    }

    return {
      accounts: normalized.accounts,
      available: true,
      check: {
        check: 'largest_accounts',
        ok: true,
        contextSlot: response.contextSlot,
        error: null,
      },
    };
  } catch (error: unknown) {
    return {
      accounts: [],
      available: false,
      check: {
        check: 'largest_accounts',
        ok: false,
        contextSlot: null,
        error: sanitizeProviderError(error),
      },
    };
  }
}

function sanitizeProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeErrorText(message);
}
