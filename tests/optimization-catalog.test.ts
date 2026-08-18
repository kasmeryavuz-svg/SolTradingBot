import { describe, expect, it } from 'vitest';
import { EXIT_DEFINITION_FINGERPRINT } from '../src/exit/identity.js';
import { FROZEN_S07_V1_DEFINITION_FINGERPRINT } from '../src/research/constants.js';
import { listResearchCandidateDescriptors } from '../src/research/catalog.js';
import {
  ENTRY_CANDIDATE_COUNT,
  EXIT_CANDIDATE_COUNT,
} from '../src/optimization/constants.js';
import {
  listOptimizationEntryDescriptors,
  listOptimizationExitDescriptors,
  optimizationEntryCatalog,
  optimizationExitCatalog,
} from '../src/optimization/catalog.js';
import { listCostScenarios } from '../src/optimization/costs.js';
import {
  evaluateOptimizationEntry,
  fingerprintOptimizationEntry,
} from '../src/optimization/entries.js';
import { fingerprintExitCandidate } from '../src/optimization/exits.js';
import { passingVector, withAvailableNumber } from './strategy-fixtures.js';

describe('optimization catalogs', () => {
  it('lists eight entries in frozen registry order, not ranked by results', () => {
    const catalog = optimizationEntryCatalog();
    expect(catalog).toHaveLength(ENTRY_CANDIDATE_COUNT);
    expect(catalog.map((entry) => entry.candidateId)).toEqual([
      's07_baseline',
      'quality_control_v1',
      'time_series_momentum_v1',
      'flow_confirmed_momentum_v1',
      'runner_friendly_momentum_v1',
      'quality_liquid_v1',
      'flow_quality_v1',
      'runner_flow_v1',
    ]);
  });

  it('reuses the five frozen r125 entry fingerprints unchanged', () => {
    const research = Object.fromEntries(
      listResearchCandidateDescriptors().map((item) => [
        item.candidateId,
        item.candidateDefinitionFingerprint,
      ]),
    );
    expect(fingerprintOptimizationEntry('s07_baseline')).toBe(FROZEN_S07_V1_DEFINITION_FINGERPRINT);
    for (const entry of listOptimizationEntryDescriptors().filter((item) => item.frozenR125)) {
      expect(entry.candidateDefinitionFingerprint).toBe(research[entry.candidateId]);
      expect(fingerprintOptimizationEntry(entry.candidateId)).toBe(entry.candidateDefinitionFingerprint);
    }
  });

  it('pins the three new CP17 entry fingerprints', () => {
    expect(fingerprintOptimizationEntry('quality_liquid_v1')).toBe(
      'cafa56f707b1a9d46882876eb69a54ae8f19e62874b3cfbfa28bf26e921be3fa',
    );
    expect(fingerprintOptimizationEntry('flow_quality_v1')).toBe(
      '984c5bfa8477ab4893e8bb724b44c0ddc07be93746eb4e67cd9f10aca0b535fb',
    );
    expect(fingerprintOptimizationEntry('runner_flow_v1')).toBe(
      '1eb1a5ffd3fc41636b6735a59dba13a17888007627520887835259d88d7827c2',
    );
  });

  it('lists five exits with frozen x11 first and pins new exit fingerprints', () => {
    const catalog = optimizationExitCatalog();
    expect(catalog).toHaveLength(EXIT_CANDIDATE_COUNT);
    expect(catalog.map((exit) => exit.candidateId)).toEqual([
      'x11_baseline',
      'tight_risk_v1',
      'wider_runner_v1',
      'partial_runner_v1',
      'moonbag_runner_v1',
    ]);
    expect(fingerprintExitCandidate('x11_baseline')).toBe(EXIT_DEFINITION_FINGERPRINT);
    expect(fingerprintExitCandidate('tight_risk_v1')).toBe(
      'eb0abda25f5fed911d35e525b934c767298f9deb0baf3fc4c0a8701522141eb8',
    );
    expect(fingerprintExitCandidate('wider_runner_v1')).toBe(
      'f3f7166a0904c9aeb243dbbe80103fd7c35caff8b4b38fd4130014b07a7a75cf',
    );
    expect(fingerprintExitCandidate('partial_runner_v1')).toBe(
      '0332e242e42d4aea6eb469cb02a4c7f1c4ebd5c587924bf338d3fd1ec7d2dc7d',
    );
    expect(fingerprintExitCandidate('moonbag_runner_v1')).toBe(
      '2aaf29499879dc91fc4a0569aaa4eaa4e2ee99bf5d98e7c386e0fb3b95d99366',
    );
    expect(listOptimizationExitDescriptors()[0]?.usesFrozenX11Evaluator).toBe(true);
  });

  it('lists LOW BASE STRESS costs without ranking or performance', () => {
    expect(listCostScenarios().map((scenario) => scenario.scenarioId)).toEqual(['LOW', 'BASE', 'STRESS']);
    expect(JSON.stringify(listOptimizationEntryDescriptors())).not.toMatch(/expectancy|profitFactor|PnL/i);
  });

  it('evaluates the three new entries on a known passing vector', () => {
    const vector = passingVector();
    expect(evaluateOptimizationEntry('quality_liquid_v1', vector).decision).toBe('entry_candidate');
    expect(evaluateOptimizationEntry('flow_quality_v1', vector).decision).toBe('entry_candidate');
    expect(evaluateOptimizationEntry('runner_flow_v1', vector).decision).toBe('no_entry');
    expect(
      evaluateOptimizationEntry(
        'runner_flow_v1',
        withAvailableNumber(vector, 'market_price_change_1h_pct', 1),
      ).decision,
    ).toBe('entry_candidate');
  });

  it('does not treat unavailable required features as 0, false, or safe', () => {
    const vector = passingVector();
    const unavailable = {
      ...vector,
      values: vector.values.map((value) =>
        value.name === 'market_liquidity_usd'
          ? { ...value, status: 'unavailable' as const, value: null, reason: 'missing' }
          : value,
      ),
    };
    expect(evaluateOptimizationEntry('quality_control_v1', unavailable).decision).toBe('insufficient_data');
    expect(evaluateOptimizationEntry('quality_liquid_v1', unavailable).decision).toBe('insufficient_data');
    expect(evaluateOptimizationEntry('flow_quality_v1', unavailable).decision).toBe('insufficient_data');
  });
});
