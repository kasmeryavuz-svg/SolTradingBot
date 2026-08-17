import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FEATURE_NAMES, FEATURE_SET_VERSION } from '../src/features/definitions.js';
import { featureSourceIdentity } from '../src/features/numbers.js';
import {
  FROZEN_S07_V1_DEFINITION_FINGERPRINT,
  PAPER_COST_MODEL,
  PAPER_EXECUTION_MODEL,
  PAPER_EXIT_MODEL,
  PAPER_POSITION_MODEL,
  PAPER_QUANTITY_MODEL,
  PAPER_SPEC_NAME,
  PAPER_SPEC_VERSION,
  REQUIRED_PAPER_FEATURE_SET_VERSION,
  REQUIRED_PAPER_STRATEGY_VERSION,
} from '../src/paper/constants.js';
import { evaluatePaperAction } from '../src/paper/evaluator.js';
import {
  PAPER_DEFINITION_FINGERPRINT,
  canonicalPaperDefinition,
  fingerprintPaperDefinition,
  mutateCanonicalPaperDefinition,
  paperSourceIdentity,
  paperSourceIdentityFromVector,
} from '../src/paper/identity.js';
import {
  assertMarketSnapshotMatchesFeatureVector,
  assertPaperEvaluationInvariants,
} from '../src/paper/invariants.js';
import { PaperError } from '../src/paper/types.js';
import { STRATEGY_DEFINITION_FINGERPRINT, strategySourceIdentity } from '../src/strategy/identity.js';
import { STRATEGY_VERSION } from '../src/strategy/constants.js';
import { OTHER_PAIR, T_10_05 } from './feature-fixtures.js';
import {
  insufficientPaperBundle,
  nextRepresentableNumber,
  noEntryPaperBundle,
  paperBundle,
} from './paper-fixtures.js';
import { passingBundle, passingSnapshot } from './strategy-fixtures.js';

const FROZEN_P09_V1_DEFINITION_FINGERPRINT =
  '4951807199956eb0425193fbdb3296289090b6bbffd92f7353718cad0f68a0e0';

describe('p09_v1 paper spec', () => {
  it('freezes the paper spec, strategy, and feature set', () => {
    expect(PAPER_SPEC_VERSION).toBe('p09_v1');
    expect(PAPER_SPEC_NAME).toBe('live_reference_price_entry_observation');
    expect(REQUIRED_PAPER_FEATURE_SET_VERSION).toBe('c06_v1');
    expect(REQUIRED_PAPER_STRATEGY_VERSION).toBe('s07_v1');
    expect(FEATURE_SET_VERSION).toBe('c06_v1');
    expect(FEATURE_NAMES).toHaveLength(48);
    expect(STRATEGY_VERSION).toBe('s07_v1');
    expect(STRATEGY_DEFINITION_FINGERPRINT).toBe(FROZEN_S07_V1_DEFINITION_FINGERPRINT);
    expect(FROZEN_S07_V1_DEFINITION_FINGERPRINT).toBe(
      'b4560629e6a58331e9046f13bad78b73b3bdc1bb7349fc6173ba158b4db067cd',
    );
    expect(PAPER_DEFINITION_FINGERPRINT).toBe(FROZEN_P09_V1_DEFINITION_FINGERPRINT);
    expect(PAPER_EXECUTION_MODEL).toBe('exact_strategy_market_snapshot_reference_price');
    expect(PAPER_COST_MODEL).toBe('none');
    expect(PAPER_QUANTITY_MODEL).toBe('none');
    expect(PAPER_POSITION_MODEL).toBe('none');
    expect(PAPER_EXIT_MODEL).toBe('none');
  });

  it('fingerprints the canonical definition deterministically without wall-clock or function source', () => {
    expect(fingerprintPaperDefinition()).toBe(PAPER_DEFINITION_FINGERPRINT);
    expect(fingerprintPaperDefinition(canonicalPaperDefinition())).toBe(PAPER_DEFINITION_FINGERPRINT);
    const encoded = JSON.stringify(canonicalPaperDefinition());
    expect(encoded).not.toMatch(/Date\.now|new Date|getTime|toISOString|function |=>/);
    expect(Object.keys(canonicalPaperDefinition())).toEqual([
      'paperSpecVersion',
      'paperSpecName',
      'requiredFeatureSetVersion',
      'requiredStrategyVersion',
      'eligibleStrategyDecision',
      'actionMapping',
      'referencePriceSource',
      'simulatedEntryPrice',
      'executionModel',
      'costModel',
      'quantityModel',
      'positionModel',
      'exitModel',
      'candidateCooldown',
      'candidateTransitionSuppression',
      'persistencePolicy',
    ]);
  });

  it('changes fingerprint when p09_v1 semantics are mutated in fixtures', () => {
    const original = PAPER_DEFINITION_FINGERPRINT;
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.paperSpecVersion = 'p09_v2';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.paperSpecName = 'other_spec';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.eligibleStrategyDecision = 'no_entry';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.actionMapping.entry_candidate.action = 'buy';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.actionMapping.no_entry.action = 'skip';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.actionMapping.insufficient_data.action = 'skip';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.actionMapping.no_entry.noActionReason = 'other';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.actionMapping.insufficient_data.noActionReason = 'other';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.referencePriceSource = 'latest_database_price';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.simulatedEntryPrice = 'reference_price_plus_spread';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.executionModel = 'modeled_fill';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.costModel = 'modeled';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.quantityModel = 'fixed';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.positionModel = 'modeled';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.exitModel = 'modeled';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.candidateCooldown = 'enabled';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.candidateTransitionSuppression = 'enabled';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.persistencePolicy = 'overwrite_on_conflict';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.requiredStrategyVersion = 's07_v2';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.requiredFeatureSetVersion = 'c06_v2';
        }),
      ),
    ).not.toBe(original);
    expect(
      fingerprintPaperDefinition(
        mutateCanonicalPaperDefinition((item) => {
          item.actionMapping = {
            insufficient_data: item.actionMapping.insufficient_data,
            no_entry: item.actionMapping.no_entry,
            entry_candidate: item.actionMapping.entry_candidate,
          };
        }),
      ),
    ).not.toBe(original);
    expect(fingerprintPaperDefinition()).toBe(original);
  });
});

describe('p09_v1 action mapping', () => {
  it('maps ENTRY_CANDIDATE to an entry observation with exact market prices', () => {
    const bundle = paperBundle();
    const evaluation = bundle.paperEvaluation;
    expect(evaluation.strategyDecision).toBe('entry_candidate');
    expect(evaluation.paperAction).toBe('entry_observation');
    expect(evaluation.noActionReason).toBeNull();
    expect(evaluation.referencePriceUsd).toBe(0.001);
    expect(evaluation.simulatedEntryPriceUsd).toBe(0.001);
    expect(evaluation.referencePriceUsd).toBe(bundle.marketSnapshot.priceUsd);
    expect(evaluation.simulatedEntryPriceUsd).toBe(evaluation.referencePriceUsd);
    expect(evaluation.executionModel).toBe(PAPER_EXECUTION_MODEL);
    expect(evaluation.costModel).toBe('none');
    expect(evaluation.quantityModel).toBe('none');
    expect(evaluation.positionModel).toBe('none');
    expect(evaluation.exitModel).toBe('none');
    expect(evaluation.evaluatedAt).toBe(bundle.strategyEvaluation.evaluatedAt);
  });

  it('maps NO_ENTRY and INSUFFICIENT_DATA to no_action without prices', () => {
    const noEntry = noEntryPaperBundle().paperEvaluation;
    expect(noEntry.strategyDecision).toBe('no_entry');
    expect(noEntry.paperAction).toBe('no_action');
    expect(noEntry.noActionReason).toBe('strategy_no_entry');
    expect(noEntry.referencePriceUsd).toBeNull();
    expect(noEntry.simulatedEntryPriceUsd).toBeNull();

    const insufficient = insufficientPaperBundle().paperEvaluation;
    expect(insufficient.strategyDecision).toBe('insufficient_data');
    expect(insufficient.paperAction).toBe('no_action');
    expect(insufficient.noActionReason).toBe('strategy_insufficient_data');
    expect(insufficient.referencePriceUsd).toBeNull();
    expect(insufficient.simulatedEntryPriceUsd).toBeNull();
  });

  it('does not add a second strategy, score, or majority rule', () => {
    const source = readFileSync(new URL('../src/paper/evaluator.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/MIN_LIQUIDITY|score|majority|cooldown|slippage|fee|notional|quantity \*|balance/);
    expect(source).not.toMatch(/Date\.now|Math\.random|fetch\(|node:sqlite/);
  });
});

describe('p09_v1 prices and source linkage', () => {
  it('rejects invalid ENTRY_CANDIDATE market prices instead of converting them to NO_ACTION', () => {
    const bundle = passingBundle();
    for (const priceUsd of [0, -0.001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => {
        evaluatePaperAction({
          ...bundle,
          marketSnapshot: { ...bundle.marketSnapshot, priceUsd },
        });
      }).toThrow(PaperError);
    }
  });

  it('rejects a forged market snapshot price that disagrees with feature vector market_price_usd', () => {
    const bundle = passingBundle();
    const forged = { ...bundle.marketSnapshot, priceUsd: 999 };
    expect(() => {
      assertMarketSnapshotMatchesFeatureVector(forged, bundle.featureVector);
    }).toThrow(/market_price_usd/);
    expect(() => {
      evaluatePaperAction({
        ...bundle,
        marketSnapshot: forged,
      });
    }).toThrow(/market_price_usd/);
    expect(() => {
      evaluatePaperAction({
        ...bundle,
        marketSnapshot: { ...bundle.marketSnapshot, priceUsd: nextRepresentableNumber(0.001) },
      });
    }).toThrow(/market_price_usd/);
  });

  it('rejects forged paper prices, including NO_ACTION numeric prices', () => {
    const entry = paperBundle();
    expect(() => {
      assertPaperEvaluationInvariants(
        {
          ...entry.paperEvaluation,
          referencePriceUsd: nextRepresentableNumber(0.001),
          simulatedEntryPriceUsd: nextRepresentableNumber(0.001),
        },
        entry,
      );
    }).toThrow(/referencePriceUsd/);
    expect(() => {
      assertPaperEvaluationInvariants(
        {
          ...entry.paperEvaluation,
          simulatedEntryPriceUsd: nextRepresentableNumber(0.001),
        },
        entry,
      );
    }).toThrow(/simulatedEntryPriceUsd/);

    const noEntry = noEntryPaperBundle();
    expect(() => {
      assertPaperEvaluationInvariants(
        {
          ...noEntry.paperEvaluation,
          referencePriceUsd: 0.001,
          simulatedEntryPriceUsd: 0.001,
        },
        noEntry,
      );
    }).toThrow(/must not store a reference or simulated entry price/);

    const insufficient = insufficientPaperBundle();
    expect(() => {
      assertPaperEvaluationInvariants(
        {
          ...insufficient.paperEvaluation,
          referencePriceUsd: 0.001,
          simulatedEntryPriceUsd: 0.001,
        },
        insufficient,
      );
    }).toThrow(/must not store a reference or simulated entry price/);
  });

  it('does not apply slippage, spread, or fee adjustments', () => {
    const evaluation = paperBundle({
      marketSnapshot: passingSnapshot({ priceUsd: 0.001 }),
    }).paperEvaluation;
    expect(evaluation.simulatedEntryPriceUsd).toBe(0.001);
    expect(evaluation.simulatedEntryPriceUsd).not.toBe(0.001 * 1.005);
  });

  it('recomputes feature, strategy, and paper identities from the exact bundle', () => {
    const bundle = paperBundle();
    const featureIdentity = featureSourceIdentity(bundle.featureVector);
    const strategyIdentity = strategySourceIdentity({
      strategyVersion: 's07_v1',
      strategyDefinitionFingerprint: STRATEGY_DEFINITION_FINGERPRINT,
      featureSourceIdentity: featureIdentity,
    });
    expect(bundle.paperEvaluation.tokenMint).toBe(bundle.marketSnapshot.tokenMint);
    expect(bundle.paperEvaluation.tokenMint).toBe(bundle.featureVector.tokenMint);
    expect(bundle.paperEvaluation.tokenMint).toBe(bundle.strategyEvaluation.tokenMint);
    expect(bundle.paperEvaluation.pairAddress).toBe(bundle.featureVector.marketPairAddress);
    expect(bundle.paperEvaluation.marketCollectedAt).toBe(bundle.featureVector.marketCollectedAt);
    expect(bundle.paperEvaluation.asOf).toBe(bundle.strategyEvaluation.asOf);
    expect(bundle.paperEvaluation.featureSourceIdentity).toBe(featureIdentity);
    expect(bundle.paperEvaluation.strategySourceIdentity).toBe(strategyIdentity);
    expect(paperSourceIdentityFromVector(bundle.featureVector)).toBe(
      paperSourceIdentity({
        paperSpecVersion: PAPER_SPEC_VERSION,
        paperDefinitionFingerprint: PAPER_DEFINITION_FINGERPRINT,
        strategySourceIdentity: strategyIdentity,
      }),
    );
  });

  it('rejects mismatched tokens, pairs, timestamps, versions, fingerprints, and forged identities', () => {
    const bundle = passingBundle();
    expect(() => {
      evaluatePaperAction({
        ...bundle,
        marketSnapshot: { ...bundle.marketSnapshot, pairAddress: OTHER_PAIR },
      });
    }).toThrow(/pair/i);
    expect(() => {
      evaluatePaperAction({
        ...bundle,
        marketSnapshot: { ...bundle.marketSnapshot, collectedAt: T_10_05 },
      });
    }).toThrow(/collectedAt/);
    expect(() => {
      evaluatePaperAction({
        ...bundle,
        marketSnapshot: { ...bundle.marketSnapshot, tokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
      });
    }).toThrow(/token mint/i);
    expect(() => {
      evaluatePaperAction({
        ...bundle,
        featureVector: { ...bundle.featureVector, featureSetVersion: 'c06_v2' },
      });
    }).toThrow(PaperError);
    expect(() => {
      evaluatePaperAction({
        ...bundle,
        strategyEvaluation: { ...bundle.strategyEvaluation, strategyVersion: 's07_v2' },
      });
    }).toThrow(PaperError);
    expect(() => {
      evaluatePaperAction({
        ...bundle,
        strategyEvaluation: { ...bundle.strategyEvaluation, strategyDefinitionFingerprint: '0'.repeat(64) },
      });
    }).toThrow(/fingerprint/);
    expect(() => {
      evaluatePaperAction({
        ...bundle,
        strategyEvaluation: { ...bundle.strategyEvaluation, featureSourceIdentity: 'forged-feature' },
      });
    }).toThrow(PaperError);
  });

  it('excludes database ids and recording time from paper source identity', () => {
    const encoded = paperSourceIdentity({
      paperSpecVersion: PAPER_SPEC_VERSION,
      paperDefinitionFingerprint: PAPER_DEFINITION_FINGERPRINT,
      strategySourceIdentity: 'strategy-source',
    });
    expect(encoded).toBe(
      JSON.stringify({
        paperSpecVersion: PAPER_SPEC_VERSION,
        paperDefinitionFingerprint: PAPER_DEFINITION_FINGERPRINT,
        strategySourceIdentity: 'strategy-source',
      }),
    );
    expect(encoded).not.toMatch(/firstRecordedAt|first_recorded_at|"id"|Date\.now/);
  });
});
