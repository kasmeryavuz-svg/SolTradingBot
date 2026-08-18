import { createHash } from 'node:crypto';
import { COST_DEFINITION_FINGERPRINT } from '../optimization/costs.js';
import { EXIT_DEFINITION_FINGERPRINT } from '../exit/identity.js';
import { canonicalMlDefinition, type CanonicalMlDefinition } from './definition.js';
import { ML19_MODEL_FEATURES, ML19_TRANSFORMED_COLUMN_NAMES } from './features.js';
import { canonicalNumberString } from './numbers.js';
import type { FittedPreprocessor, MlDecisionSample, MlLabelOutcome } from './types.js';
import { LABEL_MAX_HOLD_MS, MODEL_SIGNAL_THRESHOLD, ML_SPEC_VERSION, STD_DENOMINATOR } from './constants.js';

export function fingerprintMlDefinition(
  definition: CanonicalMlDefinition = canonicalMlDefinition(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export const ML_DEFINITION_FINGERPRINT = fingerprintMlDefinition();

export function fingerprintMlFeatures(): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        features: ML19_MODEL_FEATURES,
        transformedColumns: ML19_TRANSFORMED_COLUMN_NAMES,
      }),
      'utf8',
    )
    .digest('hex');
}

export const ML_FEATURE_FINGERPRINT = fingerprintMlFeatures();

export function fingerprintLabelOutcome(label: MlLabelOutcome): unknown {
  return {
    state: label.state,
    label: label.label,
    censorReason: label.censorReason,
    completedAt: label.completedAt,
    completedAtMs: label.completedAtMs,
    exitReason: label.exitReason,
    grossExitReferenceUsd:
      label.grossExitReferenceUsd === null ? null : canonicalNumberString(label.grossExitReferenceUsd),
    observedExitPriceUsd:
      label.observedExitPriceUsd === null ? null : canonicalNumberString(label.observedExitPriceUsd),
    grossPnlUsd: label.grossPnlUsd === null ? null : canonicalNumberString(label.grossPnlUsd),
    netBasePnlUsd: label.netBasePnlUsd === null ? null : canonicalNumberString(label.netBasePnlUsd),
    netStressPnlUsd: label.netStressPnlUsd === null ? null : canonicalNumberString(label.netStressPnlUsd),
    netLowPnlUsd: label.netLowPnlUsd === null ? null : canonicalNumberString(label.netLowPnlUsd),
    holdingDurationMs: label.holdingDurationMs,
    quantityTokens: label.quantityTokens === null ? null : canonicalNumberString(label.quantityTokens),
  };
}

export function fingerprintFeatureProjection(sample: Pick<MlDecisionSample, 'rawFeatures'>): unknown {
  return sample.rawFeatures.map((feature) => ({
    name: feature.name,
    kind: feature.kind,
    status: feature.status,
    numericValue: feature.numericValue === null ? null : canonicalNumberString(feature.numericValue),
    booleanValue: feature.booleanValue,
  }));
}

export function mlSampleIdentityPayload(sample: MlDecisionSample): unknown {
  return {
    tokenMint: sample.tokenMint,
    pairAddress: sample.pairAddress,
    collectedAt: sample.collectedAt,
    entryPriceUsd: canonicalNumberString(sample.entryPriceUsd),
    featureProjection: fingerprintFeatureProjection(sample),
    label: fingerprintLabelOutcome(sample.datasetLabel),
    labelWindowEndMs: sample.collectedAtMs + LABEL_MAX_HOLD_MS,
  };
}

export function assignSampleIdentity(sample: Omit<MlDecisionSample, 'sampleIdentity'>): MlDecisionSample {
  const identity = createHash('sha256')
    .update(
      JSON.stringify({
        tokenMint: sample.tokenMint,
        pairAddress: sample.pairAddress,
        collectedAt: sample.collectedAt,
        featureProjection: fingerprintFeatureProjection(sample),
      }),
      'utf8',
    )
    .digest('hex');
  return { ...sample, sampleIdentity: identity };
}

export function fingerprintMlDataset(samples: readonly MlDecisionSample[]): string {
  const ordered = [...samples].sort((left, right) => {
    if (left.collectedAt !== right.collectedAt) {
      return left.collectedAt < right.collectedAt ? -1 : 1;
    }
    if (left.tokenMint !== right.tokenMint) {
      return left.tokenMint < right.tokenMint ? -1 : 1;
    }
    if (left.pairAddress !== right.pairAddress) {
      return left.pairAddress < right.pairAddress ? -1 : 1;
    }
    return left.sampleIdentity < right.sampleIdentity ? -1 : 1;
  });
  return createHash('sha256')
    .update(
      JSON.stringify({
        mlSpecVersion: ML_SPEC_VERSION,
        mlDefinitionFingerprint: ML_DEFINITION_FINGERPRINT,
        samples: ordered.map(mlSampleIdentityPayload),
      }),
      'utf8',
    )
    .digest('hex');
}

export function fingerprintPreprocessor(preprocessor: FittedPreprocessor): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        featureOrder: preprocessor.featureOrder,
        featureTypes: preprocessor.featureTypes,
        transformedColumnNames: preprocessor.transformedColumnNames,
        numeric: preprocessor.numeric.map((item) => ({
          name: item.name,
          median: canonicalNumberString(item.median),
          mean: canonicalNumberString(item.mean),
          std: canonicalNumberString(item.std),
        })),
        booleanMissingPolicy: preprocessor.booleanMissingPolicy,
        medianImputeBooleans: preprocessor.medianImputeBooleans,
        entirelyMissingImputeZero: true,
        stdDenominator: STD_DENOMINATOR,
        zscoreClip: preprocessor.zscoreClip,
        clipBounds: preprocessor.clipBounds,
        missingIndicatorOrder: preprocessor.missingIndicatorOrder,
        fittedOn: preprocessor.fittedOn,
      }),
      'utf8',
    )
    .digest('hex');
}

export function fingerprintLogisticModel(input: {
  coefficients: readonly number[];
  intercept: number;
  iterations: number;
  finalTrainLoss: number;
  converged: boolean;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        mlDefinitionFingerprint: ML_DEFINITION_FINGERPRINT,
        coefficients: input.coefficients.map(canonicalNumberString),
        intercept: canonicalNumberString(input.intercept),
        iterations: input.iterations,
        finalTrainLoss: canonicalNumberString(input.finalTrainLoss),
        converged: input.converged,
      }),
      'utf8',
    )
    .digest('hex');
}

export function fingerprintNullModel(input: { probability: number; trainPositiveRate: number }): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        mlDefinitionFingerprint: ML_DEFINITION_FINGERPRINT,
        probability: canonicalNumberString(input.probability),
        trainPositiveRate: canonicalNumberString(input.trainPositiveRate),
      }),
      'utf8',
    )
    .digest('hex');
}

export function fingerprintModelCandidate(input: {
  mlDefinitionFingerprint: string;
  trainingDatasetFingerprint: string;
  featureFingerprint: string;
  preprocessingFingerprint: string;
  coefficients: readonly number[];
  intercept: number;
  threshold: number;
  trainingCutoffAt: string | null;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        mlDefinitionFingerprint: input.mlDefinitionFingerprint,
        historicalDatasetFingerprint: input.trainingDatasetFingerprint,
        featureFingerprint: input.featureFingerprint,
        preprocessingFingerprint: input.preprocessingFingerprint,
        coefficients: input.coefficients.map(canonicalNumberString),
        intercept: canonicalNumberString(input.intercept),
        threshold: canonicalNumberString(input.threshold),
        trainingCutoffAt: input.trainingCutoffAt,
        labelDefinition: 'BASE_cost_positive_x11_result',
        costDefinitionFingerprint: COST_DEFINITION_FINGERPRINT,
        x11Fingerprint: EXIT_DEFINITION_FINGERPRINT,
        modelSignalThreshold: MODEL_SIGNAL_THRESHOLD,
      }),
      'utf8',
    )
    .digest('hex');
}
