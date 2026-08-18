import { evaluateFoldBaseline } from './baseline.js';
import { ML19_TRANSFORMED_COLUMN_NAMES } from './features.js';
import {
  canonicalTrainOrder,
  evaluateFoldDataSufficiency,
  labeledOutcome,
  mlSegmentsAndFolds,
  partitionFoldSamples,
} from './folds.js';
import { fitL2LogisticRegression, predictProbability } from './logistic.js';
import { classificationMetrics, isResearchSelected } from './metrics.js';
import { fitInterceptOnlyNullModel } from './null-model.js';
import { fitPreprocessor, transformRawFeatures } from './preprocessing.js';
import { emptySelectedEconomicSlice, selectedEconomicSlice } from './economic.js';
import { evaluateMlPromotion } from './promotion.js';
import { evaluateMlRuntimeIntegrity } from './integrity.js';
import { compareCanonicalText, stableMedian } from './numbers.js';
import type {
  BaselineFoldStats,
  CoefficientRow,
  CoefficientStabilityRow,
  MlBinaryLabel,
  MlDataset,
  MlFoldResult,
  MlLabelOutcome,
  MlWalkForwardReport,
  NovelTokenDiagnostic,
  PredictedSample,
} from './types.js';
import type { FoldBoundaries } from '../optimization/types.js';
import type { ScoredLabel } from './metrics.js';

function novelTokenSet(train: readonly { tokenMint: string }[]): Set<string> {
  return new Set(train.map((sample) => sample.tokenMint));
}

function scoredLabeled(predictions: readonly PredictedSample[]): ScoredLabel[] {
  return predictions
    .filter((item) => labeledOutcome(item.foldOutcome) && item.foldOutcome.label !== null)
    .map((item) => ({
      probability: item.probability,
      label: item.foldOutcome.label === 1 ? 1 : 0,
    }));
}

function nullScoredLabeled(predictions: readonly PredictedSample[]): ScoredLabel[] {
  return predictions
    .filter((item) => labeledOutcome(item.foldOutcome) && item.foldOutcome.label !== null)
    .map((item) => ({
      probability: item.nullProbability,
      label: item.foldOutcome.label === 1 ? 1 : 0,
    }));
}

function novelDiagnostic(predictions: readonly PredictedSample[]): NovelTokenDiagnostic {
  const novel = predictions.filter((item) => item.novelToken);
  const labeled = scoredLabeled(novel);
  const metrics = labeled.length === 0 ? null : classificationMetrics(labeled);
  const economics = selectedEconomicSlice(novel);
  return {
    count: novel.length,
    rocAuc: metrics?.rocAuc ?? null,
    logLoss: metrics?.logLoss ?? null,
    brierScore: metrics?.brierScore ?? null,
    selectedCount: novel.filter((item) => item.selected).length,
    baseExpectancy: economics.netBase?.expectancyUsd ?? null,
  };
}

function baselineStats(dataset: MlDataset, fold: FoldBoundaries): BaselineFoldStats {
  return evaluateFoldBaseline(dataset, fold);
}

function emptyFold(dataset: MlDataset, fold: FoldBoundaries, partition: ReturnType<typeof partitionFoldSamples>): MlFoldResult {
  const universe = emptySelectedEconomicSlice();
  return {
    fold,
    purge: partition.purge,
    evaluability: evaluateFoldDataSufficiency(partition),
    preprocessorFingerprint: null,
    modelFingerprint: null,
    nullFingerprint: null,
    logistic: null,
    nullModel: null,
    coefficients: [],
    predictedIdentities: [],
    selectedIdentities: [],
    testPredictions: [],
    labeledTestPredictions: [],
    metrics: null,
    nullMetrics: null,
    selectedEconomics: {
      ...universe,
      testDecisionSamples: partition.testAll.length,
      testFeatureEligibleSamples: partition.testFeatureEligible.length,
      testLabeledSamples: partition.testLabeled.length,
      testCensoredSamples: partition.testCensored.length,
    },
    baseline: baselineStats(dataset, fold),
    novelToken: {
      count: 0,
      rocAuc: null,
      logLoss: null,
      brierScore: null,
      selectedCount: 0,
      baseExpectancy: null,
    },
    integrityNotes: ['No purged TRAIN labeled samples; TEST was not used to fit preprocessing or coefficients.'],
  };
}

function evaluateOneFold(dataset: MlDataset, fold: FoldBoundaries): MlFoldResult {
  const partition = partitionFoldSamples(dataset, fold);
  const evaluability = evaluateFoldDataSufficiency(partition);
  const trainOrdered = canonicalTrainOrder(partition.trainAfterPurge);
  if (trainOrdered.length === 0) {
    return emptyFold(dataset, fold, partition);
  }

  const preprocessor = fitPreprocessor(trainOrdered.map((sample) => sample.rawFeatures), 'TRAIN_ONLY');
  const trainFeatures = trainOrdered.map((sample) => transformRawFeatures(sample.rawFeatures, preprocessor));
  const trainLabels: MlBinaryLabel[] = trainOrdered.map((sample) => (sample.datasetLabel.label === 1 ? 1 : 0));
  const logistic = fitL2LogisticRegression({ features: trainFeatures, labels: trainLabels });
  const nullModel = fitInterceptOnlyNullModel(trainLabels);
  const trainTokens = novelTokenSet(partition.trainEntries);

  const testUniverse = canonicalTrainOrder(partition.testFeatureEligible);
  const scoredRows: { sample: (typeof testUniverse)[number]; probability: number }[] = [];
  for (const sample of testUniverse) {
    const features = transformRawFeatures(sample.rawFeatures, preprocessor);
    const probability = predictProbability(features, logistic.coefficients, logistic.intercept);
    scoredRows.push({ sample, probability });
  }

  const testPredictions: PredictedSample[] = scoredRows.map((row) => {
    const foldOutcome: MlLabelOutcome =
      partition.testOutcomes.get(row.sample.sampleIdentity) ?? row.sample.datasetLabel;
    return {
      sample: row.sample,
      foldOutcome,
      probability: row.probability,
      nullProbability: nullModel.probability,
      selected: isResearchSelected(row.probability),
      novelToken: !trainTokens.has(row.sample.tokenMint),
    };
  });

  const labeledTestPredictions = testPredictions.filter((item) => labeledOutcome(item.foldOutcome));
  const labeledScores = scoredLabeled(testPredictions);
  const coefficients: CoefficientRow[] = ML19_TRANSFORMED_COLUMN_NAMES.map((feature, index) => ({
    feature,
    standardizedCoefficient: logistic.coefficients[index] ?? 0,
  }));
  const selectedEconomics = selectedEconomicSlice(testPredictions, undefined, {
    testDecisionSamples: partition.testAll.length,
    testFeatureEligibleSamples: partition.testFeatureEligible.length,
    testLabeledSamples: partition.testLabeled.length,
    testCensoredSamples: partition.testCensored.length,
  });

  return {
    fold,
    purge: partition.purge,
    evaluability,
    preprocessorFingerprint: preprocessor.fingerprint,
    modelFingerprint: logistic.fingerprint,
    nullFingerprint: nullModel.fingerprint,
    logistic,
    nullModel,
    coefficients,
    predictedIdentities: testPredictions.map((item) => item.sample.sampleIdentity),
    selectedIdentities: testPredictions.filter((item) => item.selected).map((item) => item.sample.sampleIdentity),
    testPredictions,
    labeledTestPredictions,
    metrics: labeledScores.length === 0 ? null : classificationMetrics(labeledScores),
    nullMetrics: labeledScores.length === 0 ? null : classificationMetrics(nullScoredLabeled(testPredictions)),
    selectedEconomics,
    baseline: baselineStats(dataset, fold),
    novelToken: novelDiagnostic(testPredictions),
    integrityNotes: [
      'TRAIN preprocessing and coefficients were fit on purged TRAIN labeled samples only.',
      'TEST feature-valid decision samples received the frozen TRAIN preprocessor and TRAIN model before outcome accounting.',
      'Classification metrics use labeled TEST rows only. Model selection uses the full predicted TEST universe.',
    ],
  };
}

function coefficientStability(folds: readonly MlFoldResult[]): CoefficientStabilityRow[] {
  return ML19_TRANSFORMED_COLUMN_NAMES.map((feature) => {
    const values: number[] = [];
    for (const fold of folds) {
      const row = fold.coefficients.find((item) => item.feature === feature);
      if (row !== undefined) {
        values.push(row.standardizedCoefficient);
      }
    }
    return {
      feature,
      medianCoefficient: values.length === 0 ? null : stableMedian(values),
      sameSignFoldCount: countSameSign(values),
    };
  }).sort((left, right) => compareCanonicalText(left.feature, right.feature));
}

function countSameSign(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const positives = values.filter((value) => value > 0).length;
  const negatives = values.filter((value) => value < 0).length;
  const zeros = values.filter((value) => value === 0).length;
  if (positives > 0 && negatives > 0) {
    return Math.max(positives, negatives);
  }
  return positives + negatives + zeros;
}

export function runPurgedWalkForward(dataset: MlDataset): MlWalkForwardReport {
  const { segments, folds: foldBoundaries } = mlSegmentsAndFolds(dataset);
  const folds = foldBoundaries === null ? [] : foldBoundaries.map((fold) => evaluateOneFold(dataset, fold));
  const allTest = folds.flatMap((fold) => fold.testPredictions);
  const labeledScores = scoredLabeled(allTest);
  const aggregateMetrics = labeledScores.length === 0 ? null : classificationMetrics(labeledScores);
  const aggregateNullMetrics =
    labeledScores.length === 0 ? null : classificationMetrics(nullScoredLabeled(allTest));
  const foldExpectancies = folds.map((fold) => fold.selectedEconomics.netBase?.expectancyUsd ?? null);
  const aggregateSelectedEconomics = selectedEconomicSlice(allTest, foldExpectancies, {
    testDecisionSamples: folds.reduce((sum, fold) => sum + fold.selectedEconomics.testDecisionSamples, 0),
    testFeatureEligibleSamples: folds.reduce(
      (sum, fold) => sum + fold.selectedEconomics.testFeatureEligibleSamples,
      0,
    ),
    testLabeledSamples: folds.reduce((sum, fold) => sum + fold.selectedEconomics.testLabeledSamples, 0),
    testCensoredSamples: folds.reduce((sum, fold) => sum + fold.selectedEconomics.testCensoredSamples, 0),
  });
  const novelToken = novelDiagnostic(allTest);
  const integrity = evaluateMlRuntimeIntegrity({ dataset, segments, folds });
  const promotion = evaluateMlPromotion({
    dataset,
    folds,
    aggregateMetrics,
    aggregateNullMetrics,
    aggregateSelectedEconomics,
    integrity,
  });

  return {
    mlDefinitionFingerprint: dataset.mlDefinitionFingerprint,
    mlDatasetFingerprint: dataset.mlDatasetFingerprint,
    segments,
    folds,
    aggregateMetrics,
    aggregateNullMetrics,
    aggregateSelectedEconomics,
    baselineComparison: promotion.baselineComparison,
    novelToken,
    coefficientStability: coefficientStability(folds),
    integrity,
    promotionStatus: promotion.status,
    promotionGates: promotion.gates,
    candidateEligible: promotion.status === 'ELIGIBLE_FOR_FORWARD_PAPER_MODEL_VALIDATION',
    candidateTrainingInvoked: false,
    candidate: null,
  };
}
