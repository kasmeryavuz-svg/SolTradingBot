import { createHash } from 'node:crypto';
import { createKeyPairSignerFromPrivateKeyBytes, getAddressEncoder, getBase58Decoder } from '@solana/kit';
import { WRAPPED_SOL_MINT } from '../src/config/index.js';
import { SOLANA_MAINNET_GENESIS_HASH } from '../src/execution/constants.js';
import type { ExecutionIntent, ExecutionRpc } from '../src/execution/types.js';
import type { TerminalAdapter } from '../src/wallet/secret-input.js';
import { EXECUTION_AMM, TOKEN_PROGRAM, executionIntent, instruction, validJupiterBuild } from './execution-fixtures.js';

/** TEST FIXTURE — NO FUNDS. PUBLIC / COMPROMISED. Never fund this derived address. */
export const TEST_WALLET_FIXTURE_LABEL = 'SolTradingBot w15_v1 TEST FIXTURE — NO FUNDS';
/** TEST FIXTURE — NO FUNDS. PUBLIC / COMPROMISED. Second intentionally public key for mismatch tests. */
export const TEST_WALLET_OTHER_LABEL = 'SolTradingBot w15_v1 TEST FIXTURE OTHER — NO FUNDS';

export type TestWalletFixture = {
  readonly label: string;
  readonly address: string;
  readonly secretBytes: Uint8Array;
  readonly secretBase58: string;
};

const cache = new Map<string, Promise<TestWalletFixture>>();

export function loadTestWalletFixture(kind: 'primary' | 'other' = 'primary'): Promise<TestWalletFixture> {
  const label = kind === 'primary' ? TEST_WALLET_FIXTURE_LABEL : TEST_WALLET_OTHER_LABEL;
  const existing = cache.get(label);
  if (existing !== undefined) {
    return existing;
  }
  const created = deriveTestWalletFixture(label);
  cache.set(label, created);
  return created;
}

async function deriveTestWalletFixture(label: string): Promise<TestWalletFixture> {
  const seed = new Uint8Array(createHash('sha256').update(label, 'utf8').digest());
  const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
  const publicKeyBytes = new Uint8Array(getAddressEncoder().encode(signer.address));
  const secretBytes = new Uint8Array(64);
  secretBytes.set(seed, 0);
  secretBytes.set(publicKeyBytes, 32);
  return {
    label,
    address: signer.address,
    secretBytes,
    secretBase58: getBase58Decoder().decode(secretBytes),
  };
}

export function walletExecutionIntent(takerPublicKey: string): ExecutionIntent {
  return executionIntent({ takerPublicKey });
}

export function walletJupiterBuild(takerPublicKey: string, overrides: Record<string, unknown> = {}) {
  return validJupiterBuild({
    setupInstructions: [
      instruction(TOKEN_PROGRAM, 'AQID', [{ pubkey: takerPublicKey, isWritable: true, isSigner: true }]),
    ],
    swapInstruction: instruction(EXECUTION_AMM, 'BQID', [
      { pubkey: takerPublicKey, isWritable: true, isSigner: true },
      { pubkey: WRAPPED_SOL_MINT, isWritable: false, isSigner: false },
    ]),
    ...overrides,
  });
}

export function passingExecutionRpc(overrides: Partial<ExecutionRpc> = {}): ExecutionRpc {
  return {
    getGenesisHash: () => Promise.resolve(SOLANA_MAINNET_GENESIS_HASH),
    getBlockHeight: () => Promise.resolve(900n),
    simulateTransaction: () =>
      Promise.resolve({
        ok: true,
        unitsConsumed: 100_000n,
        errorSummary: null,
        logs: [],
        failureKind: 'none',
      }),
    getFeeForMessage: () => Promise.resolve(5000n),
    ...overrides,
  };
}

export function createFakeTerminal(
  options: {
    isTTY?: boolean;
    stdoutIsTTY?: boolean;
    stderrIsTTY?: boolean;
    initialRaw?: boolean;
    initialPaused?: boolean;
  } = {},
): {
  adapter: TerminalAdapter;
  writes: string[];
  rawMode: boolean;
  rawModeHistory: boolean[];
  paused: boolean;
  push(chunk: unknown): void;
} {
  const stdinIsTTY = options.isTTY ?? true;
  const stdoutIsTTY = options.stdoutIsTTY ?? stdinIsTTY;
  const stderrIsTTY = options.stderrIsTTY ?? stdinIsTTY;
  const writes: string[] = [];
  const rawModeHistory: boolean[] = [];
  let rawMode = options.initialRaw ?? false;
  let paused = options.initialPaused ?? true;
  let listener: ((chunk: string | Uint8Array) => void) | undefined;
  let listenerCount = 0;

  return {
    writes,
    get rawMode() {
      return rawMode;
    },
    rawModeHistory,
    get paused() {
      return paused;
    },
    push(chunk: unknown) {
      listener?.(chunk as string | Uint8Array);
    },
    adapter: {
      get stdinIsTTY() {
        return stdinIsTTY;
      },
      get stdoutIsTTY() {
        return stdoutIsTTY;
      },
      get stderrIsTTY() {
        return stderrIsTTY;
      },
      get isRaw() {
        return rawMode;
      },
      get isPaused() {
        return paused;
      },
      get dataListenerCount() {
        return listenerCount;
      },
      setRawMode(enabled: boolean) {
        rawMode = enabled;
        rawModeHistory.push(enabled);
      },
      write(text: string) {
        writes.push(text);
      },
      resume() {
        paused = false;
      },
      pause() {
        paused = true;
      },
      onData(next) {
        listener = next;
        listenerCount += 1;
        return () => {
          if (listener === next) {
            listener = undefined;
          }
          listenerCount -= 1;
        };
      },
    },
  };
}

export async function feedHiddenSecret(terminal: ReturnType<typeof createFakeTerminal>, secret: string): Promise<void> {
  await Promise.resolve();
  terminal.push(secret);
  terminal.push('\r');
}
