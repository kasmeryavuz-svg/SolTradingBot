import { describe, expect, it } from 'vitest';
import { BACKTEST_SPEC_VERSION } from '../src/backtest/constants.js';
import { DASHBOARD_SPEC_VERSION } from '../src/dashboard/constants.js';
import { EXECUTION_SPEC_VERSION } from '../src/execution/constants.js';
import { EXIT_SPEC_VERSION } from '../src/exit/constants.js';
import { LIVE_SPEC_VERSION } from '../src/live/constants.js';
import { PAPER_SPEC_VERSION } from '../src/paper/constants.js';
import { PERFORMANCE_SPEC_VERSION } from '../src/performance/constants.js';
import { POSITION_SPEC_VERSION } from '../src/position/constants.js';
import { RESEARCH_SPEC_VERSION } from '../src/research/constants.js';
import { WALLET_SPEC_VERSION } from '../src/wallet/constants.js';
import {
  COST_SPEC_NAME,
  COST_SPEC_VERSION,
  MAX_OPTIMIZATION_HOLD_MS,
  OPTIMIZATION_CHECKPOINT,
  OPTIMIZATION_SPEC_NAME,
  OPTIMIZATION_SPEC_VERSION,
  REQUIRED_SCHEMA_VERSION,
} from '../src/optimization/constants.js';
import { canonicalCostDefinition } from '../src/optimization/costs.js';
import {
  canonicalOptimizationDefinition,
  mutateCanonicalOptimizationDefinition,
} from '../src/optimization/definition.js';
import {
  COST_DEFINITION_FINGERPRINT,
  OPTIMIZATION_DEFINITION_FINGERPRINT,
  fingerprintOptimizationDefinition,
} from '../src/optimization/index.js';

describe('o17_v1 definition', () => {
  it('freezes identity, checkpoint, schema, and 24h hold', () => {
    expect(OPTIMIZATION_SPEC_VERSION).toBe('o17_v1');
    expect(OPTIMIZATION_SPEC_NAME).toBe('anchored_walk_forward_cost_stress_strategy_optimizer');
    expect(COST_SPEC_VERSION).toBe('cost17_v1');
    expect(COST_SPEC_NAME).toBe('all_in_research_price_friction_scenarios');
    expect(OPTIMIZATION_CHECKPOINT).toBe('17');
    expect(REQUIRED_SCHEMA_VERSION).toBe(8);
    expect(MAX_OPTIMIZATION_HOLD_MS).toBe(24 * 60 * 60 * 1000);
    expect(canonicalOptimizationDefinition()).not.toHaveProperty('generatedAt');
    expect(canonicalCostDefinition()).not.toHaveProperty('generatedAt');
    expect(fingerprintOptimizationDefinition()).toBe(OPTIMIZATION_DEFINITION_FINGERPRINT);
    expect(OPTIMIZATION_DEFINITION_FINGERPRINT).toBe(
      '3c2171dc1aee3b0a31bae185e156f0a7236d56d11fe381e83364e8c326c4b979',
    );
    expect(COST_DEFINITION_FINGERPRINT).toBe(
      'da3674208672b3f7c630ac0d3dc9e8cc0818c639fd5e69c62d9d87203757a523',
    );
  });

  it('changes fingerprint when a frozen semantic is mutated', () => {
    expect(OPTIMIZATION_DEFINITION_FINGERPRINT).toMatch(/^[0-9a-f]{64}$/);
    expect(
      fingerprintOptimizationDefinition(
        mutateCanonicalOptimizationDefinition((definition) => {
          (definition as { noHyperopt: boolean }).noHyperopt = false;
        }),
      ),
    ).not.toBe(OPTIMIZATION_DEFINITION_FINGERPRINT);
    expect(
      fingerprintOptimizationDefinition(
        mutateCanonicalOptimizationDefinition((definition) => {
          definition.optimizationSpecVersion = 'o17_v2';
        }),
      ),
    ).not.toBe(OPTIMIZATION_DEFINITION_FINGERPRINT);
  });

  it('does not bump frozen upstream spec versions', () => {
    expect(BACKTEST_SPEC_VERSION).toBe('b08_v1');
    expect(PAPER_SPEC_VERSION).toBe('p09_v1');
    expect(POSITION_SPEC_VERSION).toBe('pm10_v1');
    expect(EXIT_SPEC_VERSION).toBe('x11_v1');
    expect(RESEARCH_SPEC_VERSION).toBe('r125_v1');
    expect(DASHBOARD_SPEC_VERSION).toBe('d13_v1');
    expect(EXECUTION_SPEC_VERSION).toBe('e14_v1');
    expect(WALLET_SPEC_VERSION).toBe('w15_v1');
    expect(LIVE_SPEC_VERSION).toBe('l16_v1');
    expect(PERFORMANCE_SPEC_VERSION).toBe('a12_v1');
  });
});
