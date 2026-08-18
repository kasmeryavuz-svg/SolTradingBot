import type { ExecutionIntent, ExecutionRpc, JupiterClient } from '../execution/types.js';
import { LIVE_SPEC_NAME, LIVE_SPEC_VERSION } from './constants.js';
import { LIVE_DEFINITION_FINGERPRINT } from './identity.js';
import { collectLivePreflight } from './preflight.js';
import type { LiveAttemptStore } from './persistence.js';
import { assertPublicValueHasNoWire } from './sanitize.js';
import type { LivePreviewReport, LiveRpc } from './types.js';

export async function executeLivePreview(input: {
  intent: ExecutionIntent;
  jupiter: JupiterClient;
  executionRpc: ExecutionRpc;
  liveRpc: LiveRpc;
  store?: LiveAttemptStore | null;
  nowMs?: number;
  network?: string;
  signal?: AbortSignal;
}): Promise<LivePreviewReport> {
  const context = await collectLivePreflight({
    intent: input.intent,
    jupiter: input.jupiter,
    executionRpc: input.executionRpc,
    liveRpc: input.liveRpc,
    store: input.store ?? null,
    nowMs: input.nowMs ?? Date.now(),
    requireSimulationPassed: false,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  const report: LivePreviewReport = {
    specVersion: LIVE_SPEC_VERSION,
    specName: LIVE_SPEC_NAME,
    liveDefinitionFingerprint: LIVE_DEFINITION_FINGERPRINT,
    previewOnly: true,
    noSign: true,
    noSend: true,
    network: input.network ?? 'mainnet-beta',
    takerAddress: context.intent.takerPublicKey,
    inputMint: context.intent.inputMint,
    outputMint: context.intent.outputMint,
    amountRaw: context.intent.amountRaw,
    quotedOutput: context.report.quote.outAmount,
    minimumOutputThreshold: context.report.quote.otherAmountThreshold,
    executionCandidateFingerprint: context.report.executionCandidateFingerprint,
    compiledMessageSha256: context.report.candidate.compiledMessageSha256,
    calculatedPriorityComponentLamports:
      context.report.fees?.calculatedPriorityFeeComponentLamports.toString() ?? null,
    rpcEstimatedTransactionFeeLamports:
      context.report.fees?.rpcEstimatedTransactionFeeLamports?.toString() ?? null,
    currentSolBalanceLamports: context.balanceLamports.toString(),
    lastValidBlockHeight: context.report.candidate.lastValidBlockHeight.toString(),
    remainingBlockHeightHeadroom: context.remainingHeadroom.toString(),
    dailyAttemptUsage: context.dailyUsage.attemptCount,
    dailyInputUsageLamports: context.dailyUsage.inputLamports.toString(),
    executionStatus: context.report.status,
    wouldBroadcast: false,
    message:
      'PREVIEW ONLY. NO SIGN. NO SEND. This is not a live reservation and not a landed trade.',
  };
  assertPublicValueHasNoWire(report);
  return report;
}
