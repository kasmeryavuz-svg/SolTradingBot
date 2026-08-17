import { createHash } from 'node:crypto';
import {
  EXECUTION_BLOCKHASH_SLOTS_TO_EXPIRY,
  EXECUTION_COMPUTE_UNIT_PRICE_PERCENTILE,
  EXECUTION_FOR_JITO_BUNDLE,
  EXECUTION_MAX_ACCOUNTS,
  EXECUTION_SLIPPAGE_BPS,
  EXECUTION_SPEC_VERSION,
} from './constants.js';
import { canonicalExecutionDefinition, type CanonicalExecutionDefinition } from './definition.js';
import type { ExecutionStatus } from './errors.js';
import type {
  ExecutionCandidate,
  ExecutionFeeEvidence,
  ExecutionIntent,
  ExecutionSimulationEvidence,
  NormalizedJupiterBuild,
} from './types.js';

function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

export function fingerprintExecutionDefinition(
  definition: CanonicalExecutionDefinition = canonicalExecutionDefinition(),
): string {
  return sha256Json(definition);
}

export const EXECUTION_DEFINITION_FINGERPRINT = fingerprintExecutionDefinition();

export function fingerprintExecutionIntent(intent: ExecutionIntent): string {
  return sha256Json({
    executionSpecVersion: EXECUTION_SPEC_VERSION,
    inputMint: intent.inputMint,
    outputMint: intent.outputMint,
    amountRaw: intent.amountRaw,
    takerPublicKey: intent.takerPublicKey,
  });
}

export function fingerprintJupiterBuild(input: {
  executionDefinitionFingerprint: string;
  executionIntentFingerprint: string;
  build: NormalizedJupiterBuild;
}): string {
  return sha256Json({
    executionDefinitionFingerprint: input.executionDefinitionFingerprint,
    executionIntentFingerprint: input.executionIntentFingerprint,
    providerContract: {
      slippageBps: EXECUTION_SLIPPAGE_BPS,
      maxAccounts: EXECUTION_MAX_ACCOUNTS,
      blockhashSlotsToExpiry: EXECUTION_BLOCKHASH_SLOTS_TO_EXPIRY,
      computeUnitPricePercentile: EXECUTION_COMPUTE_UNIT_PRICE_PERCENTILE,
      forJitoBundle: EXECUTION_FOR_JITO_BUNDLE,
    },
    quote: {
      inputMint: input.build.inputMint,
      outputMint: input.build.outputMint,
      inAmount: input.build.inAmount,
      outAmount: input.build.outAmount,
      otherAmountThreshold: input.build.otherAmountThreshold,
      swapMode: input.build.swapMode,
      slippageBps: input.build.slippageBps,
    },
    routePlan: input.build.routePlan.map((hop) => ({
      ammKey: hop.ammKey,
      inputMint: hop.inputMint,
      outputMint: hop.outputMint,
      inAmount: hop.inAmount,
      outAmount: hop.outAmount,
      bps: hop.bps,
    })),
    instructions: {
      computeUnitPrice: input.build.computeUnitPrice,
      setupInstructions: input.build.setupInstructions,
      swapInstruction: input.build.swapInstruction,
      cleanupInstruction: input.build.cleanupInstruction,
      otherInstructions: input.build.otherInstructions,
    },
    lookupTables: sortedLookupTables(input.build.lookupTables),
    blockhash: {
      blockhashBytes: input.build.blockhash.blockhashBytes,
      blockhashBase58: input.build.blockhash.blockhashBase58,
      lastValidBlockHeight: input.build.blockhash.lastValidBlockHeight.toString(),
      fetchedAt: input.build.blockhash.fetchedAt,
    },
    computeUnitPriceMicroLamports: input.build.computeUnitPriceMicroLamports.toString(),
  });
}

export function fingerprintExecutionCandidate(input: {
  executionDefinitionFingerprint: string;
  executionIntentFingerprint: string;
  jupiterBuildFingerprint: string;
  candidate: ExecutionCandidate;
}): string {
  return sha256Json({
    executionDefinitionFingerprint: input.executionDefinitionFingerprint,
    executionIntentFingerprint: input.executionIntentFingerprint,
    jupiterBuildFingerprint: input.jupiterBuildFingerprint,
    version: input.candidate.version,
    feePayer: input.candidate.feePayer,
    computeUnitLimit: input.candidate.computeUnitLimit,
    instructionOrder: input.candidate.instructionOrder,
    instructionCount: input.candidate.instructionCount,
    lookupTableCount: input.candidate.lookupTableCount,
    blockhashBase58: input.candidate.blockhashBase58,
    lastValidBlockHeight: input.candidate.lastValidBlockHeight.toString(),
    compiledMessageSha256: input.candidate.compiledMessageSha256,
    serializedTransactionBytes: input.candidate.serializedTransactionBytes,
  });
}

export function fingerprintExecutionSimulation(input: {
  executionCandidateFingerprint: string;
  observedGenesisHash: string | null;
  firstSimulation: ExecutionSimulationEvidence | null;
  finalComputeUnitLimit: number | null;
  secondSimulation: ExecutionSimulationEvidence | null;
  fees: ExecutionFeeEvidence | null;
  currentBlockHeightAfterFirst: bigint | null;
  currentBlockHeightBeforeFinal: bigint | null;
  lastValidBlockHeight: bigint | null;
  status: ExecutionStatus;
}): string {
  return sha256Json({
    executionCandidateFingerprint: input.executionCandidateFingerprint,
    observedGenesisHash: input.observedGenesisHash,
    firstSimulation: serializeSimulation(input.firstSimulation),
    finalComputeUnitLimit: input.finalComputeUnitLimit,
    secondSimulation: serializeSimulation(input.secondSimulation),
    fees:
      input.fees === null
        ? null
        : {
            computeUnitPriceMicroLamports: input.fees.computeUnitPriceMicroLamports.toString(),
            calculatedPriorityFeeComponentLamports: input.fees.calculatedPriorityFeeComponentLamports.toString(),
            maxPriorityFeeLamports: input.fees.maxPriorityFeeLamports.toString(),
            rpcEstimatedTransactionFeeLamports:
              input.fees.rpcEstimatedTransactionFeeLamports === null
                ? null
                : input.fees.rpcEstimatedTransactionFeeLamports.toString(),
          },
    currentBlockHeightAfterFirst:
      input.currentBlockHeightAfterFirst === null ? null : input.currentBlockHeightAfterFirst.toString(),
    currentBlockHeightBeforeFinal:
      input.currentBlockHeightBeforeFinal === null ? null : input.currentBlockHeightBeforeFinal.toString(),
    lastValidBlockHeight:
      input.lastValidBlockHeight === null ? null : input.lastValidBlockHeight.toString(),
    status: input.status,
  });
}

function serializeSimulation(evidence: ExecutionSimulationEvidence | null): unknown {
  if (evidence === null) {
    return null;
  }
  return {
    ok: evidence.ok,
    unitsConsumed: evidence.unitsConsumed === null ? null : evidence.unitsConsumed.toString(),
    errorSummary: evidence.errorSummary,
    logs: evidence.logs,
    failureKind: evidence.failureKind,
  };
}

function sortedLookupTables(
  tables: Readonly<Record<string, readonly string[]>>,
): Record<string, readonly string[]> {
  const sorted: Record<string, readonly string[]> = {};
  for (const key of Object.keys(tables).sort()) {
    const addresses = tables[key];
    if (addresses !== undefined) {
      sorted[key] = addresses;
    }
  }
  return sorted;
}
