import type { FeatureVector } from '../features/types.js';
import { ZSCORE_CLIP } from './constants.js';
import { MlError, MlTrainingError } from './errors.js';
import { ML19_MODEL_FEATURES, ML19_TRANSFORMED_COLUMN_NAMES } from './features.js';
import { fingerprintPreprocessor } from './identity.js';
import { clip, populationMean, populationStd, requireMlFinite, stableMedian } from './numbers.js';
import type { FittedNumericStats, FittedPreprocessor, RawFeatureObservation } from './types.js';

export function rawFeaturesFromVector(vector: FeatureVector): RawFeatureObservation[] {
  const byName = new Map(vector.values.map((value) => [value.name, value]));
  return ML19_MODEL_FEATURES.map((spec) => {
    const value = byName.get(spec.name);
    if (value === undefined) {
      throw new MlError(`Feature vector missing frozen c06 feature ${spec.name}.`);
    }
    if (value.kind !== spec.kind) {
      throw new MlError(`Feature ${spec.name} kind mismatch.`);
    }
    if (value.status === 'unavailable') {
      return {
        name: spec.name,
        kind: spec.kind,
        status: 'unavailable',
        numericValue: null,
        booleanValue: null,
      };
    }
    if (spec.role === 'boolean') {
      if (typeof value.value !== 'boolean') {
        throw new MlError(`Boolean feature ${spec.name} must be true or false when available.`);
      }
      return {
        name: spec.name,
        kind: spec.kind,
        status: 'available',
        numericValue: value.value ? 1 : 0,
        booleanValue: value.value,
      };
    }
    if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
      throw new MlError(`Numeric feature ${spec.name} is available but not finite.`);
    }
    return {
      name: spec.name,
      kind: spec.kind,
      status: 'available',
      numericValue: value.value,
      booleanValue: null,
    };
  });
}

function observedNumericValues(
  rows: readonly (readonly RawFeatureObservation[])[],
  name: string,
): number[] {
  const values: number[] = [];
  for (const row of rows) {
    const feature = row.find((item) => item.name === name);
    if (feature !== undefined && feature.status === 'available' && feature.numericValue !== null) {
      values.push(requireMlFinite(feature.numericValue, name));
    }
  }
  return values;
}

export function fitPreprocessor(
  rows: readonly (readonly RawFeatureObservation[])[],
  fittedOn: FittedPreprocessor['fittedOn'] = 'TRAIN_ONLY',
): FittedPreprocessor {
  const numeric: FittedNumericStats[] = ML19_MODEL_FEATURES.map((spec) => {
    const observed = observedNumericValues(rows, spec.name);
    const missingCount = rows.length - observed.length;
    if (spec.role === 'boolean') {
      return {
        name: spec.name,
        median: 0,
        mean: 0,
        std: 0,
        observedCount: observed.length,
        missingCount,
      };
    }
    const median = observed.length === 0 ? 0 : stableMedian(observed);
    const imputed = rows.map((row) => {
      const feature = row.find((item) => item.name === spec.name);
      if (feature !== undefined && feature.status === 'available' && feature.numericValue !== null) {
        return requireMlFinite(feature.numericValue, spec.name);
      }
      return median;
    });
    const mean = populationMean(imputed);
    const std = populationStd(imputed, mean);
    return {
      name: spec.name,
      median,
      mean,
      std,
      observedCount: observed.length,
      missingCount,
    };
  });

  const preprocessor: FittedPreprocessor = {
    fingerprint: '',
    featureOrder: ML19_MODEL_FEATURES.map((feature) => feature.name),
    featureTypes: ML19_MODEL_FEATURES.map((feature) => ({
      name: feature.name,
      kind: feature.kind,
      role: feature.role,
      nullable: feature.nullable,
      missingIndicatorName: feature.missingIndicatorName,
    })),
    transformedColumnNames: ML19_TRANSFORMED_COLUMN_NAMES,
    numeric,
    booleanMissingPolicy: 'observed_false_0_0__observed_true_1_0__missing_0_1',
    medianImputeBooleans: false,
    entirelyMissingImputeZero: true,
    stdDenominator: 'population_N',
    zscoreClip: ZSCORE_CLIP,
    clipBounds: [-ZSCORE_CLIP, ZSCORE_CLIP],
    missingIndicatorOrder: 'after_each_nullable_value',
    fittedOn,
  };
  return { ...preprocessor, fingerprint: fingerprintPreprocessor(preprocessor) };
}

export function transformRawFeatures(
  raw: readonly RawFeatureObservation[],
  preprocessor: FittedPreprocessor,
): number[] {
  const byName = new Map(raw.map((item) => [item.name, item]));
  const statsByName = new Map(preprocessor.numeric.map((item) => [item.name, item]));
  const values: number[] = [];
  for (const spec of ML19_MODEL_FEATURES) {
    const observed = byName.get(spec.name);
    const stats = statsByName.get(spec.name);
    if (stats === undefined) {
      throw new MlError(`Preprocessor missing stats for ${spec.name}.`);
    }
    if (observed === undefined || observed.status === 'unavailable') {
      if (spec.role === 'boolean') {
        values.push(0);
      } else {
        const z = stats.std === 0 ? 0 : (stats.median - stats.mean) / stats.std;
        values.push(clip(requireMlFinite(z, `${spec.name} z`), -ZSCORE_CLIP, ZSCORE_CLIP, `${spec.name} clip`));
      }
      if (spec.nullable) {
        values.push(1);
      }
      continue;
    }
    if (spec.role === 'boolean') {
      values.push(observed.booleanValue === true || observed.numericValue === 1 ? 1 : 0);
      if (spec.nullable) {
        values.push(0);
      }
      continue;
    }
    const rawValue =
      observed.numericValue === null
        ? stats.median
        : requireMlFinite(observed.numericValue, spec.name);
    const centered = rawValue - stats.mean;
    const z = stats.std === 0 ? 0 : centered / stats.std;
    const clipped = clip(requireMlFinite(z, `${spec.name} z`), -ZSCORE_CLIP, ZSCORE_CLIP, `${spec.name} clip`);
    values.push(clipped);
    if (spec.nullable) {
      values.push(0);
    }
  }
  if (values.length !== preprocessor.transformedColumnNames.length) {
    throw new MlError('Transformed dimension mismatch.');
  }
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new MlTrainingError('Trainer received a non-finite transformed feature value.');
    }
  }
  return values;
}
