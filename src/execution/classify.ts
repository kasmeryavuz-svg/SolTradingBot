import type { ExecutionStatus } from './errors.js';
import type { ExecutionSimulationEvidence } from './types.js';
import type { FinalComputeLimitResult } from './compute.js';
import type { PriorityFeeResult } from './fee.js';

export function classifyExecutionPreflight(input: {
  mode: 'build' | 'simulate';
  providerValid: boolean;
  signerSupported: boolean;
  clusterMismatch: boolean;
  rpcUnavailable: boolean;
  firstSimulation: ExecutionSimulationEvidence | null;
  computeLimit: FinalComputeLimitResult | null;
  blockhashExpired: boolean;
  priorityFee: PriorityFeeResult | null;
  secondSimulation: ExecutionSimulationEvidence | null;
}): ExecutionStatus {
  if (!input.providerValid) {
    return 'provider_invalid_response';
  }
  if (!input.signerSupported) {
    return 'unsupported_signer_requirement';
  }
  if (input.clusterMismatch) {
    return 'cluster_mismatch';
  }
  if (input.rpcUnavailable) {
    return 'rpc_unavailable';
  }
  if (input.mode === 'build') {
    return 'build_validated';
  }
  if (input.firstSimulation === null || !input.firstSimulation.ok || input.firstSimulation.unitsConsumed === null) {
    return 'simulation_failed';
  }
  if (input.computeLimit === null || input.computeLimit.kind === 'blocked_compute_limit') {
    return 'blocked_compute_limit';
  }
  if (input.blockhashExpired) {
    return 'expired_blockhash';
  }
  if (input.priorityFee === null || input.priorityFee.kind === 'blocked_priority_fee_cap') {
    return 'blocked_priority_fee_cap';
  }
  if (
    input.secondSimulation === null ||
    !input.secondSimulation.ok ||
    input.secondSimulation.unitsConsumed === null ||
    input.secondSimulation.unitsConsumed > BigInt(input.computeLimit.finalLimit)
  ) {
    return 'simulation_failed';
  }
  return 'simulation_passed';
}
