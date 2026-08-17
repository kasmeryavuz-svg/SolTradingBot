import type { ExecutionBuildReport, ExecutionSimulateReport, ExecutionStatusReport } from './types.js';

export function abbreviatePublicKey(value: string | null): string {
  if (value === null) {
    return 'missing';
  }
  if (value.length <= 16) {
    return value;
  }
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function abbreviateFingerprint(value: string): string {
  if (value.length <= 16) {
    return value;
  }
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

export function formatExecutionStatusLines(report: ExecutionStatusReport): string[] {
  return [
    'EXECUTION PREFLIGHT STATUS',
    'UNSIGNED / NO SIGN / NO SEND / NO JITO',
    '',
    `Spec: ${report.specVersion}`,
    `Name: ${report.specName}`,
    `Definition fingerprint: ${report.executionDefinitionFingerprint}`,
    `Checkpoint: ${report.checkpoint}`,
    '',
    'Public config',
    `Taker: ${abbreviatePublicKey(report.publicConfig.takerPublicKey)}`,
    `Input mint: ${abbreviatePublicKey(report.publicConfig.inputMint)}`,
    `Output mint: ${abbreviatePublicKey(report.publicConfig.outputMint)}`,
    `amountRaw: ${report.publicConfig.amountRaw ?? 'missing'}`,
    `Provider timeout ms: ${String(report.publicConfig.providerTimeoutMs)}`,
    `Jupiter API key: ${report.publicConfig.jupiterApiKeyConfigured ? 'configured' : 'not configured'}`,
    `Required public fields present: ${report.publicConfig.requiredFieldsPresent ? 'yes' : 'no'}`,
    ...(report.publicConfig.missingFields.length === 0
      ? []
      : [`Missing: ${report.publicConfig.missingFields.join(', ')}`]),
    '',
    `SOLANA_NETWORK: ${report.network}`,
    `Mainnet gate for build/simulate: ${report.mainnetGate}`,
    '',
    'Signing: unavailable',
    'Wallet: unavailable',
    'Broadcast: unavailable',
    'Jito send: unavailable',
    `TRADING_ENABLED: ${report.tradingEnabled ? 'true' : 'false'}`,
    '',
    'Checkpoint 14 is preflight-only. Jupiter /build is real provider data. Solana simulation is real RPC preflight. No private key, no signing, no send.',
  ];
}

export function formatExecutionBuildLines(report: ExecutionBuildReport): string[] {
  return [
    'EXECUTION PREFLIGHT BUILD',
    'UNSIGNED CANDIDATE / NO SIGN / NO SEND',
    '',
    `Spec: ${report.specVersion}`,
    `Name: ${report.specName}`,
    `Status: ${report.status}`,
    report.message,
    '',
    `Intent fingerprint: ${abbreviateFingerprint(report.executionIntentFingerprint)}`,
    `Input mint: ${abbreviatePublicKey(report.intent.inputMint)}`,
    `Output mint: ${abbreviatePublicKey(report.intent.outputMint)}`,
    `amountRaw: ${report.intent.amountRaw}`,
    `Quoted output: ${report.quote.outAmount}`,
    `Minimum output threshold: ${report.quote.otherAmountThreshold}`,
    `Slippage: ${String(report.quote.slippageBps)} bps (frozen e14 preflight tolerance, not a live-tuned value)`,
    `Route hops: ${String(report.quote.routeHopCount)}`,
    `DEX labels (untrusted display text): ${report.quote.dexLabels.join(', ') || 'n/a'}`,
    `Compute-unit price: ${report.computeUnitPriceMicroLamports.toString()} micro-lamports / CU`,
    `Candidate CU limit (build headroom): ${String(report.candidate.computeUnitLimit)}`,
    `Lookup tables: ${String(report.candidate.lookupTableCount)}`,
    `Blockhash lastValidBlockHeight: ${report.candidate.lastValidBlockHeight.toString()}`,
    `Build fingerprint: ${abbreviateFingerprint(report.jupiterBuildFingerprint)}`,
    `Candidate fingerprint: ${abbreviateFingerprint(report.executionCandidateFingerprint)}`,
    '',
    'This quoted output is not guaranteed execution output. The candidate is unsigned and was not broadcast.',
  ];
}

export function formatExecutionSimulateLines(report: ExecutionSimulateReport): string[] {
  return [
    'EXECUTION PREFLIGHT SIMULATION',
    'UNSIGNED CANDIDATE / NO SIGN / NO SEND',
    '',
    `Spec: ${report.specVersion}`,
    `Name: ${report.specName}`,
    `Status: ${report.status}`,
    report.message,
    '',
    `Intent fingerprint: ${abbreviateFingerprint(report.executionIntentFingerprint)}`,
    `Input mint: ${abbreviatePublicKey(report.intent.inputMint)}`,
    `Output mint: ${abbreviatePublicKey(report.intent.outputMint)}`,
    `amountRaw: ${report.intent.amountRaw}`,
    `Quoted output: ${report.quote.outAmount}`,
    `Minimum output threshold: ${report.quote.otherAmountThreshold}`,
    `Slippage: ${String(report.quote.slippageBps)} bps (frozen e14 preflight tolerance, not a live-tuned value)`,
    `Route hops: ${String(report.quote.routeHopCount)}`,
    `DEX labels (untrusted display text): ${report.quote.dexLabels.join(', ') || 'n/a'}`,
    `Compute-unit price: ${report.computeUnitPriceMicroLamports.toString()} micro-lamports / CU`,
    `First simulation units: ${formatUnits(report.firstSimulation?.unitsConsumed ?? null)}`,
    `Final CU limit: ${report.finalComputeUnitLimit === null ? 'n/a' : String(report.finalComputeUnitLimit)}`,
    `Second simulation: ${formatSecondSimulation(report)}`,
    `Calculated priority-fee component: ${report.fees === null ? 'n/a' : `${report.fees.calculatedPriorityFeeComponentLamports.toString()} lamports`}`,
    `Priority-fee cap: ${report.fees === null ? 'n/a' : `${report.fees.maxPriorityFeeLamports.toString()} lamports`}`,
    `RPC transaction-fee estimate: ${
      report.fees?.rpcEstimatedTransactionFeeLamports === null || report.fees === null
        ? 'unavailable'
        : `${report.fees.rpcEstimatedTransactionFeeLamports.toString()} lamports`
    }`,
    'RPC transaction-fee estimate is the cluster charge for the final message. It is not added to the calculated priority-fee component.',
    `Current block height: ${report.currentBlockHeight === null ? 'n/a' : report.currentBlockHeight.toString()}`,
    `Blockhash lastValidBlockHeight: ${report.candidate.lastValidBlockHeight.toString()}`,
    `Build fingerprint: ${abbreviateFingerprint(report.jupiterBuildFingerprint)}`,
    `Candidate fingerprint: ${abbreviateFingerprint(report.executionCandidateFingerprint)}`,
    `Simulation fingerprint: ${abbreviateFingerprint(report.executionSimulationFingerprint)}`,
    '',
    'Simulation passed is not a guarantee of landing. Quoted output is not guaranteed execution output. No funds were sent.',
  ];
}

function formatUnits(units: bigint | null): string {
  return units === null ? 'n/a' : units.toString();
}

function formatSecondSimulation(report: ExecutionSimulateReport): string {
  if (report.secondSimulation === null) {
    return 'not run';
  }
  if (report.secondSimulation.ok) {
    return `passed (${formatUnits(report.secondSimulation.unitsConsumed)} units)`;
  }
  return `failed (${report.secondSimulation.errorSummary ?? 'no summary'})`;
}
