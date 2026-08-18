import { describe, expect, it } from 'vitest';
import { evaluateMlPromotion } from '../src/ml/promotion.js';
import { MODEL_SIGNAL_THRESHOLD } from '../src/ml/constants.js';
import type {
  ClassificationMetrics,
  MlFoldResult,
  RuntimeIntegrityReport,
  SelectedEconomicSlice,
} from '../src/ml/types.js';
import { emptyScenario } from './optimization-fixtures.js';

function metrics(overrides: Partial<ClassificationMetrics> = {}): ClassificationMetrics {
  return {
    labeledSamples: 120,
    positiveCount: 60,
    negativeCount: 60,
    positiveBaseRate: 0.5,
    rocAuc: 0.6,
    prAuc: 0.6,
    logLoss: 0.5,
    brierScore: 0.2,
    threshold: MODEL_SIGNAL_THRESHOLD,
    selectedCount: 40,
    precision: 0.6,
    recall: 0.4,
    truePositiveCount: 24,
    falsePositiveCount: 16,
    trueNegativeCount: 44,
    falseNegativeCount: 36,
    calibration: [],
    ...overrides,
  };
}

function economics(overrides: Partial<SelectedEconomicSlice> = {}): SelectedEconomicSlice {
  return {
    testDecisionSamples: 40,
    testFeatureEligibleSamples: 40,
    testLabeledSamples: 40,
    testCensoredSamples: 0,
    selectedSamples: 40,
    selectedOpened: 40,
    completed: 40,
    censored: 0,
    selectedCensoringBps: 0,
    selectedIdentities: [],
    completedIdentities: [],
    censoredIdentities: [],
    netBase: emptyScenario('BASE', {
      completedTrades: 40,
      expectancyUsd: 1,
      profitFactor: { kind: 'finite', value: 1.2 },
      maxDrawdownPctOfReferenceBasis: 10,
      top1PositiveConcentration: 20,
      top3PositiveConcentration: 40,
    }),
    netStress: emptyScenario('STRESS', {
      completedTrades: 40,
      expectancyUsd: 0.5,
    }),
    positiveFoldCount: 4,
    ...overrides,
  };
}

function fold(id: 1 | 2 | 3 | 4, overrides: Partial<MlFoldResult> = {}): MlFoldResult {
  return {
    fold: {
      foldId: id,
      trainSegmentIds: ['S1', 'S2'],
      testSegmentId: 'S3',
      trainStartInclusiveMs: 0,
      trainEndExclusiveMs: 1,
      testStartInclusiveMs: 1,
      testEndExclusiveMs: 2,
      testEndInclusiveMs: 1,
      trainLatestEntryInclusiveMs: 0,
      testLatestEntryInclusiveMs: 1,
      optimizationFoldFingerprint: 'f'.repeat(64),
    },
    purge: {
      trainDecisionSamples: 100,
      trainSamplesBeforePurge: 100,
      trainSamplesPurged: 0,
      trainSamplesAfterPurge: 100,
      trainCensoredCount: 0,
      trainCensoringBps: 0,
      testDecisionSamples: 30,
      testFeatureEligibleSamples: 30,
      testSampleCount: 30,
      testLabeledCount: 30,
      testPositiveCount: 15,
      testNegativeCount: 15,
      testCensoredCount: 0,
      testCensoringBps: 0,
    },
    evaluability: {
      evaluable: true,
      trainDecisionSamples: 100,
      trainLabeled: 100,
      trainCensored: 0,
      trainCensoringBps: 0,
      testDecisionSamples: 30,
      testLabeled: 30,
      testCensored: 0,
      testCensoringBps: 0,
      trainPositives: 20,
      trainNegatives: 20,
      testPositives: 5,
      testNegatives: 5,
      reasons: [],
    },
    preprocessorFingerprint: 'a'.repeat(64),
    modelFingerprint: 'b'.repeat(64),
    nullFingerprint: 'c'.repeat(64),
    logistic: {
      fingerprint: 'd'.repeat(64),
      hyperparameters: {
        learningRate: 0.05,
        maxIterations: 1000,
        l2Lambda: 0.01,
        interceptRegularized: false,
        probabilityEpsilon: 1e-12,
        sigmoidClip: 35,
        earlyStopAbsoluteImprovement: 1e-10,
        earlyStopConsecutiveIterations: 5,
        initialization: 'all_zero',
      },
      coefficients: [],
      intercept: 0,
      iterations: 10,
      finalTrainLoss: 0.5,
      converged: true,
      sampleCount: 100,
      positiveCount: 50,
      negativeCount: 50,
    },
    nullModel: {
      fingerprint: 'e'.repeat(64),
      trainPositiveRate: 0.5,
      probability: 0.5,
      sampleCount: 100,
      positiveCount: 50,
      negativeCount: 50,
    },
    coefficients: [],
    predictedIdentities: [],
    selectedIdentities: [],
    testPredictions: [],
    labeledTestPredictions: [],
    metrics: metrics({ rocAuc: 0.6 }),
    nullMetrics: metrics({ logLoss: 0.7, brierScore: 0.3 }),
    selectedEconomics: economics(),
    baseline: {
      openedPositions: 10,
      completedTrades: 10,
      censoredTrades: 0,
      censoringBps: 0,
      netBaseExpectancy: 0.1,
      netStressExpectancy: 0.1,
    },
    novelToken: {
      count: 0,
      rocAuc: null,
      logLoss: null,
      brierScore: null,
      selectedCount: 0,
      baseExpectancy: null,
    },
    integrityNotes: [],
    ...overrides,
  };
}

const passIntegrity: RuntimeIntegrityReport = { status: 'PASS', checks: [{ id: 'x', result: 'PASS', detail: 'ok' }] };

describe('ml promotion gates', () => {
  it('returns INSUFFICIENT_DATA below frozen minima', () => {
    const folds = [1, 2, 3, 4].map((id) =>
      fold(id as 1 | 2 | 3 | 4, {
        evaluability: {
          evaluable: false,
          trainDecisionSamples: 99,
          trainLabeled: 99,
          trainCensored: 0,
          trainCensoringBps: 0,
          testDecisionSamples: 29,
          testLabeled: 29,
          testCensored: 0,
          testCensoringBps: 0,
          trainPositives: 19,
          trainNegatives: 19,
          testPositives: 4,
          testNegatives: 4,
          reasons: ['TRAIN labeled 99 < 100'],
        },
        selectedEconomics: economics({ completed: 4 }),
      }),
    );
    const result = evaluateMlPromotion({
      folds,
      aggregateMetrics: metrics({ labeledSamples: 119 }),
      aggregateNullMetrics: metrics({ logLoss: 0.7, brierScore: 0.3 }),
      aggregateSelectedEconomics: economics({ completed: 39 }),
      integrity: passIntegrity,
    });
    expect(result.status).toBe('NO_MODEL_PROMOTION_INSUFFICIENT_DATA');
  });

  it('fails validation for profitable BASE but negative STRESS, weak AUC, concentration, and drawdown', () => {
    const folds = [1, 2, 3, 4].map((id) => fold(id as 1 | 2 | 3 | 4));
    const stressFail = evaluateMlPromotion({
      folds,
      aggregateMetrics: metrics(),
      aggregateNullMetrics: metrics({ logLoss: 0.7, brierScore: 0.3 }),
      aggregateSelectedEconomics: economics({
        netStress: emptyScenario('STRESS', { completedTrades: 40, expectancyUsd: -1 }),
      }),
      integrity: passIntegrity,
    });
    expect(stressFail.status).toBe('NO_MODEL_PROMOTION_FAILED_VALIDATION');

    const aucFail = evaluateMlPromotion({
      folds,
      aggregateMetrics: metrics({ rocAuc: 0.54 }),
      aggregateNullMetrics: metrics({ logLoss: 0.7, brierScore: 0.3 }),
      aggregateSelectedEconomics: economics(),
      integrity: passIntegrity,
    });
    expect(aucFail.status).toBe('NO_MODEL_PROMOTION_FAILED_VALIDATION');

    const twoFolds = evaluateMlPromotion({
      folds: folds.map((item, index) => ({
        ...item,
        metrics: metrics({ rocAuc: index < 2 ? 0.6 : 0.4 }),
      })),
      aggregateMetrics: metrics({ rocAuc: 0.6 }),
      aggregateNullMetrics: metrics({ logLoss: 0.7, brierScore: 0.3 }),
      aggregateSelectedEconomics: economics(),
      integrity: passIntegrity,
    });
    expect(twoFolds.status).toBe('NO_MODEL_PROMOTION_FAILED_VALIDATION');

    const top1 = evaluateMlPromotion({
      folds,
      aggregateMetrics: metrics(),
      aggregateNullMetrics: metrics({ logLoss: 0.7, brierScore: 0.3 }),
      aggregateSelectedEconomics: economics({
        netBase: emptyScenario('BASE', {
          completedTrades: 40,
          expectancyUsd: 1,
          profitFactor: { kind: 'finite', value: 1.2 },
          maxDrawdownPctOfReferenceBasis: 10,
          top1PositiveConcentration: 41,
          top3PositiveConcentration: 40,
        }),
      }),
      integrity: passIntegrity,
    });
    expect(top1.status).toBe('NO_MODEL_PROMOTION_FAILED_VALIDATION');

    const top3 = evaluateMlPromotion({
      folds,
      aggregateMetrics: metrics(),
      aggregateNullMetrics: metrics({ logLoss: 0.7, brierScore: 0.3 }),
      aggregateSelectedEconomics: economics({
        netBase: emptyScenario('BASE', {
          completedTrades: 40,
          expectancyUsd: 1,
          profitFactor: { kind: 'finite', value: 1.2 },
          maxDrawdownPctOfReferenceBasis: 10,
          top1PositiveConcentration: 20,
          top3PositiveConcentration: 71,
        }),
      }),
      integrity: passIntegrity,
    });
    expect(top3.status).toBe('NO_MODEL_PROMOTION_FAILED_VALIDATION');

    const dd = evaluateMlPromotion({
      folds,
      aggregateMetrics: metrics(),
      aggregateNullMetrics: metrics({ logLoss: 0.7, brierScore: 0.3 }),
      aggregateSelectedEconomics: economics({
        netBase: emptyScenario('BASE', {
          completedTrades: 40,
          expectancyUsd: 1,
          profitFactor: { kind: 'finite', value: 1.2 },
          maxDrawdownPctOfReferenceBasis: 20.1,
          top1PositiveConcentration: 20,
          top3PositiveConcentration: 40,
        }),
      }),
      integrity: passIntegrity,
    });
    expect(dd.status).toBe('NO_MODEL_PROMOTION_FAILED_VALIDATION');
  });

  it('blocks promotion when the baseline is not comparable or the model loses BASE expectancy', () => {
    const weakBaseline = [1, 2, 3, 4].map((id) =>
      fold(id as 1 | 2 | 3 | 4, { baseline: { openedPositions: 4, completedTrades: 4, censoredTrades: 0, censoringBps: 0, netBaseExpectancy: 0.1, netStressExpectancy: 0.1 } }),
    );
    const notComparable = evaluateMlPromotion({
      folds: weakBaseline,
      aggregateMetrics: metrics(),
      aggregateNullMetrics: metrics({ logLoss: 0.7, brierScore: 0.3 }),
      aggregateSelectedEconomics: economics(),
      integrity: passIntegrity,
    });
    expect(notComparable.status).toBe('NO_MODEL_PROMOTION_FAILED_VALIDATION');
    expect(notComparable.baselineComparison.status).toBe('BASELINE_NOT_COMPARABLE');

    const worse = evaluateMlPromotion({
      folds: [1, 2, 3, 4].map((id) =>
        fold(id as 1 | 2 | 3 | 4, {
          baseline: { openedPositions: 10, completedTrades: 10, censoredTrades: 0, censoringBps: 0, netBaseExpectancy: 2, netStressExpectancy: 0.1 },
        }),
      ),
      aggregateMetrics: metrics(),
      aggregateNullMetrics: metrics({ logLoss: 0.7, brierScore: 0.3 }),
      aggregateSelectedEconomics: economics(),
      integrity: passIntegrity,
    });
    expect(worse.status).toBe('NO_MODEL_PROMOTION_FAILED_VALIDATION');
  });

  it('fails when selected BASE expectancy is negative even if AUC is strong', () => {
    const folds = [1, 2, 3, 4].map((id) => fold(id as 1 | 2 | 3 | 4));
    const result = evaluateMlPromotion({
      folds,
      aggregateMetrics: metrics({ rocAuc: 0.7 }),
      aggregateNullMetrics: metrics({ logLoss: 0.7, brierScore: 0.3 }),
      aggregateSelectedEconomics: economics({
        netBase: emptyScenario('BASE', {
          completedTrades: 40,
          expectancyUsd: -0.1,
          profitFactor: { kind: 'finite', value: 0.9 },
          maxDrawdownPctOfReferenceBasis: 10,
          top1PositiveConcentration: 20,
          top3PositiveConcentration: 40,
        }),
      }),
      integrity: passIntegrity,
    });
    expect(result.status).toBe('NO_MODEL_PROMOTION_FAILED_VALIDATION');
  });

  it('uses frozen status precedence for integrity, censoring readiness, and selected censoring', () => {
    const folds = [1, 2, 3, 4].map((id) => fold(id as 1 | 2 | 3 | 4));
    const integrityFail = evaluateMlPromotion({
      folds,
      aggregateMetrics: metrics(),
      aggregateNullMetrics: metrics({ logLoss: 0.7, brierScore: 0.3 }),
      aggregateSelectedEconomics: economics(),
      integrity: { status: 'FAIL', checks: [{ id: 'x', result: 'FAIL', detail: 'broken' }] },
    });
    expect(integrityFail.status).toBe('NO_MODEL_PROMOTION_FAILED_VALIDATION');

    const labelCensoring = evaluateMlPromotion({
      folds: folds.map((item) => ({
        ...item,
        evaluability: {
          ...item.evaluability,
          trainCensoringBps: 5000,
          testCensoringBps: 5000,
        },
      })),
      aggregateMetrics: metrics(),
      aggregateNullMetrics: metrics({ logLoss: 0.7, brierScore: 0.3 }),
      aggregateSelectedEconomics: economics(),
      integrity: passIntegrity,
    });
    expect(labelCensoring.status).toBe('NO_MODEL_PROMOTION_INSUFFICIENT_DATA');
    expect(labelCensoring.gates.find((gate) => gate.id === 'train_test_label_censoring')?.result).toBe('NOT_ENOUGH_DATA');

    const selectedCensoring = evaluateMlPromotion({
      folds,
      aggregateMetrics: metrics(),
      aggregateNullMetrics: metrics({ logLoss: 0.7, brierScore: 0.3 }),
      aggregateSelectedEconomics: economics({
        selectedOpened: 80,
        selectedSamples: 80,
        completed: 40,
        censored: 40,
        selectedCensoringBps: 5000,
      }),
      integrity: passIntegrity,
    });
    expect(selectedCensoring.status).toBe('NO_MODEL_PROMOTION_FAILED_VALIDATION');
    expect(selectedCensoring.gates.find((gate) => gate.id === 'selected_censoring')?.result).toBe('FAIL');

    const undefinedPf = evaluateMlPromotion({
      folds,
      aggregateMetrics: metrics(),
      aggregateNullMetrics: metrics({ logLoss: 0.7, brierScore: 0.3 }),
      aggregateSelectedEconomics: economics({
        netBase: emptyScenario('BASE', {
          completedTrades: 40,
          expectancyUsd: 1,
          profitFactor: { kind: 'undefined' },
          maxDrawdownPctOfReferenceBasis: 10,
          top1PositiveConcentration: 20,
          top3PositiveConcentration: 40,
        }),
      }),
      integrity: passIntegrity,
    });
    expect(undefinedPf.status).toBe('NO_MODEL_PROMOTION_FAILED_VALIDATION');

    const infinitePf = evaluateMlPromotion({
      folds,
      aggregateMetrics: metrics(),
      aggregateNullMetrics: metrics({ logLoss: 0.7, brierScore: 0.3 }),
      aggregateSelectedEconomics: economics({
        netBase: emptyScenario('BASE', {
          completedTrades: 40,
          expectancyUsd: 1,
          profitFactor: { kind: 'infinite' },
          maxDrawdownPctOfReferenceBasis: 10,
          top1PositiveConcentration: 20,
          top3PositiveConcentration: 40,
        }),
      }),
      integrity: passIntegrity,
    });
    expect(infinitePf.status).toBe('ELIGIBLE_FOR_FORWARD_PAPER_MODEL_VALIDATION');
  });

  it('blocks each remaining robustness gate without loosening thresholds', () => {
    const folds = [1, 2, 3, 4].map((id) => fold(id as 1 | 2 | 3 | 4));
    const passing = {
      folds,
      aggregateMetrics: metrics(),
      aggregateNullMetrics: metrics({ logLoss: 0.7, brierScore: 0.3 }),
      aggregateSelectedEconomics: economics(),
      integrity: passIntegrity,
    };
    expect(evaluateMlPromotion(passing).status).toBe('ELIGIBLE_FOR_FORWARD_PAPER_MODEL_VALIDATION');

    const breaks: { id: string; input: Parameters<typeof evaluateMlPromotion>[0] }[] = [
      {
        id: 'aggregate_roc_auc',
        input: { ...passing, aggregateMetrics: metrics({ rocAuc: 0.54 }) },
      },
      {
        id: 'log_loss_beats_null',
        input: { ...passing, aggregateMetrics: metrics({ logLoss: 0.8 }) },
      },
      {
        id: 'brier_beats_null',
        input: { ...passing, aggregateMetrics: metrics({ brierScore: 0.4 }) },
      },
      {
        id: 'fold_auc_consistency',
        input: {
          ...passing,
          folds: folds.map((item, index) => ({
            ...item,
            metrics: metrics({ rocAuc: index < 2 ? 0.6 : 0.4 }),
          })),
        },
      },
      {
        id: 'selected_base_expectancy',
        input: {
          ...passing,
          aggregateSelectedEconomics: economics({
            netBase: emptyScenario('BASE', {
              completedTrades: 40,
              expectancyUsd: 0,
              profitFactor: { kind: 'finite', value: 1.2 },
              maxDrawdownPctOfReferenceBasis: 10,
              top1PositiveConcentration: 20,
              top3PositiveConcentration: 40,
            }),
          }),
        },
      },
      {
        id: 'selected_stress_expectancy',
        input: {
          ...passing,
          aggregateSelectedEconomics: economics({
            netStress: emptyScenario('STRESS', { completedTrades: 40, expectancyUsd: 0 }),
          }),
        },
      },
      {
        id: 'selected_base_profit_factor',
        input: {
          ...passing,
          aggregateSelectedEconomics: economics({
            netBase: emptyScenario('BASE', {
              completedTrades: 40,
              expectancyUsd: 1,
              profitFactor: { kind: 'finite', value: 1.09 },
              maxDrawdownPctOfReferenceBasis: 10,
              top1PositiveConcentration: 20,
              top3PositiveConcentration: 40,
            }),
          }),
        },
      },
      {
        id: 'selected_drawdown',
        input: {
          ...passing,
          aggregateSelectedEconomics: economics({
            netBase: emptyScenario('BASE', {
              completedTrades: 40,
              expectancyUsd: 1,
              profitFactor: { kind: 'finite', value: 1.2 },
              maxDrawdownPctOfReferenceBasis: null,
              top1PositiveConcentration: 20,
              top3PositiveConcentration: 40,
            }),
          }),
        },
      },
      {
        id: 'top1_concentration',
        input: {
          ...passing,
          aggregateSelectedEconomics: economics({
            netBase: emptyScenario('BASE', {
              completedTrades: 40,
              expectancyUsd: 1,
              profitFactor: { kind: 'finite', value: 1.2 },
              maxDrawdownPctOfReferenceBasis: 10,
              top1PositiveConcentration: null,
              top3PositiveConcentration: 40,
            }),
          }),
        },
      },
      {
        id: 'top3_concentration',
        input: {
          ...passing,
          aggregateSelectedEconomics: economics({
            netBase: emptyScenario('BASE', {
              completedTrades: 40,
              expectancyUsd: 1,
              profitFactor: { kind: 'finite', value: 1.2 },
              maxDrawdownPctOfReferenceBasis: 10,
              top1PositiveConcentration: 20,
              top3PositiveConcentration: null,
            }),
          }),
        },
      },
      {
        id: 'trainer_converged',
        input: {
          ...passing,
          folds: folds.map((item, index) =>
            index === 0 ? { ...item, logistic: item.logistic ? { ...item.logistic, converged: false } : null } : item,
          ),
        },
      },
    ];
    for (const item of breaks) {
      const result = evaluateMlPromotion(item.input);
      expect(result.status, item.id).toBe('NO_MODEL_PROMOTION_FAILED_VALIDATION');
      expect(result.gates.find((gate) => gate.id === item.id)?.result, item.id).toBe('FAIL');
    }

    const coverage = evaluateMlPromotion({
      ...passing,
      aggregateSelectedEconomics: economics({ completed: 39, selectedOpened: 39, selectedSamples: 39 }),
    });
    expect(coverage.status).toBe('NO_MODEL_PROMOTION_INSUFFICIENT_DATA');
    expect(coverage.gates.find((gate) => gate.id === 'selected_completed_coverage')?.result).toBe('NOT_ENOUGH_DATA');
  });
});
