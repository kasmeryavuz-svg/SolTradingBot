import type { AppConfig } from '../config/types.js';
import { COMPUTE_UNIT_HARD_MAX } from './constants.js';
import { EXECUTION_SPEC_NAME, EXECUTION_SPEC_VERSION } from './constants.js';
import { ExecutionError } from './errors.js';
import { EXECUTION_DEFINITION_FINGERPRINT } from './identity.js';
import {
  fingerprintExecutionCandidate,
  fingerprintExecutionIntent,
  fingerprintJupiterBuild,
} from './identity.js';
import { buildJupiterRequest } from './jupiter-request.js';
import { validateJupiterBuild } from './jupiter-validate.js';
import { simulateNormalizedBuild } from './simulator.js';
import { validateExecutionIntent } from './intent.js';
import { compileUnsignedCandidate } from './transaction.js';
import type {
  ExecutionBuildReport,
  ExecutionIntent,
  ExecutionRpc,
  ExecutionSimulateReport,
  JupiterClient,
} from './types.js';

export async function executeExecutionBuild(input: {
  intent: ExecutionIntent;
  jupiter: JupiterClient;
}): Promise<ExecutionBuildReport> {
  const payload = await input.jupiter.build(buildJupiterRequest(input.intent));
  const build = validateJupiterBuild(payload, input.intent);
  const compiled = compileUnsignedCandidate(build, {
    feePayer: input.intent.takerPublicKey,
    computeUnitLimit: COMPUTE_UNIT_HARD_MAX,
    includeComputeUnitPrice: true,
  });
  const executionIntentFingerprint = fingerprintExecutionIntent(input.intent);
  const jupiterBuildFingerprint = fingerprintJupiterBuild({
    executionDefinitionFingerprint: EXECUTION_DEFINITION_FINGERPRINT,
    executionIntentFingerprint,
    build,
  });
  return {
    specVersion: EXECUTION_SPEC_VERSION,
    specName: EXECUTION_SPEC_NAME,
    executionDefinitionFingerprint: EXECUTION_DEFINITION_FINGERPRINT,
    executionIntentFingerprint,
    jupiterBuildFingerprint,
    executionCandidateFingerprint: fingerprintExecutionCandidate({
      executionDefinitionFingerprint: EXECUTION_DEFINITION_FINGERPRINT,
      executionIntentFingerprint,
      jupiterBuildFingerprint,
      candidate: compiled.candidate,
    }),
    intent: input.intent,
    quote: {
      outAmount: build.outAmount,
      otherAmountThreshold: build.otherAmountThreshold,
      slippageBps: build.slippageBps,
      routeHopCount: build.routePlan.length,
      dexLabels: build.routePlan.map((hop) => hop.label),
    },
    computeUnitPriceMicroLamports: build.computeUnitPriceMicroLamports,
    candidate: compiled.candidate,
    status: 'build_validated',
    message:
      'Jupiter /build was validated and compiled into an unsigned v0 candidate. No simulation, signing, or broadcast was performed.',
  };
}

export async function executeExecutionSimulate(input: {
  intent: ExecutionIntent;
  jupiter: JupiterClient;
  rpc: ExecutionRpc;
  signal?: AbortSignal;
}): Promise<ExecutionSimulateReport> {
  const payload = await input.jupiter.build(buildJupiterRequest(input.intent));
  const build = validateJupiterBuild(payload, input.intent);
  return simulateNormalizedBuild({
    intent: input.intent,
    build,
    rpc: input.rpc,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
}

export function buildStatusReport(config: AppConfig): {
  specVersion: string;
  specName: string;
  executionDefinitionFingerprint: string;
  checkpoint: string;
  publicConfig: {
    takerPublicKey: string | null;
    inputMint: string | null;
    outputMint: string | null;
    amountRaw: string | null;
    providerTimeoutMs: number;
    jupiterApiKeyConfigured: boolean;
    requiredFieldsPresent: boolean;
    missingFields: readonly string[];
  };
  network: string;
  mainnetGate: 'pass' | 'blocked';
  signing: 'unavailable';
  wallet: 'unavailable';
  broadcast: 'unavailable';
  jitoSend: 'unavailable';
  tradingEnabled: boolean;
} {
  const missing = missingPublicExecutionFields(config);
  return {
    specVersion: EXECUTION_SPEC_VERSION,
    specName: EXECUTION_SPEC_NAME,
    executionDefinitionFingerprint: EXECUTION_DEFINITION_FINGERPRINT,
    checkpoint: '14',
    publicConfig: {
      takerPublicKey: config.execution.takerPublicKey,
      inputMint: config.execution.inputMint,
      outputMint: config.execution.outputMint,
      amountRaw: config.execution.amountRaw,
      providerTimeoutMs: config.execution.providerTimeoutMs,
      jupiterApiKeyConfigured: config.execution.jupiterApiKeyConfigured,
      requiredFieldsPresent: missing.length === 0,
      missingFields: missing,
    },
    network: config.solana.network,
    mainnetGate: config.solana.network === 'mainnet-beta' ? 'pass' : 'blocked',
    signing: 'unavailable',
    wallet: 'unavailable',
    broadcast: 'unavailable',
    jitoSend: 'unavailable',
    tradingEnabled: config.tradingEnabled,
  };
}

export function missingPublicExecutionFields(config: AppConfig): string[] {
  const missing: string[] = [];
  if (config.execution.takerPublicKey === null) {
    missing.push('EXECUTION_TAKER_PUBKEY');
  }
  if (config.execution.inputMint === null) {
    missing.push('EXECUTION_INPUT_MINT');
  }
  if (config.execution.outputMint === null) {
    missing.push('EXECUTION_OUTPUT_MINT');
  }
  if (config.execution.amountRaw === null) {
    missing.push('EXECUTION_AMOUNT_RAW');
  }
  return missing;
}

export function requirePublicExecutionIntent(config: AppConfig): ExecutionIntent {
  const missing = missingPublicExecutionFields(config);
  if (missing.length > 0) {
    throw new ExecutionError(
      `Checkpoint 14 refuses to call Jupiter before required public execution config is present. Missing: ${missing.join(', ')}. There is no default wallet, token, or amount.`,
      { code: 'missing_public_config' },
    );
  }
  if (
    config.execution.takerPublicKey === null ||
    config.execution.inputMint === null ||
    config.execution.outputMint === null ||
    config.execution.amountRaw === null
  ) {
    throw new ExecutionError(
      'Checkpoint 14 refuses to call Jupiter before required public execution config is present.',
      { code: 'missing_public_config' },
    );
  }
  return validateExecutionIntent({
    inputMint: config.execution.inputMint,
    outputMint: config.execution.outputMint,
    amountRaw: config.execution.amountRaw,
    takerPublicKey: config.execution.takerPublicKey,
  });
}
