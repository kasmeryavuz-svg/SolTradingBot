import type { ExecutionStatus } from './errors.js';

export type ExecutionIntent = {
  readonly inputMint: string;
  readonly outputMint: string;
  readonly amountRaw: string;
  readonly takerPublicKey: string;
};

export type JupiterBuildRequest = {
  readonly inputMint: string;
  readonly outputMint: string;
  readonly amount: string;
  readonly taker: string;
  readonly slippageBps: '100';
  readonly maxAccounts: '64';
  readonly blockhashSlotsToExpiry: '150';
  readonly computeUnitPricePercentile: 'high';
  readonly forJitoBundle: 'false';
};

export type NormalizedAccountMeta = {
  readonly pubkey: string;
  readonly isWritable: boolean;
  readonly isSigner: boolean;
};

export type NormalizedInstruction = {
  readonly programId: string;
  readonly accounts: readonly NormalizedAccountMeta[];
  readonly dataBase64: string;
};

export type NormalizedRouteHop = {
  readonly ammKey: string;
  readonly label: string;
  readonly inputMint: string;
  readonly outputMint: string;
  readonly inAmount: string;
  readonly outAmount: string;
  readonly bps: number;
};

export type NormalizedLookupTables = Readonly<Record<string, readonly string[]>>;

export type NormalizedBlockhashMetadata = {
  readonly blockhashBytes: readonly number[];
  readonly blockhashBase58: string;
  readonly lastValidBlockHeight: bigint;
  readonly fetchedAt: string;
};

export type NormalizedJupiterBuild = {
  readonly inputMint: string;
  readonly outputMint: string;
  readonly inAmount: string;
  readonly outAmount: string;
  readonly otherAmountThreshold: string;
  readonly swapMode: 'ExactIn';
  readonly slippageBps: 100;
  readonly routePlan: readonly NormalizedRouteHop[];
  readonly computeUnitPrice: NormalizedInstruction;
  readonly computeUnitPriceMicroLamports: bigint;
  readonly setupInstructions: readonly NormalizedInstruction[];
  readonly swapInstruction: NormalizedInstruction;
  readonly cleanupInstruction: NormalizedInstruction | null;
  readonly otherInstructions: readonly NormalizedInstruction[];
  readonly lookupTables: NormalizedLookupTables;
  readonly blockhash: NormalizedBlockhashMetadata;
};

export type ExecutionSimulationEvidence = {
  readonly ok: boolean;
  readonly unitsConsumed: bigint | null;
  readonly errorSummary: string | null;
  readonly logs: readonly string[];
  readonly failureKind:
    | 'none'
    | 'program_error'
    | 'insufficient_funds'
    | 'timeout'
    | 'account_not_found'
    | 'expired_blockhash'
    | 'null_units'
    | 'zero_units'
    | 'unknown';
};

export type ExecutionFeeEvidence = {
  readonly computeUnitPriceMicroLamports: bigint;
  readonly calculatedPriorityFeeComponentLamports: bigint;
  readonly maxPriorityFeeLamports: bigint;
  readonly rpcEstimatedTransactionFeeLamports: bigint | null;
};

export type ExecutionCandidate = {
  readonly version: 0;
  readonly feePayer: string;
  readonly computeUnitLimit: number;
  readonly instructionOrder: readonly string[];
  readonly instructionCount: number;
  readonly lookupTableCount: number;
  readonly blockhashBase58: string;
  readonly lastValidBlockHeight: bigint;
  readonly compiledMessageSha256: string;
  readonly serializedTransactionBytes: number;
};

export type ExecutionBuildReport = {
  readonly specVersion: string;
  readonly specName: string;
  readonly executionDefinitionFingerprint: string;
  readonly executionIntentFingerprint: string;
  readonly jupiterBuildFingerprint: string;
  readonly executionCandidateFingerprint: string;
  readonly intent: ExecutionIntent;
  readonly quote: {
    readonly outAmount: string;
    readonly otherAmountThreshold: string;
    readonly slippageBps: 100;
    readonly routeHopCount: number;
    readonly dexLabels: readonly string[];
  };
  readonly computeUnitPriceMicroLamports: bigint;
  readonly candidate: ExecutionCandidate;
  readonly status: ExecutionStatus;
  readonly message: string;
};

export type ExecutionSimulateReport = ExecutionBuildReport & {
  readonly executionSimulationFingerprint: string;
  readonly observedGenesisHash: string | null;
  readonly currentBlockHeight: bigint | null;
  readonly currentBlockHeightAfterFirst: bigint | null;
  readonly currentBlockHeightBeforeFinal: bigint | null;
  readonly firstSimulation: ExecutionSimulationEvidence | null;
  readonly finalComputeUnitLimit: number | null;
  readonly secondSimulation: ExecutionSimulationEvidence | null;
  readonly fees: ExecutionFeeEvidence | null;
  readonly providerValid: boolean;
};

export type ExecutionStatusReport = {
  readonly specVersion: string;
  readonly specName: string;
  readonly executionDefinitionFingerprint: string;
  readonly checkpoint: string;
  readonly publicConfig: {
    readonly takerPublicKey: string | null;
    readonly inputMint: string | null;
    readonly outputMint: string | null;
    readonly amountRaw: string | null;
    readonly providerTimeoutMs: number;
    readonly jupiterApiKeyConfigured: boolean;
    readonly requiredFieldsPresent: boolean;
    readonly missingFields: readonly string[];
  };
  readonly network: string;
  readonly mainnetGate: 'pass' | 'blocked';
  readonly signing: 'unavailable';
  readonly wallet: 'unavailable';
  readonly broadcast: 'unavailable';
  readonly jitoSend: 'unavailable';
  readonly tradingEnabled: boolean;
};

export type ExecutionBodyReader = {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(): Promise<void> | void;
};

export type ExecutionFetchLike = (
  input: string,
  init: {
    method: 'GET';
    headers: Record<string, string>;
    signal: AbortSignal;
    redirect: 'error';
  },
) => Promise<{
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  body?: { getReader(): ExecutionBodyReader } | null;
  arrayBuffer?: () => Promise<ArrayBuffer | Uint8Array>;
}>;

export type ExecutionRpc = {
  getGenesisHash(signal?: AbortSignal): Promise<string>;
  getBlockHeight(signal?: AbortSignal): Promise<bigint>;
  simulateTransaction(
    wireTransactionBase64: string,
    options: { replaceRecentBlockhash: boolean; signal?: AbortSignal },
  ): Promise<ExecutionSimulationEvidence>;
  getFeeForMessage(messageBase64: string, signal?: AbortSignal): Promise<bigint | null>;
};

export type JupiterClient = {
  build(request: JupiterBuildRequest): Promise<unknown>;
};
