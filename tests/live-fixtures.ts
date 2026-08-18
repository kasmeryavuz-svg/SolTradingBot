import { getBase58Decoder } from '@solana/kit';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { SOLANA_MAINNET_GENESIS_HASH } from '../src/execution/constants.js';
import type { ExecutionRpc, JupiterClient } from '../src/execution/types.js';
import { LIVE_SPEC_VERSION } from '../src/live/constants.js';
import { LiveError } from '../src/live/errors.js';
import { LIVE_DEFINITION_FINGERPRINT, liveAttemptId } from '../src/live/identity.js';
import { createLiveAttemptStore, type LiveAttemptInsert } from '../src/live/persistence.js';
import type { LiveRpc, LiveSignatureStatus, LiveTransactionReceipt } from '../src/live/types.js';
import { applyMigrations, openSqliteDatabase } from '../src/persistence/sqlite/index.js';
import { passingExecutionRpc, walletJupiterBuild } from './wallet-fixtures.js';

export function openMemoryLiveStore() {
  const database = openSqliteDatabase({ path: ':memory:', busyTimeoutMs: 1000 });
  applyMigrations(database);
  return {
    database,
    store: createLiveAttemptStore(database),
    close() {
      database.close();
    },
  };
}

export function openFileLiveStore(busyTimeoutMs = 5_000) {
  const dir = mkdtempSync(join(tmpdir(), 'l16-live-'));
  const path = join(dir, 'live.sqlite');
  const database = openSqliteDatabase({ path, busyTimeoutMs });
  applyMigrations(database);
  return {
    path,
    database,
    store: createLiveAttemptStore(database),
    openSecond() {
      const second = openSqliteDatabase({ path, busyTimeoutMs });
      return {
        database: second,
        store: createLiveAttemptStore(second),
        close() {
          second.close();
        },
      };
    },
    close() {
      database.close();
    },
  };
}

export function reserveLiveRow(overrides: Partial<LiveAttemptInsert> = {}): LiveAttemptInsert {
  const executionCandidateFingerprint = overrides.executionCandidateFingerprint ?? 'a'.repeat(64);
  return {
    attemptId: overrides.attemptId ?? liveAttemptId(executionCandidateFingerprint),
    liveSpecVersion: LIVE_SPEC_VERSION,
    liveDefinitionFingerprint: LIVE_DEFINITION_FINGERPRINT,
    createdAtMs: overrides.createdAtMs ?? Date.parse('2026-08-18T12:00:00.000Z'),
    takerAddress: overrides.takerAddress ?? 'GkwFnmMDvn3HGMpJpWBg8tgJxr3NxNvg3AXxvXVPbRGJ',
    inputMint: overrides.inputMint ?? 'So11111111111111111111111111111111111111112',
    outputMint: overrides.outputMint ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amountRaw: overrides.amountRaw ?? '1000000',
    executionDefinitionFingerprint:
      overrides.executionDefinitionFingerprint ?? '6c9bf5bd42a6137b21b8ed2f4c8939085c7b999add2013efbf7d63a8fc306fd0',
    executionIntentFingerprint: overrides.executionIntentFingerprint ?? 'b'.repeat(64),
    jupiterBuildFingerprint: overrides.jupiterBuildFingerprint ?? 'c'.repeat(64),
    executionCandidateFingerprint,
    compiledMessageSha256: overrides.compiledMessageSha256 ?? 'd'.repeat(64),
    walletDefinitionFingerprint: overrides.walletDefinitionFingerprint ?? null,
    walletSignerFingerprint: overrides.walletSignerFingerprint ?? null,
    walletSigningProofFingerprint: overrides.walletSigningProofFingerprint ?? null,
    status: overrides.status ?? 'reserved',
    expectedSignature: overrides.expectedSignature ?? null,
    rpcReturnedSignature: overrides.rpcReturnedSignature ?? null,
    signedWireSha256: overrides.signedWireSha256 ?? null,
    lastValidBlockHeight: overrides.lastValidBlockHeight ?? '1000',
    broadcastRiskAtMs: overrides.broadcastRiskAtMs ?? null,
    submittedAtMs: overrides.submittedAtMs ?? null,
    confirmedAtMs: overrides.confirmedAtMs ?? null,
    confirmationStatus: overrides.confirmationStatus ?? null,
    slot: overrides.slot ?? null,
    rpcEstimatedTransactionFeeLamports: overrides.rpcEstimatedTransactionFeeLamports ?? '5000',
    actualTransactionFeeLamports: overrides.actualTransactionFeeLamports ?? null,
    actualOutputRaw: overrides.actualOutputRaw ?? null,
    failureCode: overrides.failureCode ?? null,
    failureMessage: overrides.failureMessage ?? null,
    liveAttemptFingerprint: overrides.liveAttemptFingerprint ?? 'e'.repeat(64),
  };
}

export function dummyCanonicalSignature(fill = 2): string {
  return getBase58Decoder().decode(new Uint8Array(64).fill(fill));
}

export function deriveTxidFromWire(wireTransactionBase64: string): string {
  const bytes = Buffer.from(wireTransactionBase64, 'base64');
  if (bytes.byteLength < 65) {
    throw new Error('wire too short for a signature');
  }
  return getBase58Decoder().decode(bytes.subarray(1, 65));
}

export function liveJupiter(takerPublicKey: string): JupiterClient {
  return {
    build: () => Promise.resolve(walletJupiterBuild(takerPublicKey)),
  };
}

export function liveExecutionRpc(overrides: Partial<ExecutionRpc> = {}): ExecutionRpc {
  return passingExecutionRpc(overrides);
}

export type FakeLiveRpc = LiveRpc & {
  sendCount: number;
  acceptedWires: string[];
  lastGetBalanceCommitment: string | null;
  lastGetTransactionOptions: { commitment?: string } | null;
  lastSearchTransactionHistory: boolean | null;
  statusCalls: number;
  setStatus(status: LiveSignatureStatus | null): void;
  setHeight(height: bigint): void;
};

export function createFakeLiveRpc(
  options: {
    genesisHash?: string;
    height?: bigint;
    balanceLamports?: bigint;
    sendBehavior?: 'ok' | 'timeout' | 'mismatch' | 'reject' | 'hang' | 'malformed';
    mismatchSignature?: string;
    expireAfterSend?: boolean;
    expireHeight?: bigint;
    initialStatus?: LiveSignatureStatus | null;
    receipt?: LiveTransactionReceipt | null;
    receiptFromLastWire?: boolean;
    hangStatus?: boolean;
    hangReceipt?: boolean;
    takerAddress?: string;
    malformedSignature?: string;
  } = {},
): FakeLiveRpc {
  let height = options.height ?? 900n;
  let status: LiveSignatureStatus | null = options.initialStatus ?? null;
  const acceptedWires: string[] = [];
  const rpc: FakeLiveRpc = {
    sendCount: 0,
    acceptedWires,
    lastGetBalanceCommitment: null,
    lastGetTransactionOptions: null,
    lastSearchTransactionHistory: null,
    statusCalls: 0,
    setStatus(next) {
      status = next;
    },
    setHeight(next) {
      height = next;
    },
    getGenesisHash: () => Promise.resolve(options.genesisHash ?? SOLANA_MAINNET_GENESIS_HASH),
    getBlockHeight: () => Promise.resolve(height),
    getBalance: () => {
      rpc.lastGetBalanceCommitment = 'confirmed';
      return Promise.resolve(options.balanceLamports ?? 20_000_000n);
    },
    sendTransaction(wire) {
      rpc.sendCount += 1;
      acceptedWires.push(wire);
      if (options.expireAfterSend === true) {
        height = options.expireHeight ?? 1001n;
      }
      if (options.sendBehavior === 'hang') {
        return new Promise(() => {});
      }
      if (options.sendBehavior === 'reject') {
        return Promise.reject(
          new LiveError('Transaction simulation failed during preflight.', {
            code: 'broadcast_rejected',
          }),
        );
      }
      if (options.sendBehavior === 'timeout') {
        return Promise.reject(
          new LiveError('sendTransaction timed out.', { code: 'broadcast_outcome_unknown' }),
        );
      }
      if (options.sendBehavior === 'malformed') {
        return Promise.resolve(options.malformedSignature ?? ' not-a-signature ');
      }
      if (options.sendBehavior === 'mismatch') {
        return Promise.resolve(options.mismatchSignature ?? dummyCanonicalSignature(2));
      }
      return Promise.resolve(deriveTxidFromWire(wire));
    },
    getSignatureStatuses: (signatures, request) => {
      rpc.statusCalls += 1;
      rpc.lastSearchTransactionHistory = request?.searchTransactionHistory === true;
      if (options.hangStatus === true) {
        return new Promise(() => {});
      }
      if (status === null) {
        return Promise.resolve(signatures.map(() => null));
      }
      return Promise.resolve(signatures.map(() => status));
    },
    getTransaction: (_signature, request) => {
      rpc.lastGetTransactionOptions = request?.commitment === undefined ? {} : { commitment: request.commitment };
      if (options.hangReceipt === true) {
        return new Promise(() => {});
      }
      if (options.receipt !== undefined) {
        return Promise.resolve(options.receipt);
      }
      const wire = acceptedWires.at(-1) ?? null;
      return Promise.resolve({
        slot: '123',
        err: null,
        feeLamports: 5000n,
        transactionBase64: options.receiptFromLastWire === false ? 'AAAA' : wire,
        firstSignature: wire === null ? null : deriveTxidFromWire(wire),
        preTokenBalances: [],
        postTokenBalances: [
          {
            mint: USDC_MINT,
            owner: options.takerAddress ?? '',
            amountRaw: '1980000',
            accountIndex: 1,
          },
        ],
      });
    },
  };
  return rpc;
}

export function takingReceipt(taker: string, wire: string | null = null): LiveTransactionReceipt {
  return {
    slot: '123',
    err: null,
    feeLamports: 5000n,
    transactionBase64: wire,
    firstSignature: wire === null ? null : deriveTxidFromWire(wire),
    preTokenBalances: [],
    postTokenBalances: [{ mint: USDC_MINT, owner: taker, amountRaw: '1980000', accountIndex: 1 }],
  };
}

export function livePublicEnv(
  taker: string,
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    TRADING_ENABLED: 'true',
    LIVE_BROADCAST_ENABLED: 'true',
    SOLANA_NETWORK: 'mainnet-beta',
    DATABASE_ENABLED: 'true',
    DATABASE_PATH: ':memory:',
    EXECUTION_TAKER_PUBKEY: taker,
    EXECUTION_INPUT_MINT: WRAPPED_SOL_MINT,
    EXECUTION_OUTPUT_MINT: USDC_MINT,
    EXECUTION_AMOUNT_RAW: '1000000',
    ...overrides,
  };
}

export function instantClock(): { nowMs: () => number; sleep: (ms: number) => Promise<void>; advance(ms: number): void } {
  let current = 1_700_000_000_000;
  return {
    nowMs: () => current,
    sleep: (ms) => {
      current += ms;
      return Promise.resolve();
    },
    advance(ms) {
      current += ms;
    },
  };
}
