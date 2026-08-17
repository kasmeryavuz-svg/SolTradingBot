import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { COMPUTE_BUDGET_PROGRAM_ID } from '../src/execution/constants.js';
import type { ExecutionIntent } from '../src/execution/types.js';

export const EXECUTION_TAKER = 'GkwFnmMDvn3HGMpJpWBg8tgJxr3NxNvg3AXxvXVPbRGJ';
export const EXECUTION_AMM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const JUPITER_SECRET = 'SUPER_SECRET_JUP_KEY_123';

export function executionIntent(overrides: Partial<ExecutionIntent> = {}): ExecutionIntent {
  return {
    inputMint: WRAPPED_SOL_MINT,
    outputMint: USDC_MINT,
    amountRaw: '1000000',
    takerPublicKey: EXECUTION_TAKER,
    ...overrides,
  };
}

export function cuPriceInstructionData(microLamports: bigint): string {
  const data = Buffer.alloc(9);
  data.writeUInt8(3, 0);
  data.writeBigUInt64LE(microLamports, 1);
  return data.toString('base64');
}

export function cuLimitInstructionData(units: number): string {
  const data = Buffer.alloc(5);
  data.writeUInt8(2, 0);
  data.writeUInt32LE(units, 1);
  return data.toString('base64');
}

export function instruction(programId: string, data: string, accounts: unknown[] = []) {
  return { programId, accounts, data };
}

export function validJupiterBuild(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const intent = executionIntent();
  return {
    inputMint: intent.inputMint,
    outputMint: intent.outputMint,
    inAmount: intent.amountRaw,
    outAmount: '2000000',
    otherAmountThreshold: '1980000',
    swapMode: 'ExactIn',
    slippageBps: 100,
    routePlan: [
      {
        percent: 100,
        bps: 10000,
        swapInfo: {
          ammKey: EXECUTION_AMM,
          label: 'Raydium',
          inputMint: intent.inputMint,
          outputMint: intent.outputMint,
          inAmount: intent.amountRaw,
          outAmount: '2000000',
        },
      },
    ],
    computeBudgetInstructions: [
      instruction(COMPUTE_BUDGET_PROGRAM_ID, cuPriceInstructionData(1000n)),
    ],
    setupInstructions: [
      instruction(TOKEN_PROGRAM, 'AQID', [
        { pubkey: intent.takerPublicKey, isWritable: true, isSigner: true },
      ]),
    ],
    swapInstruction: instruction(EXECUTION_AMM, 'BQID', [
      { pubkey: intent.takerPublicKey, isWritable: true, isSigner: true },
      { pubkey: intent.inputMint, isWritable: false, isSigner: false },
    ]),
    cleanupInstruction: null,
    otherInstructions: [],
    tipInstruction: null,
    addressesByLookupTableAddress: null,
    blockhashWithMetadata: {
      blockhash: Array.from({ length: 32 }, (_, index) => (index + 1) % 256),
      lastValidBlockHeight: 1_000,
      fetchedAt: '2026-08-17T21:00:00.000Z',
    },
    ...overrides,
  };
}

export function readerFromBytes(bytes: Uint8Array): {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void> | void;
} {
  let consumed = false;
  let cancelled = false;
  return {
    read() {
      if (cancelled || consumed) {
        return Promise.resolve({ done: true });
      }
      consumed = true;
      return Promise.resolve({ done: false, value: bytes });
    },
    cancel() {
      cancelled = true;
    },
  };
}

export function jsonFetchResponse(
  payload: unknown,
  status = 200,
): {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  body: { getReader: () => ReturnType<typeof readerFromBytes> };
  arrayBuffer: () => Promise<Uint8Array>;
} {
  const bytes = new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload));
  return {
    status,
    ok: status === 200,
    headers: {
      get(name: string) {
        const key = name.toLowerCase();
        if (key === 'content-type') {
          return 'application/json';
        }
        if (key === 'content-length') {
          return String(bytes.byteLength);
        }
        return null;
      },
    },
    body: {
      getReader: () => readerFromBytes(bytes),
    },
    arrayBuffer: () => Promise.resolve(bytes),
  };
}

export function publicExecutionEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    TRADING_ENABLED: 'false',
    SOLANA_NETWORK: 'mainnet-beta',
    EXECUTION_TAKER_PUBKEY: EXECUTION_TAKER,
    EXECUTION_INPUT_MINT: WRAPPED_SOL_MINT,
    EXECUTION_OUTPUT_MINT: USDC_MINT,
    EXECUTION_AMOUNT_RAW: '1000000',
    ...overrides,
  };
}
