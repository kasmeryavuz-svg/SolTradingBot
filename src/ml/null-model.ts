import { MlTrainingError } from './errors.js';
import { fingerprintNullModel } from './identity.js';
import { requireMlFinite } from './numbers.js';
import { clipProbability } from './logistic.js';
import type { MlBinaryLabel, NullModelFit } from './types.js';

export function fitInterceptOnlyNullModel(labels: readonly MlBinaryLabel[]): NullModelFit {
  if (labels.length === 0) {
    throw new MlTrainingError('Null model requires at least one TRAIN label.');
  }
  let positives = 0;
  for (const label of labels) {
    const raw: number = label;
    if (raw !== 0 && raw !== 1) {
      throw new MlTrainingError('Null-model labels must be 0 or 1.');
    }
    positives += raw;
  }
  const trainPositiveRate = requireMlFinite(positives / labels.length, 'train positive rate');
  const probability = clipProbability(trainPositiveRate);
  return {
    fingerprint: fingerprintNullModel({ probability, trainPositiveRate }),
    trainPositiveRate,
    probability,
    sampleCount: labels.length,
    positiveCount: positives,
    negativeCount: labels.length - positives,
  };
}
