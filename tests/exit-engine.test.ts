import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FEATURE_SET_VERSION } from '../src/features/definitions.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../src/paper/identity.js';
import { POSITION_DEFINITION_FINGERPRINT } from '../src/position/identity.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../src/strategy/identity.js';
import { BACKTEST_DEFINITION_FINGERPRINT } from '../src/backtest/identity.js';
import {
  EXIT_CLOSE_FRACTION_BPS,
  EXIT_MAX_HOLDING_MS,
  EXIT_SPEC_NAME,
  EXIT_SPEC_VERSION,
  EXIT_STOP_LOSS_BPS,
  EXIT_TAKE_PROFIT_BPS,
} from '../src/exit/constants.js';
import { evaluateExitAction } from '../src/exit/evaluator.js';
import {
  EXIT_DEFINITION_FINGERPRINT,
  canonicalExitDefinition,
  exitEvaluationSourceIdentity,
  exitEvidenceSourceIdentity,
  fingerprintExitDefinition,
  marketSourceIdentity,
  mutateCanonicalExitDefinition,
} from '../src/exit/identity.js';
import { deriveHoldingAgeMs } from '../src/exit/invariants.js';
import { ExitError } from '../src/exit/types.js';
import { OTHER_PAIR } from './feature-fixtures.js';
import {
  EXIT_STOP_PRICE_USD,
  EXIT_TAKE_PRICE_USD,
  addMs,
  exitMarketSnapshot,
  nextRepresentableNumber,
  openedExitPosition,
  previousRepresentableNumber,
} from './exit-fixtures.js';

describe('x11_v1 identity', () => {
  it('freezes spec version, name, thresholds, and upstream fingerprints', () => {
    expect(EXIT_SPEC_VERSION).toBe('x11_v1');
    expect(EXIT_SPEC_NAME).toBe('fixed_threshold_full_close_baseline');
    expect(EXIT_STOP_LOSS_BPS).toBe(1000);
    expect(EXIT_TAKE_PROFIT_BPS).toBe(2000);
    expect(EXIT_MAX_HOLDING_MS).toBe(21_600_000);
    expect(EXIT_CLOSE_FRACTION_BPS).toBe(10_000);
    expect(FEATURE_SET_VERSION).toBe('c06_v1');
    expect(STRATEGY_DEFINITION_FINGERPRINT).toBe(
      'b4560629e6a58331e9046f13bad78b73b3bdc1bb7349fc6173ba158b4db067cd',
    );
    expect(PAPER_DEFINITION_FINGERPRINT).toBe('4951807199956eb0425193fbdb3296289090b6bbffd92f7353718cad0f68a0e0');
    expect(POSITION_DEFINITION_FINGERPRINT).toBe(
      '8c89f5a95f7aadb02d0cd7736b73d563266b2df1f3b16da5d24788eced75aa4f',
    );
    expect(BACKTEST_DEFINITION_FINGERPRINT).toBe(
      '87bca6f2ea8e57b7613d3627b5a5adf37864142b3c62de97849440189ff07fcf',
    );
    expect(fingerprintExitDefinition()).toBe(EXIT_DEFINITION_FINGERPRINT);
    expect(fingerprintExitDefinition(canonicalExitDefinition())).toBe(EXIT_DEFINITION_FINGERPRINT);
  });

  it('changes fingerprint when any semantic definition field changes', () => {
    const mutations = [
      () => mutateCanonicalExitDefinition((definition) => {
        definition.exitSpecVersion = 'x11_v2';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.exitSpecName = 'other';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.requiredPositionSpecVersion = 'pm10_v2';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.requiredPositionDefinitionFingerprint = '0'.repeat(64);
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.positionScope = 'all_open_positions';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.marketPriceSource = 'best_liquidity_pair';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.marketOrientation = 'allow_quote_side';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.stopLossBps = 1001;
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.stopLossComparison = 'observedPriceUsd < stopTriggerPriceUsd';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.stopPriceFormula = 'entryPriceUsd * 0.9';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.takeProfitBps = 2001;
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.takeProfitComparison = 'observedPriceUsd > takeProfitTriggerPriceUsd';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.takeProfitPriceFormula = 'entryPriceUsd * 1.2';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.maxHoldingMs = 21_600_001;
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.timeComparison = 'holdingAgeMs > maxHoldingMs';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.holdingAgeClockSource = 'Date.now()';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.decisionPrecedence = ['stop', 'take_profit', 'max_holding', 'price_unavailable', 'hold'];
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.closeFractionBps = 5000;
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.closeQuantity = 'half';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.simulatedExitPrice = 'vwap';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.zeroExitPrice = 'rejected';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.costModel = 'fees';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.slippageModel = 'bps';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.partialExitModel = 'scale_out';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.trailingStopModel = 'trailing';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.positionMutation = 'update_quantity';
      }),
      () => mutateCanonicalExitDefinition((definition) => {
        definition.persistencePolicy = 'latest_market_only';
      }),
    ];

    for (const mutate of mutations) {
      const mutated = mutate();
      expect(fingerprintExitDefinition(mutated), JSON.stringify(mutated)).not.toBe(EXIT_DEFINITION_FINGERPRINT);
    }
  });

  it('keeps evaluation and evidence identities free of DB ids, clocks, and randomness', () => {
    const position = openedExitPosition();
    const market = exitMarketSnapshot(position);
    const evaluation = evaluateExitAction({ openPosition: position, marketSnapshot: market });
    const marketIdentity = marketSourceIdentity({
      tokenMint: market.tokenMint,
      pairAddress: market.pairAddress,
      collectedAt: market.collectedAt,
    });
    expect(evaluation.sourceIdentity).toBe(
      exitEvaluationSourceIdentity({
        exitSpecVersion: EXIT_SPEC_VERSION,
        exitDefinitionFingerprint: EXIT_DEFINITION_FINGERPRINT,
        positionSourceIdentity: position.positionSourceIdentity,
        marketSourceIdentity: marketIdentity,
      }),
    );
    const evidence = exitEvidenceSourceIdentity({
      exitSpecVersion: EXIT_SPEC_VERSION,
      exitDefinitionFingerprint: EXIT_DEFINITION_FINGERPRINT,
      positionSourceIdentity: position.positionSourceIdentity,
      exitEvaluationSourceIdentity: evaluation.sourceIdentity,
    });
    expect(evaluation.sourceIdentity).not.toMatch(/"id"|Date\.now|Math\.random|git/);
    expect(evidence).not.toMatch(/"id"|Date\.now|Math\.random|git/);
    expect(marketIdentity).not.toMatch(/market_snapshot_id/);
  });

  it('changes evaluation identity when position source, market time, pair, or definition change', () => {
    const position = openedExitPosition();
    const market = exitMarketSnapshot(position);
    const base = evaluateExitAction({ openPosition: position, marketSnapshot: market }).sourceIdentity;
    const later = evaluateExitAction({
      openPosition: position,
      marketSnapshot: exitMarketSnapshot(position, { collectedAt: addMs(position.openedAt, 1) }),
    }).sourceIdentity;
    const otherPair = evaluateExitAction({
      openPosition: { ...position, pairAddress: OTHER_PAIR },
      marketSnapshot: exitMarketSnapshot({ ...position, pairAddress: OTHER_PAIR }),
    }).sourceIdentity;
    expect(later).not.toBe(base);
    expect(otherPair).not.toBe(base);
    expect(
      exitEvaluationSourceIdentity({
        exitSpecVersion: EXIT_SPEC_VERSION,
        exitDefinitionFingerprint: EXIT_DEFINITION_FINGERPRINT,
        positionSourceIdentity: `${position.positionSourceIdentity}-x`,
        marketSourceIdentity: marketSourceIdentity({
          tokenMint: market.tokenMint,
          pairAddress: market.pairAddress,
          collectedAt: market.collectedAt,
        }),
      }),
    ).not.toBe(base);
    expect(
      fingerprintExitDefinition(mutateCanonicalExitDefinition((definition) => {
        definition.exitSpecName = 'mutated';
      })),
    ).not.toBe(EXIT_DEFINITION_FINGERPRINT);
  });
});

describe('x11_v1 state machine', () => {
  it('closes at and below the stop trigger, and holds one step above it', () => {
    const position = openedExitPosition();
    const below = evaluateExitAction({
      openPosition: position,
      marketSnapshot: exitMarketSnapshot(position, { priceUsd: EXIT_STOP_PRICE_USD - 1 }),
    });
    const exact = evaluateExitAction({
      openPosition: position,
      marketSnapshot: exitMarketSnapshot(position, { priceUsd: EXIT_STOP_PRICE_USD }),
    });
    const aboveStop = evaluateExitAction({
      openPosition: position,
      marketSnapshot: exitMarketSnapshot(position, { priceUsd: nextRepresentableNumber(EXIT_STOP_PRICE_USD) }),
    });
    expect(below.exitAction).toBe('close_position');
    expect(below.exitReason).toBe('stop_loss_threshold');
    expect(exact.exitAction).toBe('close_position');
    expect(exact.exitReason).toBe('stop_loss_threshold');
    expect(EXIT_STOP_PRICE_USD).toBe(90);
    expect(nextRepresentableNumber(EXIT_STOP_PRICE_USD)).toBeGreaterThan(EXIT_STOP_PRICE_USD);
    expect(aboveStop.exitAction).toBe('no_change');
    expect(aboveStop.exitReason).toBe('exit_conditions_not_met');
  });

  it('closes at and above the take-profit trigger, and holds one step below it', () => {
    const position = openedExitPosition();
    const exact = evaluateExitAction({
      openPosition: position,
      marketSnapshot: exitMarketSnapshot(position, { priceUsd: EXIT_TAKE_PRICE_USD }),
    });
    const above = evaluateExitAction({
      openPosition: position,
      marketSnapshot: exitMarketSnapshot(position, { priceUsd: EXIT_TAKE_PRICE_USD + 1 }),
    });
    const belowTake = evaluateExitAction({
      openPosition: position,
      marketSnapshot: exitMarketSnapshot(position, { priceUsd: previousRepresentableNumber(EXIT_TAKE_PRICE_USD) }),
    });
    expect(EXIT_TAKE_PRICE_USD).toBe(120);
    expect(previousRepresentableNumber(EXIT_TAKE_PRICE_USD)).toBeLessThan(EXIT_TAKE_PRICE_USD);
    expect(exact.exitAction).toBe('close_position');
    expect(exact.exitReason).toBe('take_profit_threshold');
    expect(above.exitAction).toBe('close_position');
    expect(above.exitReason).toBe('take_profit_threshold');
    expect(belowTake.exitAction).toBe('no_change');
    expect(belowTake.exitReason).toBe('exit_conditions_not_met');
  });

  it('closes at exact max holding time and holds 1ms earlier', () => {
    const position = openedExitPosition();
    const exact = evaluateExitAction({
      openPosition: position,
      marketSnapshot: exitMarketSnapshot(position, {
        priceUsd: 100,
        collectedAt: addMs(position.openedAt, EXIT_MAX_HOLDING_MS),
      }),
    });
    const earlier = evaluateExitAction({
      openPosition: position,
      marketSnapshot: exitMarketSnapshot(position, {
        priceUsd: 100,
        collectedAt: addMs(position.openedAt, EXIT_MAX_HOLDING_MS - 1),
      }),
    });
    expect(exact.exitAction).toBe('close_position');
    expect(exact.exitReason).toBe('max_holding_time');
    expect(exact.holdingAgeMs).toBe(EXIT_MAX_HOLDING_MS);
    expect(earlier.exitAction).toBe('no_change');
    expect(earlier.exitReason).toBe('exit_conditions_not_met');
    expect(earlier.holdingAgeMs).toBe(EXIT_MAX_HOLDING_MS - 1);
  });

  it('uses price-unavailable even when max holding is reached', () => {
    const position = openedExitPosition();
    const evaluation = evaluateExitAction({
      openPosition: position,
      marketSnapshot: exitMarketSnapshot(position, {
        priceUsd: null,
        collectedAt: addMs(position.openedAt, EXIT_MAX_HOLDING_MS),
      }),
    });
    expect(evaluation.exitAction).toBe('no_change');
    expect(evaluation.exitReason).toBe('market_price_unavailable');
    expect(evaluation.simulatedExitPriceUsd).toBeNull();
    expect(evaluation.closedQuantityTokens).toBeNull();
  });

  it('prefers stop and take-profit over max holding time', () => {
    const position = openedExitPosition();
    const maxAt = addMs(position.openedAt, EXIT_MAX_HOLDING_MS);
    const stop = evaluateExitAction({
      openPosition: position,
      marketSnapshot: exitMarketSnapshot(position, { priceUsd: 90, collectedAt: maxAt }),
    });
    const take = evaluateExitAction({
      openPosition: position,
      marketSnapshot: exitMarketSnapshot(position, { priceUsd: 120, collectedAt: maxAt }),
    });
    expect(stop.exitReason).toBe('stop_loss_threshold');
    expect(take.exitReason).toBe('take_profit_threshold');
  });

  it('closes at observed price 0 as a stop, preserving quantity', () => {
    const position = openedExitPosition();
    const evaluation = evaluateExitAction({
      openPosition: position,
      marketSnapshot: exitMarketSnapshot(position, { priceUsd: 0 }),
    });
    expect(evaluation.exitAction).toBe('close_position');
    expect(evaluation.exitReason).toBe('stop_loss_threshold');
    expect(evaluation.simulatedExitPriceUsd).toBe(0);
    expect(Object.is(evaluation.closedQuantityTokens, position.quantityTokens)).toBe(true);
    expect(evaluation.closedQuantityTokens).toBe(1);
  });

  it('rejects non-positive and nonfinite entry prices and negative holding age', () => {
    const position = openedExitPosition();
    const market = exitMarketSnapshot(position, { priceUsd: 100 });
    for (const entryPriceUsd of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() =>
        evaluateExitAction({
          openPosition: { ...position, entryPriceUsd, quantityTokens: 1 },
          marketSnapshot: market,
        }),
      ).toThrow(ExitError);
    }
    expect(() => deriveHoldingAgeMs(addMs(position.openedAt, -1), position.openedAt)).toThrow(ExitError);
  });

  it('rejects negative, NaN, and infinite observed prices', () => {
    const position = openedExitPosition();
    expect(() =>
      evaluateExitAction({
        openPosition: position,
        marketSnapshot: exitMarketSnapshot(position, { priceUsd: -0.01 }),
      }),
    ).toThrow(ExitError);
    expect(() =>
      evaluateExitAction({
        openPosition: position,
        marketSnapshot: exitMarketSnapshot(position, { priceUsd: Number.NaN }),
      }),
    ).toThrow(ExitError);
    expect(() =>
      evaluateExitAction({
        openPosition: position,
        marketSnapshot: exitMarketSnapshot(position, { priceUsd: Number.POSITIVE_INFINITY }),
      }),
    ).toThrow(ExitError);
    expect(() =>
      evaluateExitAction({
        openPosition: position,
        marketSnapshot: exitMarketSnapshot(position, { priceUsd: Number.NEGATIVE_INFINITY }),
      }),
    ).toThrow(ExitError);
  });

  it('rejects market snapshots before openedAt, wrong token, or wrong pair', () => {
    const position = openedExitPosition();
    expect(() =>
      evaluateExitAction({
        openPosition: position,
        marketSnapshot: exitMarketSnapshot(position, { collectedAt: addMs(position.openedAt, -1) }),
      }),
    ).toThrow(/openedAt/);
    expect(() =>
      evaluateExitAction({
        openPosition: position,
        marketSnapshot: exitMarketSnapshot(position, { tokenMint: 'So11111111111111111111111111111111111111113' }),
      }),
    ).toThrow(/token mint/);
    expect(() =>
      evaluateExitAction({
        openPosition: position,
        marketSnapshot: exitMarketSnapshot(position, { pairAddress: OTHER_PAIR }),
      }),
    ).toThrow(/opening pair/);
  });

  it('uses the exact observed price and exact quantity on close, with no remaining quantity', () => {
    const position = openedExitPosition();
    const market = exitMarketSnapshot(position, { priceUsd: 88.25 });
    const evaluation = evaluateExitAction({ openPosition: position, marketSnapshot: market });
    expect(evaluation.exitAction).toBe('close_position');
    expect(evaluation.simulatedExitPriceUsd).toBe(88.25);
    expect(Object.is(evaluation.closedQuantityTokens, position.quantityTokens)).toBe(true);
    expect(EXIT_CLOSE_FRACTION_BPS).toBe(10_000);
  });
});

describe('x11_v1 source freeze', () => {
  it('does not compute PnL, remaining quantity, or inspect strategy/risk', () => {
    const files = [
      'src/exit/evaluator.ts',
      'src/exit/invariants.ts',
      'src/exit/types.ts',
      'src/exit/identity.ts',
      'src/exit/constants.ts',
      'src/exit/execute.ts',
    ];
    const source = files.map((file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')).join('\n');
    expect(source).not.toMatch(/realizedPnl|unrealizedPnl|returnPct|marketValue|exitNotional|equity|profitUsd|lossUsd/);
    expect(source).not.toMatch(/\bremainingQuantity\b|\bpartialExit\b|\btrailingStop\b/);
    expect(source).not.toMatch(/evaluateStrategy|generateFeatureVector|evaluatePaperAction|evaluatePositionAction/);
    expect(source).not.toMatch(/Date\.now\(|Math\.random/);
    expect(readFileSync(new URL('../src/exit/evaluator.ts', import.meta.url), 'utf8')).not.toMatch(
      /quantityTokens\s*\*|closedQuantityTokens\s*\*/,
    );
  });
});
