import { describe, expect, it } from 'vitest';
import {
  SOLANA_DEVNET_GENESIS_HASH,
  SOLANA_MAINNET_GENESIS_HASH,
  classifyExecutionPreflight,
  simulateNormalizedBuild,
  validateJupiterBuild,
} from '../src/execution/index.js';
import type { ExecutionRpc, ExecutionSimulationEvidence } from '../src/execution/types.js';
import { executionIntent, validJupiterBuild } from './execution-fixtures.js';

function evidence(
  overrides: Partial<ExecutionSimulationEvidence> = {},
): ExecutionSimulationEvidence {
  return {
    ok: true,
    unitsConsumed: 100_000n,
    errorSummary: null,
    logs: [],
    failureKind: 'none',
    ...overrides,
  };
}

function fakeRpc(overrides: Partial<ExecutionRpc> = {}): ExecutionRpc {
  return {
    getGenesisHash: () => Promise.resolve(SOLANA_MAINNET_GENESIS_HASH),
    getBlockHeight: () => Promise.resolve(900n),
    simulateTransaction: () => Promise.resolve(evidence()),
    getFeeForMessage: () => Promise.resolve(5000n),
    ...overrides,
  };
}

function classifyInput(
  overrides: Partial<Parameters<typeof classifyExecutionPreflight>[0]> = {},
): Parameters<typeof classifyExecutionPreflight>[0] {
  return {
    mode: 'simulate',
    providerValid: true,
    signerSupported: true,
    clusterMismatch: false,
    rpcUnavailable: false,
    firstSimulation: evidence(),
    computeLimit: { kind: 'ok', finalLimit: 120_000 },
    blockhashExpired: false,
    priorityFee: {
      kind: 'ok',
      calculatedPriorityFeeComponentLamports: 1n,
      maxPriorityFeeLamports: 1_000_000n,
    },
    secondSimulation: evidence(),
    ...overrides,
  };
}

describe('simulation classification', () => {
  it('never promotes a failed simulation to simulation_passed', () => {
    expect(
      classifyExecutionPreflight(
        classifyInput({
          firstSimulation: evidence({ ok: false, failureKind: 'program_error', unitsConsumed: null }),
        }),
      ),
    ).toBe('simulation_failed');

    expect(
      classifyExecutionPreflight(
        classifyInput({
          secondSimulation: evidence({ ok: false, failureKind: 'program_error' }),
        }),
      ),
    ).toBe('simulation_failed');

    expect(
      classifyExecutionPreflight(
        classifyInput({
          secondSimulation: evidence({ unitsConsumed: 120_001n }),
        }),
      ),
    ).toBe('simulation_failed');
  });

  it('classifies timeout, null units, zero units, over-max, expiry, fee cap, and cluster mismatch', () => {
    expect(
      classifyExecutionPreflight(
        classifyInput({
          firstSimulation: evidence({ ok: false, failureKind: 'timeout', unitsConsumed: null }),
          computeLimit: null,
          priorityFee: null,
          secondSimulation: null,
        }),
      ),
    ).toBe('simulation_failed');
    expect(
      classifyExecutionPreflight(
        classifyInput({
          firstSimulation: evidence({ ok: false, failureKind: 'null_units', unitsConsumed: null }),
          computeLimit: null,
          priorityFee: null,
          secondSimulation: null,
        }),
      ),
    ).toBe('simulation_failed');
    expect(
      classifyExecutionPreflight(
        classifyInput({
          firstSimulation: evidence({ ok: false, failureKind: 'zero_units', unitsConsumed: 0n }),
          computeLimit: null,
          priorityFee: null,
          secondSimulation: null,
        }),
      ),
    ).toBe('simulation_failed');
    expect(
      classifyExecutionPreflight(
        classifyInput({
          firstSimulation: evidence({ unitsConsumed: 1_400_000n }),
          computeLimit: { kind: 'blocked_compute_limit', simulatedUnits: 1_400_000n },
          priorityFee: null,
          secondSimulation: null,
        }),
      ),
    ).toBe('blocked_compute_limit');
    expect(classifyExecutionPreflight(classifyInput({ blockhashExpired: true }))).toBe('expired_blockhash');
    expect(classifyExecutionPreflight(classifyInput({ clusterMismatch: true }))).toBe('cluster_mismatch');
    expect(classifyExecutionPreflight(classifyInput({ rpcUnavailable: true }))).toBe('rpc_unavailable');
    expect(classifyExecutionPreflight(classifyInput({ signerSupported: false }))).toBe(
      'unsupported_signer_requirement',
    );
  });
});

describe('simulateNormalizedBuild', () => {
  it('returns simulation_passed only after a successful second simulation', async () => {
    let calls = 0;
    const report = await simulateNormalizedBuild({
      intent: executionIntent(),
      build: validateJupiterBuild(validJupiterBuild(), executionIntent()),
      rpc: fakeRpc({
        simulateTransaction: (_wire, options) => {
          calls += 1;
          if (calls === 1) {
            expect(options.replaceRecentBlockhash).toBe(true);
            return Promise.resolve(evidence({ unitsConsumed: 100_000n }));
          }
          expect(options.replaceRecentBlockhash).toBe(false);
          return Promise.resolve(evidence({ unitsConsumed: 99_000n }));
        },
      }),
    });
    expect(report.status).toBe('simulation_passed');
    expect(report.finalComputeUnitLimit).toBe(120_000);
    expect(report.providerValid).toBe(true);
    expect(report.fees?.rpcEstimatedTransactionFeeLamports).toBe(5000n);
    expect(report.fees?.calculatedPriorityFeeComponentLamports).toBe(120n);
    expect(report.observedGenesisHash).toBe(SOLANA_MAINNET_GENESIS_HASH);
  });

  it('refuses a mainnet config pointed at a non-mainnet genesis before simulation_passed', async () => {
    let simulations = 0;
    const report = await simulateNormalizedBuild({
      intent: executionIntent(),
      build: validateJupiterBuild(validJupiterBuild(), executionIntent()),
      rpc: fakeRpc({
        getGenesisHash: () => Promise.resolve(SOLANA_DEVNET_GENESIS_HASH),
        simulateTransaction: () => {
          simulations += 1;
          return Promise.resolve(evidence());
        },
      }),
    });
    expect(report.status).toBe('cluster_mismatch');
    expect(report.secondSimulation).toBeNull();
    expect(simulations).toBe(0);
  });

  it('rechecks expiry immediately before the exact final simulation', async () => {
    let heightCalls = 0;
    let simulations = 0;
    const report = await simulateNormalizedBuild({
      intent: executionIntent(),
      build: validateJupiterBuild(validJupiterBuild(), executionIntent()),
      rpc: fakeRpc({
        getBlockHeight: () => {
          heightCalls += 1;
          return Promise.resolve(heightCalls === 1 ? 900n : 1001n);
        },
        simulateTransaction: (_wire, options) => {
          simulations += 1;
          expect(options.replaceRecentBlockhash).toBe(true);
          return Promise.resolve(evidence({ unitsConsumed: 100_000n }));
        },
      }),
    });
    expect(report.status).toBe('expired_blockhash');
    expect(report.secondSimulation).toBeNull();
    expect(simulations).toBe(1);
    expect(heightCalls).toBe(2);
  });

  it('keeps first-pass success / second-pass failure as simulation_failed', async () => {
    let calls = 0;
    const report = await simulateNormalizedBuild({
      intent: executionIntent(),
      build: validateJupiterBuild(validJupiterBuild(), executionIntent()),
      rpc: fakeRpc({
        simulateTransaction: () => {
          calls += 1;
          if (calls === 1) {
            return Promise.resolve(evidence({ unitsConsumed: 100_000n }));
          }
          return Promise.resolve(
            evidence({
              ok: false,
              unitsConsumed: null,
              errorSummary: 'program failed',
              failureKind: 'program_error',
            }),
          );
        },
      }),
    });
    expect(report.status).toBe('simulation_failed');
    expect(report.providerValid).toBe(true);
  });

  it('changes the simulation fingerprint when genesis or second-sim evidence changes', async () => {
    const build = validateJupiterBuild(validJupiterBuild(), executionIntent());
    const passed = await simulateNormalizedBuild({
      intent: executionIntent(),
      build,
      rpc: fakeRpc(),
    });
    const mismatched = await simulateNormalizedBuild({
      intent: executionIntent(),
      build,
      rpc: fakeRpc({
        getGenesisHash: () => Promise.resolve(SOLANA_DEVNET_GENESIS_HASH),
      }),
    });
    let calls = 0;
    const failedSecond = await simulateNormalizedBuild({
      intent: executionIntent(),
      build,
      rpc: fakeRpc({
        simulateTransaction: () => {
          calls += 1;
          if (calls === 1) {
            return Promise.resolve(evidence({ unitsConsumed: 100_000n }));
          }
          return Promise.resolve(
            evidence({
              ok: false,
              unitsConsumed: null,
              errorSummary: 'program failed',
              failureKind: 'program_error',
            }),
          );
        },
      }),
    });
    expect(passed.executionSimulationFingerprint).not.toBe(mismatched.executionSimulationFingerprint);
    expect(passed.executionSimulationFingerprint).not.toBe(failedSecond.executionSimulationFingerprint);
    expect(passed.status).toBe('simulation_passed');
    expect(mismatched.status).toBe('cluster_mismatch');
  });

  it('expires before the second pass when current height is one above lastValid', async () => {
    const report = await simulateNormalizedBuild({
      intent: executionIntent(),
      build: validateJupiterBuild(validJupiterBuild(), executionIntent()),
      rpc: fakeRpc({
        getBlockHeight: () => Promise.resolve(1001n),
      }),
    });
    expect(report.status).toBe('expired_blockhash');
    expect(report.secondSimulation).toBeNull();
  });
});
