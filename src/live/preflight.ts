import { SOLANA_MAINNET_GENESIS_HASH } from '../execution/constants.js';
import { ExecutionError } from '../execution/errors.js';
import { buildJupiterRequest } from '../execution/jupiter-request.js';
import { validateJupiterBuild } from '../execution/jupiter-validate.js';
import { simulateNormalizedBuildWithFinalCompiled } from '../execution/simulator.js';
import type { CompiledUnsignedCandidate } from '../execution/transaction.js';
import type { ExecutionIntent, ExecutionRpc, ExecutionSimulateReport, JupiterClient } from '../execution/types.js';
import { LIVE_REQUIRED_MAINNET_GENESIS_HASH } from './constants.js';
import { LiveError } from './errors.js';
import { assertLiveIntent } from './gates.js';
import { fingerprintLiveAttempt, liveAttemptId, LIVE_DEFINITION_FINGERPRINT } from './identity.js';
import {
  assertDailyCaps,
  assertHeadroomBeforeConfirm,
  assertLiveBalance,
  assertLiveFeeCaps,
  remainingBlockHeightHeadroom,
} from './limits.js';
import type { LiveAttemptStore } from './persistence.js';
import type { LiveDailyUsage, LiveRpc } from './types.js';

export type LivePreflightContext = {
  readonly intent: ExecutionIntent;
  readonly amountLamports: bigint;
  readonly report: ExecutionSimulateReport;
  readonly compiled: CompiledUnsignedCandidate;
  readonly balanceLamports: bigint;
  readonly currentHeight: bigint;
  readonly remainingHeadroom: bigint;
  readonly dailyUsage: LiveDailyUsage;
  readonly attemptId: string;
  readonly liveAttemptFingerprint: string;
};

export async function collectLivePreflight(input: {
  intent: ExecutionIntent;
  jupiter: JupiterClient;
  executionRpc: ExecutionRpc;
  liveRpc: LiveRpc;
  store: LiveAttemptStore | null;
  nowMs: number;
  requireSimulationPassed: boolean;
  signal?: AbortSignal;
}): Promise<LivePreflightContext> {
  const amountLamports = assertLiveIntent(input.intent);
  const dailyUsage =
    input.store === null
      ? { utcDay: new Date(input.nowMs).toISOString().slice(0, 10), attemptCount: 0, inputLamports: 0n }
      : input.store.dailyUsage(input.intent.takerPublicKey, input.nowMs);
  if (input.store !== null) {
    assertDailyCaps(dailyUsage, amountLamports);
  }

  let payload: unknown;
  try {
    payload = await input.jupiter.build(buildJupiterRequest(input.intent));
  } catch (error: unknown) {
    if (error instanceof ExecutionError) {
      throw new LiveError(error.message, { cause: error, code: 'preflight_not_passed' });
    }
    throw error;
  }
  const build = validateJupiterBuild(payload, input.intent);
  const artifacts = await simulateNormalizedBuildWithFinalCompiled({
    intent: input.intent,
    build,
    rpc: input.executionRpc,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  const report = artifacts.report;
  const compiled = artifacts.finalCompiled;

  if (report.observedGenesisHash !== null && report.observedGenesisHash !== LIVE_REQUIRED_MAINNET_GENESIS_HASH) {
    throw new LiveError('Connected RPC genesis hash is not official Solana mainnet-beta.', {
      code: 'unsupported_network',
    });
  }
  if (report.observedGenesisHash === SOLANA_MAINNET_GENESIS_HASH && report.status === 'cluster_mismatch') {
    throw new LiveError('Connected RPC genesis hash is not official Solana mainnet-beta.', {
      code: 'unsupported_network',
    });
  }

  if (input.requireSimulationPassed && report.status !== 'simulation_passed') {
    throw new LiveError(
      `l16_v1 requires e14 simulation_passed. Observed: ${report.status}.`,
      { code: 'preflight_not_passed' },
    );
  }

  const fees = input.requireSimulationPassed ? assertLiveFeeCaps(report.fees) : report.fees;
  const currentHeight = await input.liveRpc.getBlockHeight(input.signal);
  const lastValid = report.candidate.lastValidBlockHeight;
  const remainingHeadroom = input.requireSimulationPassed
    ? assertHeadroomBeforeConfirm(currentHeight, lastValid)
    : remainingBlockHeightHeadroom(currentHeight, lastValid);
  const balanceLamports = await input.liveRpc.getBalance(input.intent.takerPublicKey, input.signal);
  if (input.requireSimulationPassed && fees !== null && fees.rpcEstimatedTransactionFeeLamports !== null) {
    assertLiveBalance({
      balanceLamports,
      amountLamports,
      rpcFeeLamports: fees.rpcEstimatedTransactionFeeLamports,
    });
  }

  const attemptId = liveAttemptId(report.executionCandidateFingerprint);
  return {
    intent: input.intent,
    amountLamports,
    report,
    compiled,
    balanceLamports,
    currentHeight,
    remainingHeadroom,
    dailyUsage,
    attemptId,
    liveAttemptFingerprint: fingerprintLiveAttempt({
      liveDefinitionFingerprint: LIVE_DEFINITION_FINGERPRINT,
      executionCandidateFingerprint: report.executionCandidateFingerprint,
      attemptId,
    }),
  };
}
