import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { SPL_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '../src/risk/constants.js';
import type {
  RiskDataProvider,
  RiskLargestAccountResponse,
} from '../src/risk/provider.js';
import type { TokenRiskReport } from '../src/risk/types.js';

export const SCAN_TIME = '2026-08-17T10:00:00.000Z';
export const AUTHORITY = USDC_MINT;
export const HOOK_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

export function mintAccountValue(overrides: {
  owner?: string;
  type?: string;
  isInitialized?: boolean;
  decimals?: number;
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  extensions?: unknown;
  unparsed?: boolean;
} = {}): unknown {
  if (overrides.unparsed === true) {
    return {
      owner: overrides.owner ?? SPL_TOKEN_PROGRAM_ID,
      data: ['base64data', 'base64'],
    };
  }

  const info: Record<string, unknown> = {
    decimals: overrides.decimals ?? 6,
    freezeAuthority: overrides.freezeAuthority === undefined ? null : overrides.freezeAuthority,
    isInitialized: overrides.isInitialized ?? true,
    mintAuthority: overrides.mintAuthority === undefined ? null : overrides.mintAuthority,
    supply: '1000',
  };
  if (overrides.extensions !== undefined) {
    info['extensions'] = overrides.extensions;
  }

  return {
    owner: overrides.owner ?? SPL_TOKEN_PROGRAM_ID,
    data: {
      program: overrides.owner === TOKEN_2022_PROGRAM_ID ? 'spl-token-2022' : 'spl-token',
      parsed: {
        type: overrides.type ?? 'mint',
        info,
      },
      space: 82,
    },
  };
}

export function fakeRiskProvider(options: {
  mintValue?: unknown;
  mintSlot?: number;
  mintError?: string;
  supplyAmount?: string;
  supplyDecimals?: number;
  supplySlot?: number;
  supplyError?: string;
  accounts?: readonly RiskLargestAccountResponse[];
  largestSlot?: number;
  largestError?: string;
} = {}): RiskDataProvider {
  return {
    getMintAccount: () => {
      if (options.mintError !== undefined) {
        return Promise.reject(new Error(options.mintError));
      }
      return Promise.resolve({
        contextSlot: options.mintSlot ?? 100,
        value: options.mintValue === undefined ? mintAccountValue() : options.mintValue,
      });
    },
    getTokenSupply: () => {
      if (options.supplyError !== undefined) {
        return Promise.reject(new Error(options.supplyError));
      }
      return Promise.resolve({
        contextSlot: options.supplySlot ?? 101,
        amount: options.supplyAmount ?? '10000',
        decimals: options.supplyDecimals ?? 6,
      });
    },
    getLargestTokenAccounts: () => {
      if (options.largestError !== undefined) {
        return Promise.reject(new Error(options.largestError));
      }
      return Promise.resolve({
        contextSlot: options.largestSlot ?? 102,
        accounts: options.accounts ?? [
          { address: WRAPPED_SOL_MINT, amount: '1000', decimals: 6 },
        ],
      });
    },
  };
}

export function sampleReport(overrides: Partial<TokenRiskReport> = {}): TokenRiskReport {
  return {
    chain: 'solana',
    tokenMint: WRAPPED_SOL_MINT,
    scannedAt: SCAN_TIME,
    commitment: 'confirmed',
    tokenProgram: 'spl_token',
    programOwner: SPL_TOKEN_PROGRAM_ID,
    mintContextSlot: 100,
    supplyContextSlot: 101,
    largestAccountsContextSlot: 102,
    decimals: 6,
    supplyRaw: '10000',
    mintAuthority: null,
    freezeAuthority: null,
    extensions: [],
    largestTokenAccounts: [
      { rank: 1, tokenAccount: WRAPPED_SOL_MINT, amountRaw: '1000', shareBps: 1000 },
    ],
    concentration: {
      top1Bps: 1000,
      top5Bps: 1000,
      top10Bps: 1000,
      top20Bps: 1000,
      observedAccountsCount: 1,
    },
    concentrationUnavailableReason: null,
    checks: [
      { check: 'mint_account', ok: true, contextSlot: 100, error: null },
      { check: 'supply', ok: true, contextSlot: 101, error: null },
      { check: 'largest_accounts', ok: true, contextSlot: 102, error: null },
    ],
    findings: [],
    dataCompleteness: 'complete',
    highestFindingSeverity: 'none',
    ...overrides,
  };
}
