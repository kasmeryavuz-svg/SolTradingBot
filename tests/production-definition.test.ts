import { describe, expect, it } from 'vitest';
import { BACKTEST_DEFINITION_FINGERPRINT } from '../src/backtest/identity.js';
import { DASHBOARD_DEFINITION_FINGERPRINT } from '../src/dashboard/identity.js';
import { EXIT_DEFINITION_FINGERPRINT } from '../src/exit/identity.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../src/paper/identity.js';
import { PERFORMANCE_DEFINITION_FINGERPRINT } from '../src/performance/identity.js';
import { POSITION_DEFINITION_FINGERPRINT } from '../src/position/identity.js';
import { RESEARCH_DEFINITION_FINGERPRINT } from '../src/research/identity.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../src/strategy/identity.js';
import { COST_DEFINITION_FINGERPRINT } from '../src/optimization/costs.js';
import { OPTIMIZATION_DEFINITION_FINGERPRINT } from '../src/optimization/identity.js';
import { WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT } from '../src/wallet-intelligence/identity.js';
import { ML_DEFINITION_FINGERPRINT, ML_FEATURE_FINGERPRINT } from '../src/ml/identity.js';
import { EXECUTION_DEFINITION_FINGERPRINT } from '../src/execution/identity.js';
import { WALLET_DEFINITION_FINGERPRINT } from '../src/wallet/identity.js';
import { LIVE_DEFINITION_FINGERPRINT } from '../src/live/identity.js';
import { LATEST_SCHEMA_VERSION, migrationSqlDigest } from '../src/persistence/sqlite/migrations.js';
import {
  FROZEN_A12_DEFINITION_FINGERPRINT,
  FROZEN_B08_DEFINITION_FINGERPRINT,
  FROZEN_COST17_DEFINITION_FINGERPRINT,
  FROZEN_D13_DEFINITION_FINGERPRINT,
  FROZEN_E14_DEFINITION_FINGERPRINT,
  FROZEN_L16_DEFINITION_FINGERPRINT,
  FROZEN_ML19_DEFINITION_FINGERPRINT,
  FROZEN_ML19_FEATURE_FINGERPRINT,
  FROZEN_O17_DEFINITION_FINGERPRINT,
  FROZEN_P09_DEFINITION_FINGERPRINT,
  FROZEN_PM10_DEFINITION_FINGERPRINT,
  FROZEN_R125_DEFINITION_FINGERPRINT,
  FROZEN_S07_DEFINITION_FINGERPRINT,
  FROZEN_W15_DEFINITION_FINGERPRINT,
  FROZEN_WI18_DEFINITION_FINGERPRINT,
  FROZEN_X11_DEFINITION_FINGERPRINT,
  PROD20_SPEC_NAME,
  PROD20_SPEC_VERSION,
} from '../src/production/constants.js';
import { canonicalProductionDefinition, mutateCanonicalProductionDefinition } from '../src/production/definition.js';
import { fingerprintProductionDefinition, PROD20_DEFINITION_FINGERPRINT } from '../src/production/identity.js';

describe('production definition', () => {
  it('freezes prod20_v1 identity', () => {
    expect(PROD20_SPEC_VERSION).toBe('prod20_v1');
    expect(PROD20_SPEC_NAME).toBe('paper_only_production_supervisor_and_release_readiness');
    expect(fingerprintProductionDefinition()).toBe(PROD20_DEFINITION_FINGERPRINT);
    expect(PROD20_DEFINITION_FINGERPRINT).toBe(
      '558ad72f3fcc2da230eb11e0288953e234e3eee29a1d0f193924770bdf4b6a78',
    );
    expect(canonicalProductionDefinition().lock.processInstanceIdentity).toBe(true);
    expect(canonicalProductionDefinition().failure.ambiguousFailClosed).toBe(true);
    expect(canonicalProductionDefinition().logging.redactedUrlToken).toBe('[REDACTED_URL]');
    const definition = canonicalProductionDefinition();
    expect(definition.capability.automaticLiveTrading).toBe(false);
    expect(definition.capability.mlProductionInput).toBe(false);
    expect(definition.schema.migration010).toBe('ABSENT');
    expect(definition.health.host).toBe('127.0.0.1');
    expect(definition.docker.dockerHealthExposure).toBe('container_loopback_only_not_host_published');
    expect(definition.docker.applicationHealthHost).toBe('127.0.0.1');
    expect(definition.docker.dockerHealthcheckUsesContainerLoopback).toBe(true);
    expect(definition.docker.dockerPublishesHealthPort).toBe(false);
    expect(definition.scheduler.kind).toBe('fixed_delay');
  });

  it('changes fingerprint when semantics change', () => {
    expect(
      fingerprintProductionDefinition(
        mutateCanonicalProductionDefinition((definition) => {
          definition.scheduler.defaultIntervalMs = 299_999;
        }),
      ),
    ).not.toBe(PROD20_DEFINITION_FINGERPRINT);
  });

  it('reproves frozen upstream fingerprints and schema 9 without migration 010', () => {
    expect(STRATEGY_DEFINITION_FINGERPRINT).toBe(FROZEN_S07_DEFINITION_FINGERPRINT);
    expect(BACKTEST_DEFINITION_FINGERPRINT).toBe(FROZEN_B08_DEFINITION_FINGERPRINT);
    expect(PAPER_DEFINITION_FINGERPRINT).toBe(FROZEN_P09_DEFINITION_FINGERPRINT);
    expect(POSITION_DEFINITION_FINGERPRINT).toBe(FROZEN_PM10_DEFINITION_FINGERPRINT);
    expect(EXIT_DEFINITION_FINGERPRINT).toBe(FROZEN_X11_DEFINITION_FINGERPRINT);
    expect(PERFORMANCE_DEFINITION_FINGERPRINT).toBe(FROZEN_A12_DEFINITION_FINGERPRINT);
    expect(RESEARCH_DEFINITION_FINGERPRINT).toBe(FROZEN_R125_DEFINITION_FINGERPRINT);
    expect(DASHBOARD_DEFINITION_FINGERPRINT).toBe(FROZEN_D13_DEFINITION_FINGERPRINT);
    expect(EXECUTION_DEFINITION_FINGERPRINT).toBe(FROZEN_E14_DEFINITION_FINGERPRINT);
    expect(WALLET_DEFINITION_FINGERPRINT).toBe(FROZEN_W15_DEFINITION_FINGERPRINT);
    expect(LIVE_DEFINITION_FINGERPRINT).toBe(FROZEN_L16_DEFINITION_FINGERPRINT);
    expect(OPTIMIZATION_DEFINITION_FINGERPRINT).toBe(FROZEN_O17_DEFINITION_FINGERPRINT);
    expect(COST_DEFINITION_FINGERPRINT).toBe(FROZEN_COST17_DEFINITION_FINGERPRINT);
    expect(WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT).toBe(FROZEN_WI18_DEFINITION_FINGERPRINT);
    expect(ML_DEFINITION_FINGERPRINT).toBe(FROZEN_ML19_DEFINITION_FINGERPRINT);
    expect(ML_FEATURE_FINGERPRINT).toBe(FROZEN_ML19_FEATURE_FINGERPRINT);
    expect(LATEST_SCHEMA_VERSION).toBe(9);
    expect(migrationSqlDigest(9)).toBe(
      'f9f12785034c3181350b279a20e6baa7676fd8c48fb19dd02ce9ead922d12720',
    );
    expect(() => migrationSqlDigest(10)).toThrow();
  });
});
