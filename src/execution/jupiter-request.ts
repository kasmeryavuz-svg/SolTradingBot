import type { ExecutionIntent, JupiterBuildRequest } from './types.js';

export function buildJupiterRequest(intent: ExecutionIntent): JupiterBuildRequest {
  return {
    inputMint: intent.inputMint,
    outputMint: intent.outputMint,
    amount: intent.amountRaw,
    taker: intent.takerPublicKey,
    slippageBps: '100',
    maxAccounts: '64',
    blockhashSlotsToExpiry: '150',
    computeUnitPricePercentile: 'high',
    forJitoBundle: 'false',
  };
}
