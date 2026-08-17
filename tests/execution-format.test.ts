import { describe, expect, it } from 'vitest';
import {
  executeExecutionStatus,
  formatExecutionBuildLines,
  formatExecutionSimulateLines,
  formatExecutionStatusLines,
} from '../src/execution/index.js';
import { JUPITER_SECRET, executionIntent } from './execution-fixtures.js';
import type { ExecutionBuildReport, ExecutionSimulateReport } from '../src/execution/types.js';

const buildReport: ExecutionBuildReport = {
  specVersion: 'e14_v1',
  specName: 'jupiter_v2_unsigned_swap_preflight_engine',
  executionDefinitionFingerprint: 'a'.repeat(64),
  executionIntentFingerprint: 'b'.repeat(64),
  jupiterBuildFingerprint: 'c'.repeat(64),
  executionCandidateFingerprint: 'd'.repeat(64),
  intent: executionIntent(),
  quote: {
    outAmount: '2000000',
    otherAmountThreshold: '1980000',
    slippageBps: 100,
    routeHopCount: 1,
    dexLabels: ['Raydium'],
  },
  computeUnitPriceMicroLamports: 1000n,
  candidate: {
    version: 0,
    feePayer: executionIntent().takerPublicKey,
    computeUnitLimit: 1_400_000,
    instructionOrder: [],
    instructionCount: 3,
    lookupTableCount: 0,
    blockhashBase58: '11111111111111111111111111111111',
    lastValidBlockHeight: 1000n,
    compiledMessageSha256: 'f'.repeat(64),
    serializedTransactionBytes: 200,
  },
  status: 'build_validated',
  message: 'compiled',
};

describe('execution formatters', () => {
  it('prints status without network claims or the API key', () => {
    const lines = formatExecutionStatusLines(
      executeExecutionStatus({
        TRADING_ENABLED: 'false',
        JUPITER_API_KEY: JUPITER_SECRET,
      }),
    );
    const text = lines.join('\n');
    expect(text).toContain('e14_v1');
    expect(text).toContain('Signing: unavailable');
    expect(text).toContain('Wallet: unavailable');
    expect(text).toContain('Broadcast: unavailable');
    expect(text).toContain('Jito send: unavailable');
    expect(text).not.toContain(JUPITER_SECRET);
    expect(text).not.toMatch(/ready_for_live|safe_to_trade|approved_for_live|good trade|profitable/i);
  });

  it('prints build/simulate diagnostics without profitability language', () => {
    const build = formatExecutionBuildLines(buildReport).join('\n');
    expect(build).toContain('Quoted output');
    expect(build).toContain('Minimum output threshold');
    expect(build).toContain('100 bps (frozen e14 preflight tolerance');
    expect(build).toContain('not guaranteed execution output');
    expect(build).not.toMatch(/safe slippage|\boptimal\b|best route|profitable/i);

    const simulate = formatExecutionSimulateLines({
      ...buildReport,
      executionSimulationFingerprint: 'e'.repeat(64),
      currentBlockHeight: 900n,
      firstSimulation: {
        ok: true,
        unitsConsumed: 100_000n,
        errorSummary: null,
        logs: [],
        failureKind: 'none',
      },
      finalComputeUnitLimit: 120_000,
      secondSimulation: {
        ok: true,
        unitsConsumed: 99_000n,
        errorSummary: null,
        logs: [],
        failureKind: 'none',
      },
      observedGenesisHash: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
      currentBlockHeightAfterFirst: 900n,
      currentBlockHeightBeforeFinal: 901n,
      fees: {
        computeUnitPriceMicroLamports: 1000n,
        calculatedPriorityFeeComponentLamports: 120n,
        maxPriorityFeeLamports: 1_000_000n,
        rpcEstimatedTransactionFeeLamports: 5000n,
      },
      providerValid: true,
      status: 'simulation_passed',
      message: 'Unsigned preflight candidate is simulation-valid.',
    } satisfies ExecutionSimulateReport).join('\n');
    expect(simulate).toContain('simulation-valid');
    expect(simulate).toContain('not a guarantee of landing');
    expect(simulate).toContain('Calculated priority-fee component');
    expect(simulate).toContain('RPC transaction-fee estimate');
    expect(simulate).not.toContain(JUPITER_SECRET);
  });
});
