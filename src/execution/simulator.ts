import { COMPUTE_UNIT_HARD_MAX, SOLANA_MAINNET_GENESIS_HASH } from './constants.js';
import { calculateFinalComputeLimit } from './compute.js';
import { classifyPriorityFee, isBlockhashExpired } from './fee.js';
import { classifyExecutionPreflight } from './classify.js';
import { compileUnsignedCandidate } from './transaction.js';
import type {
  ExecutionFeeEvidence,
  ExecutionRpc,
  ExecutionSimulateReport,
  NormalizedJupiterBuild,
} from './types.js';
import { EXECUTION_SPEC_NAME, EXECUTION_SPEC_VERSION } from './constants.js';
import { EXECUTION_DEFINITION_FINGERPRINT } from './identity.js';
import {
  fingerprintExecutionCandidate,
  fingerprintExecutionIntent,
  fingerprintExecutionSimulation,
  fingerprintJupiterBuild,
} from './identity.js';
import type { ExecutionIntent } from './types.js';

export async function simulateNormalizedBuild(input: {
  intent: ExecutionIntent;
  build: NormalizedJupiterBuild;
  rpc: ExecutionRpc;
  signal?: AbortSignal;
}): Promise<ExecutionSimulateReport> {
  const executionIntentFingerprint = fingerprintExecutionIntent(input.intent);
  const jupiterBuildFingerprint = fingerprintJupiterBuild({
    executionDefinitionFingerprint: EXECUTION_DEFINITION_FINGERPRINT,
    executionIntentFingerprint,
    build: input.build,
  });

  let observedGenesisHash: string | null = null;
  let clusterMismatch = false;
  let rpcUnavailable = false;
  try {
    observedGenesisHash = await input.rpc.getGenesisHash(input.signal);
    clusterMismatch = observedGenesisHash !== SOLANA_MAINNET_GENESIS_HASH;
  } catch {
    rpcUnavailable = true;
  }

  const firstCompiled = compileUnsignedCandidate(input.build, {
    feePayer: input.intent.takerPublicKey,
    computeUnitLimit: COMPUTE_UNIT_HARD_MAX,
    includeComputeUnitPrice: false,
  });

  const firstSimulation =
    clusterMismatch || rpcUnavailable
      ? null
      : await input.rpc.simulateTransaction(firstCompiled.wireTransactionBase64, {
          replaceRecentBlockhash: true,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        });

  const computeLimit =
    firstSimulation !== null && firstSimulation.ok && firstSimulation.unitsConsumed !== null
      ? calculateFinalComputeLimit(firstSimulation.unitsConsumed)
      : null;

  const currentBlockHeightAfterFirst = await readBlockHeight(input.rpc, input.signal);
  if (currentBlockHeightAfterFirst === null && !clusterMismatch) {
    rpcUnavailable = true;
  }
  let blockhashExpired =
    currentBlockHeightAfterFirst !== null &&
    isBlockhashExpired(currentBlockHeightAfterFirst, input.build.blockhash.lastValidBlockHeight);

  const priorityFee =
    computeLimit?.kind === 'ok'
      ? classifyPriorityFee(input.build.computeUnitPriceMicroLamports, computeLimit.finalLimit)
      : null;

  let secondSimulation = null;
  let finalCompiled = firstCompiled;
  let fees: ExecutionFeeEvidence | null = null;
  let currentBlockHeightBeforeFinal: bigint | null = null;

  if (
    !clusterMismatch &&
    !rpcUnavailable &&
    firstSimulation !== null &&
    firstSimulation.ok &&
    computeLimit?.kind === 'ok' &&
    !blockhashExpired &&
    priorityFee?.kind === 'ok'
  ) {
    currentBlockHeightBeforeFinal = await readBlockHeight(input.rpc, input.signal);
    if (currentBlockHeightBeforeFinal === null) {
      rpcUnavailable = true;
    } else if (isBlockhashExpired(currentBlockHeightBeforeFinal, input.build.blockhash.lastValidBlockHeight)) {
      blockhashExpired = true;
    } else {
      finalCompiled = compileUnsignedCandidate(input.build, {
        feePayer: input.intent.takerPublicKey,
        computeUnitLimit: computeLimit.finalLimit,
        includeComputeUnitPrice: true,
      });
      secondSimulation = await input.rpc.simulateTransaction(finalCompiled.wireTransactionBase64, {
        replaceRecentBlockhash: false,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      let rpcEstimatedTransactionFeeLamports: bigint | null;
      try {
        rpcEstimatedTransactionFeeLamports = await input.rpc.getFeeForMessage(
          finalCompiled.messageBase64,
          input.signal,
        );
      } catch {
        rpcEstimatedTransactionFeeLamports = null;
      }
      fees = {
        computeUnitPriceMicroLamports: input.build.computeUnitPriceMicroLamports,
        calculatedPriorityFeeComponentLamports: priorityFee.calculatedPriorityFeeComponentLamports,
        maxPriorityFeeLamports: priorityFee.maxPriorityFeeLamports,
        rpcEstimatedTransactionFeeLamports,
      };
    }
  } else if (priorityFee !== null) {
    fees = {
      computeUnitPriceMicroLamports: input.build.computeUnitPriceMicroLamports,
      calculatedPriorityFeeComponentLamports: priorityFee.calculatedPriorityFeeComponentLamports,
      maxPriorityFeeLamports: priorityFee.maxPriorityFeeLamports,
      rpcEstimatedTransactionFeeLamports: null,
    };
  }

  const status = classifyExecutionPreflight({
    mode: 'simulate',
    providerValid: true,
    signerSupported: true,
    clusterMismatch,
    rpcUnavailable,
    firstSimulation,
    computeLimit,
    blockhashExpired,
    priorityFee,
    secondSimulation,
  });

  const executionCandidateFingerprint = fingerprintExecutionCandidate({
    executionDefinitionFingerprint: EXECUTION_DEFINITION_FINGERPRINT,
    executionIntentFingerprint,
    jupiterBuildFingerprint,
    candidate: finalCompiled.candidate,
  });
  const executionSimulationFingerprint = fingerprintExecutionSimulation({
    executionCandidateFingerprint,
    observedGenesisHash,
    firstSimulation,
    finalComputeUnitLimit: computeLimit?.kind === 'ok' ? computeLimit.finalLimit : null,
    secondSimulation,
    fees,
    currentBlockHeightAfterFirst,
    currentBlockHeightBeforeFinal,
    lastValidBlockHeight: input.build.blockhash.lastValidBlockHeight,
    status,
  });

  return {
    specVersion: EXECUTION_SPEC_VERSION,
    specName: EXECUTION_SPEC_NAME,
    executionDefinitionFingerprint: EXECUTION_DEFINITION_FINGERPRINT,
    executionIntentFingerprint,
    jupiterBuildFingerprint,
    executionCandidateFingerprint,
    executionSimulationFingerprint,
    intent: input.intent,
    quote: {
      outAmount: input.build.outAmount,
      otherAmountThreshold: input.build.otherAmountThreshold,
      slippageBps: input.build.slippageBps,
      routeHopCount: input.build.routePlan.length,
      dexLabels: input.build.routePlan.map((hop) => hop.label),
    },
    computeUnitPriceMicroLamports: input.build.computeUnitPriceMicroLamports,
    candidate: finalCompiled.candidate,
    observedGenesisHash,
    currentBlockHeight: currentBlockHeightBeforeFinal ?? currentBlockHeightAfterFirst,
    currentBlockHeightAfterFirst,
    currentBlockHeightBeforeFinal,
    firstSimulation,
    finalComputeUnitLimit: computeLimit?.kind === 'ok' ? computeLimit.finalLimit : null,
    secondSimulation,
    fees,
    providerValid: true,
    status,
    message: simulateStatusMessage(status),
  };
}

async function readBlockHeight(rpc: ExecutionRpc, signal?: AbortSignal): Promise<bigint | null> {
  try {
    return await rpc.getBlockHeight(signal);
  } catch {
    return null;
  }
}

function simulateStatusMessage(status: ExecutionSimulateReport['status']): string {
  switch (status) {
    case 'simulation_passed':
      return 'Unsigned preflight candidate is simulation-valid. This is not a landed trade and not a profit result.';
    case 'simulation_failed':
      return 'Provider route was structurally usable, but Solana simulation did not pass.';
    case 'blocked_compute_limit':
      return 'Simulated compute-unit consumption is at or above the 1,400,000 hard max.';
    case 'blocked_priority_fee_cap':
      return 'Calculated priority-fee component exceeds the e14 1,000,000 lamport cap.';
    case 'expired_blockhash':
      return 'Jupiter blockhash is already past lastValidBlockHeight. Re-run the command explicitly.';
    case 'cluster_mismatch':
      return 'Connected RPC genesis hash is not official Solana mainnet-beta. The candidate is not simulation_passed.';
    case 'rpc_unavailable':
      return 'Solana RPC cluster identity or block height was unavailable. The candidate is not simulation_passed.';
    default:
      return 'Preflight did not produce a simulation-passed candidate.';
  }
}
