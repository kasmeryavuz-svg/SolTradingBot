import { abbreviateFingerprint, abbreviatePublicKey } from '../execution/format.js';
import type { LiveHistoryEntry, LivePreviewReport, LiveReceiptReport, LiveStatusReport } from './types.js';

export function formatLiveStatusLines(report: LiveStatusReport): string[] {
  return [
    'LIVE STATUS',
    'MANUAL / HARD-CAPPED ONLY',
    'NO AUTOMATIC TRADING',
    '',
    `Spec: ${report.specVersion}`,
    `Name: ${report.specName}`,
    `Definition fingerprint: ${report.liveDefinitionFingerprint}`,
    `Checkpoint: ${report.checkpoint}`,
    '',
    `Pair: ${report.pair}`,
    `Max input per attempt: ${report.maxInputLamportsPerAttempt} lamports`,
    `Max daily broadcast input: ${report.maxDailyBroadcastInputLamports} lamports`,
    `Max attempts/day: ${String(report.maxAttemptsPerUtcDay)}`,
    `Broadcast provider: ${report.broadcastProvider}`,
    `Jito: ${report.jito}`,
    `TRADING_ENABLED: ${report.tradingEnabled ? 'true' : 'false'}`,
    `LIVE_BROADCAST_ENABLED: ${report.liveBroadcastEnabled ? 'true' : 'false'}`,
    `Wallet: ${report.wallet}`,
    `Automatic trading: ${report.automaticTrading}`,
    `Dashboard live controls: ${report.dashboardLiveControls}`,
    '',
    'l16_v1 can transmit real funds only through live:execute after every gate.',
    'npm run dev does not send, prompt, or start live polling.',
  ];
}

export function formatLivePreviewLines(report: LivePreviewReport): string[] {
  return [
    'LIVE PREVIEW',
    'PREVIEW ONLY',
    'NO SIGN',
    'NO SEND',
    '',
    `Spec: ${report.specVersion}`,
    `Network: ${report.network}`,
    `Taker: ${abbreviatePublicKey(report.takerAddress)}`,
    'Input: WSOL',
    'Output: USDC',
    `amountRaw: ${report.amountRaw}`,
    `Quoted output: ${report.quotedOutput}`,
    `Minimum output threshold: ${report.minimumOutputThreshold}`,
    `Candidate fingerprint: ${abbreviateFingerprint(report.executionCandidateFingerprint)}`,
    `Compiled message fingerprint: ${abbreviateFingerprint(report.compiledMessageSha256)}`,
    `Calculated priority component: ${report.calculatedPriorityComponentLamports ?? 'unavailable'} lamports`,
    `RPC fee estimate: ${report.rpcEstimatedTransactionFeeLamports ?? 'unavailable'} lamports`,
    `Current SOL balance: ${report.currentSolBalanceLamports} lamports`,
    `Last valid block height: ${report.lastValidBlockHeight}`,
    `Remaining block-height headroom: ${report.remainingBlockHeightHeadroom}`,
    `Daily attempt usage: ${String(report.dailyAttemptUsage)}`,
    `Daily input usage: ${report.dailyInputUsageLamports} lamports`,
    `e14 status: ${report.executionStatus}`,
    '',
    report.message,
  ];
}

export function formatLiveReceiptLines(report: LiveReceiptReport): string[] {
  return [
    'LIVE RECEIPT',
    'PUBLIC EVIDENCE ONLY',
    '',
    `Spec: ${report.specVersion}`,
    `Attempt: ${abbreviateFingerprint(report.attemptId)}`,
    `Status: ${report.status}`,
    `Pair: WSOL → USDC`,
    `amountRaw: ${report.amountRaw}`,
    `Candidate: ${abbreviateFingerprint(report.executionCandidateFingerprint)}`,
    `Expected txid: ${report.expectedSignature ?? 'n/a'}`,
    `RPC returned signature: ${report.rpcReturnedSignature ?? 'n/a'}`,
    `Confirmation: ${report.confirmationStatus ?? 'n/a'}`,
    `Slot: ${report.slot ?? 'n/a'}`,
    `Estimated fee lamports: ${report.rpcEstimatedTransactionFeeLamports ?? 'n/a'}`,
    `Actual fee lamports: ${report.actualTransactionFeeLamports ?? 'n/a'}`,
    `Signed wire SHA-256: ${report.signedWireSha256 === null ? 'n/a' : abbreviateFingerprint(report.signedWireSha256)}`,
    `Actual output raw: ${report.actualOutputRaw ?? 'n/a'}`,
    `Send calls this invocation: ${String(report.sendCount)}`,
    '',
    report.message,
  ];
}

export function formatLiveHistoryLines(entries: readonly LiveHistoryEntry[]): string[] {
  const lines = [
    'LIVE HISTORY',
    'LOCAL DB READ ONLY',
    'NO SECRET / NO SIGNED WIRE',
    '',
  ];
  if (entries.length === 0) {
    lines.push('No live attempts stored.');
    return lines;
  }
  for (const entry of entries) {
    lines.push(
      [
        abbreviateFingerprint(entry.attemptId),
        new Date(entry.createdAtMs).toISOString(),
        'WSOL→USDC',
        entry.amountRaw,
        abbreviateFingerprint(entry.executionCandidateFingerprint),
        entry.expectedSignature === null ? 'no-txid' : `${entry.expectedSignature.slice(0, 8)}…`,
        entry.status,
        entry.slot ?? 'n/a',
        entry.actualTransactionFeeLamports ?? entry.rpcEstimatedTransactionFeeLamports ?? 'n/a',
        entry.actualOutputRaw ?? 'n/a',
      ].join(' | '),
    );
  }
  return lines;
}
