import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FEATURE_SET_VERSION } from '../src/features/definitions.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../src/paper/identity.js';
import { PAPER_SPEC_NAME, PAPER_SPEC_VERSION } from '../src/paper/constants.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../src/strategy/identity.js';
import { STRATEGY_VERSION } from '../src/strategy/constants.js';
import {
  POSITION_ENTRY_NOTIONAL_USD,
  POSITION_MAX_OPEN_PER_TOKEN,
  POSITION_SPEC_NAME,
  POSITION_SPEC_VERSION,
} from '../src/position/constants.js';
import { evaluatePositionAction } from '../src/position/evaluator.js';
import {
  POSITION_DEFINITION_FINGERPRINT,
  canonicalPositionDefinition,
  fingerprintPositionDefinition,
  mutateCanonicalPositionDefinition,
  positionEntrySourceIdentity,
  positionEvaluationSourceIdentity,
} from '../src/position/identity.js';
import { derivePaperQuantityTokens } from '../src/position/invariants.js';
import { PositionError } from '../src/position/types.js';
import { USDC_MINT } from '../src/config/index.js';
import { OTHER_PAIR, T_10_00 } from './feature-fixtures.js';
import { passingSnapshot } from './strategy-fixtures.js';
import {
  insufficientPositionBundle,
  noEntryPositionBundle,
  openedPositionFrom,
  paperBundle,
  positionBundle,
  positionBundleAt,
} from './position-fixtures.js';

const FROZEN_PM10_FINGERPRINT = '8c89f5a95f7aadb02d0cd7736b73d563266b2df1f3b16da5d24788eced75aa4f';

describe('pm10_v1 identity', () => {
  it('freezes spec version, name, notional, max positions, and upstream fingerprints', () => {
    expect(POSITION_SPEC_VERSION).toBe('pm10_v1');
    expect(POSITION_SPEC_NAME).toBe('single_open_position_fixed_usd_notional');
    expect(PAPER_SPEC_VERSION).toBe('p09_v1');
    expect(PAPER_SPEC_NAME).toBe('live_reference_price_entry_observation');
    expect(PAPER_DEFINITION_FINGERPRINT).toBe('4951807199956eb0425193fbdb3296289090b6bbffd92f7353718cad0f68a0e0');
    expect(FEATURE_SET_VERSION).toBe('c06_v1');
    expect(STRATEGY_VERSION).toBe('s07_v1');
    expect(STRATEGY_DEFINITION_FINGERPRINT).toBe(
      'b4560629e6a58331e9046f13bad78b73b3bdc1bb7349fc6173ba158b4db067cd',
    );
    expect(POSITION_ENTRY_NOTIONAL_USD).toBe(100);
    expect(POSITION_MAX_OPEN_PER_TOKEN).toBe(1);
    expect(POSITION_DEFINITION_FINGERPRINT).toBe(FROZEN_PM10_FINGERPRINT);
    expect(fingerprintPositionDefinition()).toBe(POSITION_DEFINITION_FINGERPRINT);
    expect(fingerprintPositionDefinition(canonicalPositionDefinition())).toBe(POSITION_DEFINITION_FINGERPRINT);
  });

  it('changes fingerprint when any semantic definition field changes', () => {
    const mutations = [
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.positionSpecVersion = 'pm10_v2';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.positionSpecName = 'other';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.requiredPaperSpecVersion = 'p09_v2';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.requiredPaperDefinitionFingerprint = '0'.repeat(64);
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.eligiblePaperAction = 'no_action';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.noActionMapping.strategy_no_entry = 'other';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.noActionMapping.strategy_insufficient_data = 'other';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.openPositionScope = 'pair_address';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.maxCurrentOpenPositionsPerToken = 2;
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.existingPositionPolicy = 'average';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.pairPolicy = 'move_to_latest_pair';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.entryPriceSource = 'other';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.entryNotionalUsd = 101;
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.quantityFormula = '1 / entryPriceUsd';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.quantityRounding = 'floor';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.balanceModel = 'virtual_cash';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.costModel = 'fees';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.positionMutationAfterOpen = 'scale';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.exitModel = 'fixed_horizon';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.stopLossModel = 'percent';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.takeProfitModel = 'percent';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.paperEventProcessingPolicy = 'latest_paper_only';
      }),
      () => mutateCanonicalPositionDefinition((definition) => {
        definition.sourceStatePolicy = 'ignore_prior';
      }),
    ];

    for (const mutate of mutations) {
      const mutated = mutate();
      expect(fingerprintPositionDefinition(mutated), JSON.stringify(mutated)).not.toBe(
        POSITION_DEFINITION_FINGERPRINT,
      );
    }
  });
});

describe('pm10_v1 state machine', () => {
  it('opens a position from ENTRY_OBSERVATION when none is open', () => {
    const bundle = positionBundle({ marketSnapshot: passingSnapshot({ priceUsd: 0.001 }) });
    expect(bundle.paperEvaluation.paperAction).toBe('entry_observation');
    expect(bundle.positionEvaluation.positionAction).toBe('open_position');
    expect(bundle.positionEvaluation.positionReason).toBeNull();
    expect(bundle.positionEvaluation.entryNotionalUsd).toBe(100);
    expect(bundle.positionEvaluation.entryPriceUsd).toBe(0.001);
    expect(bundle.positionEvaluation.quantityTokens).toBe(100_000);
    expect(bundle.positionEvaluation.positionSourceIdentity).not.toBeNull();
  });

  it('returns NO_CHANGE / position_already_open when a position is already open', () => {
    const first = positionBundle();
    const open = openedPositionFrom(first);
    const samePair = paperBundle({ marketSnapshot: passingSnapshot({ priceUsd: 0.002 }) });
    const samePairEvaluation = evaluatePositionAction({
      paperEvaluation: samePair.paperEvaluation,
      currentOpenPosition: open,
    });
    expect(samePairEvaluation.positionAction).toBe('no_change');
    expect(samePairEvaluation.positionReason).toBe('position_already_open');

    const second = paperBundle({ marketSnapshot: passingSnapshot({ pairAddress: OTHER_PAIR, priceUsd: 0.002 }) });
    const evaluation = evaluatePositionAction({
      paperEvaluation: second.paperEvaluation,
      currentOpenPosition: open,
    });
    expect(evaluation.positionAction).toBe('no_change');
    expect(evaluation.positionReason).toBe('position_already_open');
    expect(evaluation.entryPriceUsd).toBeNull();
    expect(evaluation.entryNotionalUsd).toBeNull();
    expect(evaluation.quantityTokens).toBeNull();
    expect(evaluation.positionSourceIdentity).toBeNull();
    expect(open.pairAddress).not.toBe(OTHER_PAIR);
    expect(open.entryPriceUsd).toBe(first.paperEvaluation.simulatedEntryPriceUsd);
  });

  it('maps paper NO_ENTRY to paper_strategy_no_entry with or without an open position', () => {
    const closed = noEntryPositionBundle();
    expect(closed.positionEvaluation.positionAction).toBe('no_change');
    expect(closed.positionEvaluation.positionReason).toBe('paper_strategy_no_entry');

    const open = openedPositionFrom(positionBundle());
    const withOpen = evaluatePositionAction({
      paperEvaluation: closed.paperEvaluation,
      currentOpenPosition: open,
    });
    expect(withOpen.positionAction).toBe('no_change');
    expect(withOpen.positionReason).toBe('paper_strategy_no_entry');
    expect(open.quantityTokens).toBe(derivePaperQuantityTokens(open.entryPriceUsd));
  });

  it('maps paper INSUFFICIENT_DATA to paper_strategy_insufficient_data with or without an open position', () => {
    const closed = insufficientPositionBundle();
    expect(closed.positionEvaluation.positionAction).toBe('no_change');
    expect(closed.positionEvaluation.positionReason).toBe('paper_strategy_insufficient_data');

    const open = openedPositionFrom(positionBundle());
    const withOpen = evaluatePositionAction({
      paperEvaluation: closed.paperEvaluation,
      currentOpenPosition: open,
    });
    expect(withOpen.positionReason).toBe('paper_strategy_insufficient_data');
    expect(withOpen.positionAction).toBe('no_change');
  });

  it('does not expose hidden actions', () => {
    const source = readFileSync(new URL('../src/position/types.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/'open_position', 'no_change'/);
    expect(source).not.toMatch(/close_position|reduce_position|increase_position|'sell'|'buy'/);
  });
});

describe('pm10_v1 quantity', () => {
  it('derives quantity as 100 / entry price without rounding', () => {
    expect(evaluateOpenQuantity(1)).toBe(100);
    expect(evaluateOpenQuantity(0.5)).toBe(200);
    expect(evaluateOpenQuantity(0.001)).toBe(100_000);
    expect(evaluateOpenQuantity(200)).toBe(0.5);
    const tiny = derivePaperQuantityTokens(Number.MAX_VALUE);
    expect(Number.isFinite(tiny)).toBe(true);
    expect(tiny).toBeGreaterThan(0);
    expect(tiny).toBe(100 / Number.MAX_VALUE);
  });

  it('rejects zero, negative, NaN, Infinity, and overflow-to-Infinity quantities', () => {
    expect(() => derivePaperQuantityTokens(0)).toThrow(PositionError);
    expect(() => derivePaperQuantityTokens(-1)).toThrow(PositionError);
    expect(() => derivePaperQuantityTokens(Number.NaN)).toThrow(PositionError);
    expect(() => derivePaperQuantityTokens(Number.POSITIVE_INFINITY)).toThrow(PositionError);
    expect(() => derivePaperQuantityTokens(Number.MIN_VALUE)).toThrow(PositionError);

    const paper = paperBundle().paperEvaluation;
    for (const price of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MIN_VALUE]) {
      expect(() => {
        evaluatePositionAction({
          paperEvaluation: {
            ...paper,
            referencePriceUsd: price,
            simulatedEntryPriceUsd: price,
          },
          currentOpenPosition: null,
        });
      }).toThrow(PositionError);
    }
  });
});

describe('pm10_v1 upstream paper validation', () => {
  it('rejects forged p09 fields', () => {
    const paper = paperBundle().paperEvaluation;
    const cases: Array<{ label: string; value: typeof paper }> = [
      { label: 'version', value: { ...paper, paperSpecVersion: 'p09_v2' } },
      { label: 'name', value: { ...paper, paperSpecName: 'other' } },
      { label: 'fingerprint', value: { ...paper, paperDefinitionFingerprint: '0'.repeat(64) } },
      { label: 'feature', value: { ...paper, featureSetVersion: 'c06_v2' } },
      { label: 'strategy version', value: { ...paper, strategyVersion: 's07_v2' } },
      { label: 'strategy fingerprint', value: { ...paper, strategyDefinitionFingerprint: '0'.repeat(64) } },
      { label: 'execution', value: { ...paper, executionModel: 'other' as typeof paper.executionModel } },
      { label: 'cost', value: { ...paper, costModel: 'fees' as typeof paper.costModel } },
      { label: 'quantity', value: { ...paper, quantityModel: 'fixed' as typeof paper.quantityModel } },
      { label: 'position', value: { ...paper, positionModel: 'open' as typeof paper.positionModel } },
      { label: 'exit', value: { ...paper, exitModel: 'stop' as typeof paper.exitModel } },
      {
        label: 'entry mapping',
        value: { ...paper, paperAction: 'no_action', noActionReason: 'strategy_no_entry' },
      },
      {
        label: 'simulated price',
        value: { ...paper, simulatedEntryPriceUsd: 0.002 },
      },
    ];

    for (const item of cases) {
      expect(() => {
        evaluatePositionAction({ paperEvaluation: item.value, currentOpenPosition: null });
      }, item.label).toThrow(PositionError);
    }
  });
});

describe('pm10_v1 current open position validation', () => {
  it('rejects malformed current open positions', () => {
    const bundle = positionBundle();
    const open = openedPositionFrom(bundle);
    const paper = bundle.paperEvaluation;

    expect(() => {
      evaluatePositionAction({ paperEvaluation: paper, currentOpenPosition: { ...open, tokenMint: USDC_MINT } });
    }).toThrow(PositionError);
    expect(() => {
      evaluatePositionAction({
        paperEvaluation: paper,
        currentOpenPosition: { ...open, positionSpecVersion: 'pm10_v2' },
      });
    }).toThrow(PositionError);
    expect(() => {
      evaluatePositionAction({
        paperEvaluation: paper,
        currentOpenPosition: { ...open, positionDefinitionFingerprint: '0'.repeat(64) },
      });
    }).toThrow(PositionError);
    expect(() => {
      evaluatePositionAction({
        paperEvaluation: paper,
        currentOpenPosition: { ...open, entryNotionalUsd: 101 },
      });
    }).toThrow(PositionError);
    expect(() => {
      evaluatePositionAction({
        paperEvaluation: paper,
        currentOpenPosition: { ...open, entryPriceUsd: 0 },
      });
    }).toThrow(PositionError);
    expect(() => {
      evaluatePositionAction({
        paperEvaluation: paper,
        currentOpenPosition: { ...open, quantityTokens: open.quantityTokens + 1 },
      });
    }).toThrow(PositionError);
    expect(() => {
      evaluatePositionAction({
        paperEvaluation: paper,
        currentOpenPosition: { ...open, positionSourceIdentity: 'forged' },
      });
    }).toThrow(PositionError);
  });

  it('allows a different existing pair and still returns position_already_open', () => {
    const first = positionBundle();
    const open = { ...openedPositionFrom(first), pairAddress: OTHER_PAIR };
    const second = paperBundle({ marketSnapshot: passingSnapshot({ priceUsd: 0.002 }) });
    const evaluation = evaluatePositionAction({
      paperEvaluation: second.paperEvaluation,
      currentOpenPosition: open,
    });
    expect(evaluation.positionReason).toBe('position_already_open');
    expect(open.pairAddress).toBe(OTHER_PAIR);
    expect(open.entryPriceUsd).toBe(first.positionEvaluation.entryPriceUsd);
  });
});

describe('pm10_v1 identities', () => {
  it('is deterministic and ignores DB ids and wall-clock time', () => {
    const first = evaluatePositionAction({
      paperEvaluation: positionBundleAt(T_10_00).paperEvaluation,
      currentOpenPosition: null,
    });
    const second = evaluatePositionAction({
      paperEvaluation: positionBundleAt(T_10_00).paperEvaluation,
      currentOpenPosition: null,
    });
    expect(first.sourceIdentity).toBe(second.sourceIdentity);
    expect(first.positionSourceIdentity).toBe(second.positionSourceIdentity);
    expect(first.sourceIdentity).toBe(
      positionEvaluationSourceIdentity({
        positionSpecVersion: POSITION_SPEC_VERSION,
        positionDefinitionFingerprint: POSITION_DEFINITION_FINGERPRINT,
        paperSourceIdentity: first.paperSourceIdentity,
        priorOpenPositionSourceIdentity: null,
      }),
    );
    expect(first.positionSourceIdentity).toBe(
      positionEntrySourceIdentity({
        positionSpecVersion: POSITION_SPEC_VERSION,
        positionDefinitionFingerprint: POSITION_DEFINITION_FINGERPRINT,
        openingPaperSourceIdentity: first.paperSourceIdentity,
      }),
    );
  });

  it('changes evaluation identity when paper source, prior position, or spec fingerprint changes', () => {
    const open = openedPositionFrom(positionBundle());
    const paper = positionBundleAt(T_10_00).paperEvaluation;
    const base = evaluatePositionAction({ paperEvaluation: paper, currentOpenPosition: null });
    const withPrior = evaluatePositionAction({ paperEvaluation: paper, currentOpenPosition: open });
    const laterPaper = positionBundleAt('2026-08-17T11:00:00.000Z').paperEvaluation;
    const later = evaluatePositionAction({ paperEvaluation: laterPaper, currentOpenPosition: null });
    expect(withPrior.sourceIdentity).not.toBe(base.sourceIdentity);
    expect(later.sourceIdentity).not.toBe(base.sourceIdentity);
    expect(later.paperSourceIdentity).not.toBe(base.paperSourceIdentity);
  });
});

describe('pm10_v1 purity', () => {
  it('does not import network, sqlite, or Date.now', () => {
    const source = readFileSync(new URL('../src/position/evaluator.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/node:sqlite|fetch\(|Date\.now|Math\.random/);
    expect(source).not.toMatch(/createSqlitePersistenceRepository/);
  });
});

function evaluateOpenQuantity(priceUsd: number): number {
  const bundle = positionBundle({ marketSnapshot: passingSnapshot({ priceUsd }) });
  expect(bundle.positionEvaluation.quantityTokens).not.toBeNull();
  return bundle.positionEvaluation.quantityTokens as number;
}
