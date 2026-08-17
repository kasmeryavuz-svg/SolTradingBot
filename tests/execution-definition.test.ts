import { describe, expect, it } from 'vitest';
import {
  EXECUTION_DEFINITION_FINGERPRINT,
  canonicalExecutionDefinition,
  fingerprintExecutionDefinition,
  mutateCanonicalExecutionDefinition,
} from '../src/execution/index.js';
import {
  STRATEGY_DEFINITION_FINGERPRINT,
} from '../src/strategy/identity.js';
import { BACKTEST_DEFINITION_FINGERPRINT } from '../src/backtest/identity.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../src/paper/identity.js';
import { POSITION_DEFINITION_FINGERPRINT } from '../src/position/identity.js';
import { EXIT_DEFINITION_FINGERPRINT } from '../src/exit/identity.js';
import { PERFORMANCE_DEFINITION_FINGERPRINT } from '../src/performance/identity.js';
import { RESEARCH_DEFINITION_FINGERPRINT } from '../src/research/identity.js';
import { DASHBOARD_DEFINITION_FINGERPRINT } from '../src/dashboard/identity.js';

describe('e14 execution definition fingerprint', () => {
  it('derives a stable 64-hex fingerprint from canonical JSON', () => {
    expect(EXECUTION_DEFINITION_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprintExecutionDefinition()).toBe(EXECUTION_DEFINITION_FINGERPRINT);
    expect(fingerprintExecutionDefinition(canonicalExecutionDefinition())).toBe(
      EXECUTION_DEFINITION_FINGERPRINT,
    );
  });

  it('changes when each frozen semantic contract field is mutated independently', () => {
    const base = EXECUTION_DEFINITION_FINGERPRINT;
    const mutations: Array<(definition: ReturnType<typeof mutateCanonicalExecutionDefinition>) => void> = [
      (definition) => {
        definition.executionSpecVersion = 'e14_v2';
      },
      (definition) => {
        (definition.provider as { path: string }).path = '/swap/v2/order';
      },
      (definition) => {
        (definition as { swapMode: string }).swapMode = 'ExactOut';
      },
      (definition) => {
        definition.requestContract.slippageBps = 50;
      },
      (definition) => {
        definition.requestContract.maxAccounts = 32;
      },
      (definition) => {
        definition.requestContract.blockhashSlotsToExpiry = 75;
      },
      (definition) => {
        (definition.requestContract as { computeUnitPricePercentile: string }).computeUnitPricePercentile =
          'veryHigh';
      },
      (definition) => {
        (definition.requestContract as { forJitoBundle: boolean }).forJitoBundle = true;
      },
      (definition) => {
        (definition.requestContract as { modeFast: boolean }).modeFast = true;
      },
      (definition) => {
        definition.requestContract.platformFeeBps = 50;
      },
      (definition) => {
        definition.requestContract.tipAmountLamports = 1;
      },
      (definition) => {
        (definition.requestContract as { payerOverride: boolean }).payerOverride = true;
      },
      (definition) => {
        (definition.networkPolicy as { realProviderExecution: string }).realProviderExecution = 'any';
      },
      (definition) => {
        (definition.networkPolicy as { noSigning: boolean }).noSigning = false;
      },
      (definition) => {
        (definition.networkPolicy as { noSolanaSendTransaction: boolean }).noSolanaSendTransaction = false;
      },
      (definition) => {
        (definition.networkPolicy as { noJitoSend: boolean }).noJitoSend = false;
      },
      (definition) => {
        definition.computePolicy.firstSimulationLimit = 200_000;
      },
      (definition) => {
        definition.computePolicy.safetyMarginNumerator = '11';
      },
      (definition) => {
        definition.computePolicy.hardMax = 700_000;
      },
      (definition) => {
        definition.feePolicy.maxPriorityFeeLamports = '2000000';
      },
      (definition) => {
        (definition.validationPolicy as { providerResponse: boolean }).providerResponse = false;
      },
      (definition) => {
        (definition.validationPolicy as { signerMeta: string }).signerMeta = 'any';
      },
      (definition) => {
        (definition.validationPolicy as { lookupTablesFromProviderOnly: boolean }).lookupTablesFromProviderOnly =
          false;
      },
      (definition) => {
        (definition.computePolicy as { finalSimulationRequiredForPassed: boolean }).finalSimulationRequiredForPassed =
          false;
      },
      (definition) => {
        (definition.validationPolicy as { errorSanitization: boolean }).errorSanitization = false;
      },
      (definition) => {
        definition.httpPolicy.timeoutMsDefault = 15_000;
      },
      (definition) => {
        (definition.computePolicy as { finalSimulationReplaceRecentBlockhash: boolean }).finalSimulationReplaceRecentBlockhash =
          true;
      },
      (definition) => {
        (definition.networkPolicy as { simulateRequiresMainnetGenesisHash: boolean }).simulateRequiresMainnetGenesisHash =
          false;
      },
      (definition) => {
        (definition.networkPolicy as { expectedMainnetGenesisHash: string }).expectedMainnetGenesisHash =
          'wrong';
      },
      (definition) => {
        (definition.validationPolicy as { compiledRequiredSignerCount: number }).compiledRequiredSignerCount = 2;
      },
      (definition) => {
        (definition.validationPolicy as { streamingBodyCap: boolean }).streamingBodyCap = false;
      },
      (definition) => {
        (definition.validationPolicy as { serializedTransactionMaxBytes: number }).serializedTransactionMaxBytes = 9999;
      },
      (definition) => {
        (definition.computePolicy as { preFinalExpiryRecheck: boolean }).preFinalExpiryRecheck = false;
      },
    ];

    for (const mutate of mutations) {
      const fingerprint = fingerprintExecutionDefinition(mutateCanonicalExecutionDefinition(mutate));
      expect(fingerprint).not.toBe(base);
      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('does not change frozen upstream fingerprints', () => {
    expect(STRATEGY_DEFINITION_FINGERPRINT).toBe(
      'b4560629e6a58331e9046f13bad78b73b3bdc1bb7349fc6173ba158b4db067cd',
    );
    expect(BACKTEST_DEFINITION_FINGERPRINT).toBe(
      '87bca6f2ea8e57b7613d3627b5a5adf37864142b3c62de97849440189ff07fcf',
    );
    expect(PAPER_DEFINITION_FINGERPRINT).toBe(
      '4951807199956eb0425193fbdb3296289090b6bbffd92f7353718cad0f68a0e0',
    );
    expect(POSITION_DEFINITION_FINGERPRINT).toBe(
      '8c89f5a95f7aadb02d0cd7736b73d563266b2df1f3b16da5d24788eced75aa4f',
    );
    expect(EXIT_DEFINITION_FINGERPRINT).toBe(
      '4678a49e73cab2f0076e376506910761f4afcabdcdee4fe3c9830c2395c2e6e6',
    );
    expect(PERFORMANCE_DEFINITION_FINGERPRINT).toBe(
      '9fe2b033c19d5470b972714cc37d32333ac4662ad8d30cdd97b668891454e53c',
    );
    expect(RESEARCH_DEFINITION_FINGERPRINT).toBe(
      '61f5a9d091ce9214e440dddf029f81bb881a907f4cd9193e04ecd3238c20a83a',
    );
    expect(DASHBOARD_DEFINITION_FINGERPRINT).toBe(
      'd4a72c37b15c334171cbd0975cbb9534c3ca836f38923654e22e3685d02c5b18',
    );
  });
});
