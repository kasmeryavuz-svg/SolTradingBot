import { USDC_MINT } from '../src/config/index.js';
import {
  SPL_TOKEN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '../src/wallet-intelligence/constants.js';
import type {
  FirstObservedActivityRequest,
  LargestTokenAccount,
  RecentHistoryPageRequest,
  TokenBalanceEvidence,
  WalletHistoryTransaction,
  WalletIntelligenceProvider,
} from '../src/wallet-intelligence/types.js';

export const WI_MINT = USDC_MINT;
export const WI_SCAN_MS = Date.parse('2026-08-18T12:00:00.000Z');
export const WI_HOLDER_SLOT = 5000;
export const WI_SECRET = 'super-secret-helius-key-123';

export const TOKEN_ACCOUNTS = [
  'FuTBoFUAqxgzC6wbG2PqFPVtsim3hvYMGTZbk5o9ufRU',
  'F9CfhgcK7QAhyUd2PBC7Bd53S4HmJFbz3SFKuRDjUsqk',
  'XLVHGjfPTVDd1KxkXA1vURDVrUHg7GHAGrjyEiHuG6o',
  'BBdsWV2fmdES62D1vM6Cddy6Ktmt2kNcbQwqZmiFXPMu',
  '3MSsTvGHyED4FCR5786m4aym5vYYTDbvprdtP98iCxgL',
  '6PnFuJzykSSS2uCqyc3pysSwn8FzJTPwM26YtJFJc7jQ',
  '4ZpmgafwTnMS3gs686XVDMSvVEfESxFsqoh2fk1k2sdm',
  'ArHivew55HmcbGhToHf6mNipUNz6gEQtfgAs9YJh2xFT',
  '7i5dJYqMDvqASYekksEnt4XwBUMSLQ6B9tu62jzR8qnc',
  'HjHhPBspmJCDXZ6G1MFe4wFEY9BBwkfcKi9112NtQkP6',
  '5yTSjVngTi4zKkQnA469vPaLwz6y2EDCpbkCLpMRPKpH',
  'mdYvTyUqEv96swtEwxrdoVyt1CuMeYGVnzKhqGwbahM',
  'W7dB99DZRGPa5ELsBz2hGBumMtkhgH4ESqk8YzGrqMh',
  '4ayanNJzyPVKXrfKBs1yLSoqDL8EvQeR747D5czpgAY9',
  'FxEaoNVHqksEgp1nsAygF3iMTt62rhj1gk1R8DqeZ6Lr',
  '4Zc4MK8myF4dsTioRnii7PcYnVy81Y8heHgso2bfHSQB',
  'HQ7gR9qTmDLoiFXjZTQSRVdiwDirFGedEuNBUcjknpUv',
  'CpP2pf8ab7RDrXLmMnkAyyn9A3LJwKmsD2PKjBt1YGe',
  '6jwMn8NVxxE12o4aontZTW9hVRJqR9J2whWXWWQxAVv',
  'C2EPnmZpUenjms5KBHjbifzsodLfJqSCR4SeUywLVA8J',
] as const;

export const WALLET_A = TOKEN_ACCOUNTS[10];
export const WALLET_B = TOKEN_ACCOUNTS[11];
export const WALLET_C = TOKEN_ACCOUNTS[12];
export const PROGRAM_OWNER = SPL_TOKEN_PROGRAM_ID;

export type FakeWalletIntelligenceStats = {
  historyPageRequests: RecentHistoryPageRequest[];
  firstObservedRequests: FirstObservedActivityRequest[];
  multipleAccountCalls: Array<{ addresses: readonly string[]; minContextSlot: number }>;
  maxHistoryInFlight: number;
  currentHistoryInFlight: number;
};

export function mintAccountValue(options: { owner?: string; type?: string; decimals?: number } = {}): unknown {
  return {
    owner: options.owner ?? SPL_TOKEN_PROGRAM_ID,
    executable: false,
    data: {
      program: options.owner === TOKEN_2022_PROGRAM_ID ? 'spl-token-2022' : 'spl-token',
      parsed: {
        type: options.type ?? 'mint',
        info: {
          decimals: options.decimals ?? 6,
          isInitialized: true,
          mintAuthority: null,
          freezeAuthority: null,
        },
      },
      space: 82,
    },
  };
}

export function tokenAccountValue(options: {
  mint?: string;
  owner: string;
  amountRaw: string;
  decimals?: number;
  state?: string;
  programOwner?: string;
}): unknown {
  const programOwner = options.programOwner ?? SPL_TOKEN_PROGRAM_ID;
  return {
    owner: programOwner,
    executable: false,
    data: {
      program: programOwner === TOKEN_2022_PROGRAM_ID ? 'spl-token-2022' : 'spl-token',
      parsed: {
        type: 'account',
        info: {
          mint: options.mint ?? WI_MINT,
          owner: options.owner,
          state: options.state ?? 'initialized',
          tokenAmount: {
            amount: options.amountRaw,
            decimals: options.decimals ?? 6,
            uiAmount: 1,
            uiAmountString: '1',
          },
        },
      },
      space: 165,
    },
  };
}

export function ownerAccountValue(options: {
  program?: string;
  executable?: boolean;
} = {}): unknown {
  return {
    owner: options.program ?? SYSTEM_PROGRAM_ID,
    executable: options.executable ?? false,
    data: ['', 'base64'],
  };
}

export function largestAccount(
  address: string,
  amountRaw: string,
  decimals = 6,
): LargestTokenAccount {
  return { address, amountRaw, decimals };
}

export function historyTx(options: {
  signature: string;
  slot: number;
  blockTime: number | null;
  err?: unknown;
  transactionIndex?: number;
  pre?: readonly TokenBalanceEvidence[] | null;
  post?: readonly TokenBalanceEvidence[] | null;
}): WalletHistoryTransaction {
  return {
    signature: options.signature,
    slot: options.slot,
    transactionIndex: options.transactionIndex ?? 0,
    blockTime: options.blockTime,
    err: options.err ?? null,
    preTokenBalances: options.pre === undefined ? [] : options.pre,
    postTokenBalances: options.post === undefined ? [] : options.post,
  };
}

export function tokenBalance(options: {
  accountIndex: number;
  mint: string;
  owner: string | null;
  amountRaw: string;
  decimals?: number;
  programId?: string | null;
}): TokenBalanceEvidence {
  return {
    accountIndex: options.accountIndex,
    mint: options.mint,
    owner: options.owner,
    programId: options.programId === undefined ? SPL_TOKEN_PROGRAM_ID : options.programId,
    amountRaw: options.amountRaw,
    decimals: options.decimals ?? 6,
  };
}

export function fakeWalletIntelligenceProvider(options: {
  genesisHash?: string;
  mintValue?: unknown;
  largest?: readonly LargestTokenAccount[];
  holderSlot?: number;
  parsedAccounts?: Record<string, unknown>;
  recentHistory?: Record<string, readonly WalletHistoryTransaction[]>;
  firstObserved?: Record<string, WalletHistoryTransaction | null>;
  historyOrder?: 'reversed';
  historyDelayMs?: number;
  multipleAccountsContextSlot?: number | ((callIndex: number, minContextSlot: number) => number);
  stats?: FakeWalletIntelligenceStats;
  failHistoryFor?: string;
  historyPager?: (
    request: RecentHistoryPageRequest,
  ) => { transactions: readonly WalletHistoryTransaction[]; paginationToken: string | null };
} = {}): WalletIntelligenceProvider {
  const parsedAccounts = options.parsedAccounts ?? {};
  const stats = options.stats ?? {
    historyPageRequests: [],
    firstObservedRequests: [],
    multipleAccountCalls: [],
    maxHistoryInFlight: 0,
    currentHistoryInFlight: 0,
  };
  let multipleAccountCallIndex = 0;

  return {
    verifyMainnetIdentity: () =>
      Promise.resolve({
        genesisHash: options.genesisHash ?? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
      }),
    getMintAccount: () =>
      Promise.resolve({
        contextSlot: 10,
        value: options.mintValue === undefined ? mintAccountValue() : options.mintValue,
      }),
    getTokenLargestAccounts: () =>
      Promise.resolve({
        contextSlot: options.holderSlot ?? WI_HOLDER_SLOT,
        accounts: options.largest ?? [
          largestAccount(TOKEN_ACCOUNTS[0], '400'),
          largestAccount(TOKEN_ACCOUNTS[1], '300'),
        ],
      }),
    getMultipleParsedAccounts: (addresses, request) => {
      multipleAccountCallIndex += 1;
      stats.multipleAccountCalls.push({
        addresses: [...addresses],
        minContextSlot: request.minContextSlot,
      });
      const contextSlot =
        typeof options.multipleAccountsContextSlot === 'function'
          ? options.multipleAccountsContextSlot(multipleAccountCallIndex, request.minContextSlot)
          : (options.multipleAccountsContextSlot ?? request.minContextSlot);
      return Promise.resolve({
        contextSlot,
        values: addresses.map((address) => (address in parsedAccounts ? parsedAccounts[address] ?? null : null)),
      });
    },
    getRecentWalletHistoryPage: async (request) => {
      stats.historyPageRequests.push(request);
      stats.currentHistoryInFlight += 1;
      stats.maxHistoryInFlight = Math.max(stats.maxHistoryInFlight, stats.currentHistoryInFlight);
      if (options.historyDelayMs !== undefined) {
        await delay(options.historyDelayMs);
      }
      stats.currentHistoryInFlight -= 1;
      if (options.failHistoryFor === request.walletAddress) {
        throw new Error(`forced history failure for ${request.walletAddress}`);
      }
      if (options.historyPager !== undefined) {
        return options.historyPager(request);
      }
      const rows = [...(options.recentHistory?.[request.walletAddress] ?? [])];
      if (options.historyOrder === 'reversed') {
        rows.reverse();
      }
      const start = request.paginationToken === null ? 0 : Number(request.paginationToken);
      if (request.paginationToken !== null && (!Number.isInteger(start) || start < 0)) {
        throw new Error('fake provider received a non-offset pagination token');
      }
      const slice = rows.slice(start, start + request.limit);
      const next = start + slice.length;
      return {
        transactions: slice,
        paginationToken: next < rows.length ? String(next) : null,
      };
    },
    getFirstObservedActivity: (request) => {
      stats.firstObservedRequests.push(request);
      return Promise.resolve(options.firstObserved?.[request.walletAddress] ?? null);
    },
  };
}

export function defaultResolvedAccounts(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    [TOKEN_ACCOUNTS[0]]: tokenAccountValue({ owner: WALLET_A, amountRaw: '400' }),
    [TOKEN_ACCOUNTS[1]]: tokenAccountValue({ owner: WALLET_A, amountRaw: '300' }),
    [WALLET_A]: ownerAccountValue(),
    ...overrides,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
