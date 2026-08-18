import {
  LOGISTIC_EARLY_STOP_ABSOLUTE_IMPROVEMENT,
  LOGISTIC_EARLY_STOP_CONSECUTIVE_ITERATIONS,
  LOGISTIC_INTERCEPT_REGULARIZED,
  LOGISTIC_L2_LAMBDA,
  LOGISTIC_LEARNING_RATE,
  LOGISTIC_MAX_ITERATIONS,
  LOGISTIC_PROBABILITY_EPSILON,
  LOGISTIC_SIGMOID_CLIP,
} from './constants.js';
import { MlTrainingError } from './errors.js';
import { fingerprintLogisticModel } from './identity.js';
import { clip, requireMlFinite } from './numbers.js';
import type { LogisticFit, LogisticHyperparameters, MlBinaryLabel } from './types.js';

export const FROZEN_LOGISTIC_HYPERPARAMETERS: LogisticHyperparameters = {
  learningRate: LOGISTIC_LEARNING_RATE,
  maxIterations: LOGISTIC_MAX_ITERATIONS,
  l2Lambda: LOGISTIC_L2_LAMBDA,
  interceptRegularized: LOGISTIC_INTERCEPT_REGULARIZED,
  probabilityEpsilon: LOGISTIC_PROBABILITY_EPSILON,
  sigmoidClip: LOGISTIC_SIGMOID_CLIP,
  earlyStopAbsoluteImprovement: LOGISTIC_EARLY_STOP_ABSOLUTE_IMPROVEMENT,
  earlyStopConsecutiveIterations: LOGISTIC_EARLY_STOP_CONSECUTIVE_ITERATIONS,
  initialization: 'all_zero',
};

export function stableSigmoid(logit: number): number {
  const clipped = clip(requireMlFinite(logit, 'logit'), -LOGISTIC_SIGMOID_CLIP, LOGISTIC_SIGMOID_CLIP, 'sigmoid');
  if (clipped >= 0) {
    const expNeg = Math.exp(-clipped);
    return requireMlFinite(1 / (1 + expNeg), 'sigmoid');
  }
  const expPos = Math.exp(clipped);
  return requireMlFinite(expPos / (1 + expPos), 'sigmoid');
}

export function clipProbability(probability: number): number {
  const finite = requireMlFinite(probability, 'probability');
  if (finite < LOGISTIC_PROBABILITY_EPSILON) {
    return LOGISTIC_PROBABILITY_EPSILON;
  }
  if (finite > 1 - LOGISTIC_PROBABILITY_EPSILON) {
    return 1 - LOGISTIC_PROBABILITY_EPSILON;
  }
  return finite;
}

export function stableLogLoss(label: MlBinaryLabel, probability: number): number {
  const p = clipProbability(probability);
  if (label === 1) {
    return requireMlFinite(-Math.log(p), 'log loss positive');
  }
  return requireMlFinite(-Math.log(1 - p), 'log loss negative');
}

export function logitFromFeatures(
  features: readonly number[],
  coefficients: readonly number[],
  intercept: number,
): number {
  if (features.length !== coefficients.length) {
    throw new MlTrainingError('Feature dimension does not match coefficient dimension.');
  }
  let sum = requireMlFinite(intercept, 'intercept');
  for (let index = 0; index < features.length; index += 1) {
    const x = requireMlFinite(features[index] ?? Number.NaN, `x[${String(index)}]`);
    const w = requireMlFinite(coefficients[index] ?? Number.NaN, `w[${String(index)}]`);
    sum += x * w;
  }
  return requireMlFinite(sum, 'logit');
}

export function predictProbability(
  features: readonly number[],
  coefficients: readonly number[],
  intercept: number,
): number {
  return clipProbability(stableSigmoid(logitFromFeatures(features, coefficients, intercept)));
}

/**
 * Frozen objective:
 *   L = (1/N) Σ logloss(y_i, p_i) + λ Σ_j w_j²
 * Intercept is not in the penalty. λ is not divided by N.
 */
export function averageRegularizedLoss(
  features: readonly (readonly number[])[],
  labels: readonly MlBinaryLabel[],
  coefficients: readonly number[],
  intercept: number,
): number {
  const n = features.length;
  if (n === 0) {
    throw new MlTrainingError('Cannot compute loss on an empty TRAIN set.');
  }
  let loss = 0;
  for (let index = 0; index < n; index += 1) {
    const row = features[index];
    const label = labels[index];
    if (row === undefined || label === undefined) {
      throw new MlTrainingError('TRAIN row missing during loss evaluation.');
    }
    const probability = predictProbability(row, coefficients, intercept);
    loss += stableLogLoss(label, probability);
  }
  let penalty = 0;
  for (const coefficient of coefficients) {
    penalty += requireMlFinite(coefficient, 'coefficient') ** 2;
  }
  return requireMlFinite(loss / n + LOGISTIC_L2_LAMBDA * penalty, 'average regularized train loss');
}

/**
 * Gradient of the frozen objective:
 *   ∂L/∂w_j = (1/N) Σ (p_i - y_i) x_{ij} + 2 λ w_j
 *   ∂L/∂b   = (1/N) Σ (p_i - y_i)
 */
export function regularizedGradients(
  features: readonly (readonly number[])[],
  labels: readonly MlBinaryLabel[],
  coefficients: readonly number[],
  intercept: number,
): { gradW: number[]; gradB: number } {
  const n = features.length;
  const dim = coefficients.length;
  if (n === 0) {
    throw new MlTrainingError('Cannot compute gradient on an empty TRAIN set.');
  }
  const gradW = new Array<number>(dim).fill(0);
  let gradB = 0;
  for (let i = 0; i < n; i += 1) {
    const row = features[i];
    const label = labels[i];
    if (row === undefined || label === undefined) {
      throw new MlTrainingError('TRAIN row missing during gradient evaluation.');
    }
    const probability = predictProbability(row, coefficients, intercept);
    const error = probability - label;
    gradB += error;
    for (let j = 0; j < dim; j += 1) {
      const current = gradW[j];
      const x = row[j];
      if (current === undefined || x === undefined) {
        throw new MlTrainingError('Gradient cell missing.');
      }
      gradW[j] = current + error * x;
    }
  }
  gradB = requireMlFinite(gradB / n, 'intercept gradient');
  for (let j = 0; j < dim; j += 1) {
    const current = gradW[j];
    const weight = coefficients[j];
    if (current === undefined || weight === undefined) {
      throw new MlTrainingError('Coefficient gradient missing.');
    }
    gradW[j] = requireMlFinite(current / n + 2 * LOGISTIC_L2_LAMBDA * weight, `w-gradient[${String(j)}]`);
  }
  return { gradW, gradB };
}

export function isTinyNonNegativeLossImprovement(previousLoss: number, currentLoss: number): boolean {
  const delta = previousLoss - currentLoss;
  return delta >= 0 && delta < LOGISTIC_EARLY_STOP_ABSOLUTE_IMPROVEMENT;
}

export function fitL2LogisticRegression(input: {
  features: readonly (readonly number[])[];
  labels: readonly MlBinaryLabel[];
}): LogisticFit {
  const n = input.features.length;
  if (n === 0) {
    throw new MlTrainingError('Logistic regression requires at least one TRAIN row.');
  }
  if (input.labels.length !== n) {
    throw new MlTrainingError('TRAIN features and labels must have the same length.');
  }
  const dim = input.features[0]?.length;
  if (dim === undefined) {
    throw new MlTrainingError('TRAIN feature row is empty.');
  }
  for (let index = 0; index < n; index += 1) {
    const row = input.features[index];
    const label = input.labels[index];
    if (row === undefined || row.length !== dim) {
      throw new MlTrainingError('All TRAIN rows must share the frozen transformed dimension.');
    }
    for (let j = 0; j < dim; j += 1) {
      requireMlFinite(row[j] ?? Number.NaN, `TRAIN x[${String(index)}][${String(j)}]`);
    }
    if (label !== 0 && label !== 1) {
      throw new MlTrainingError('TRAIN labels must be 0 or 1.');
    }
  }

  const coefficients = new Array<number>(dim).fill(0);
  let intercept = 0;
  let previousLoss = averageRegularizedLoss(input.features, input.labels, coefficients, intercept);
  let consecutiveTiny = 0;
  let iterations = 0;
  let converged = false;

  for (let step = 0; step < LOGISTIC_MAX_ITERATIONS; step += 1) {
    const { gradW, gradB } = regularizedGradients(input.features, input.labels, coefficients, intercept);
    intercept = requireMlFinite(intercept - LOGISTIC_LEARNING_RATE * gradB, 'updated intercept');
    for (let j = 0; j < dim; j += 1) {
      const weight = coefficients[j];
      const gradient = gradW[j];
      if (weight === undefined || gradient === undefined) {
        throw new MlTrainingError('Coefficient update missing.');
      }
      coefficients[j] = requireMlFinite(weight - LOGISTIC_LEARNING_RATE * gradient, `updated w[${String(j)}]`);
    }

    iterations = step + 1;
    const loss = averageRegularizedLoss(input.features, input.labels, coefficients, intercept);
    if (isTinyNonNegativeLossImprovement(previousLoss, loss)) {
      consecutiveTiny += 1;
    } else {
      consecutiveTiny = 0;
    }
    previousLoss = loss;
    if (consecutiveTiny >= LOGISTIC_EARLY_STOP_CONSECUTIVE_ITERATIONS) {
      converged = true;
      break;
    }
  }

  const positiveCount = input.labels.filter((label) => label === 1).length;
  return {
    fingerprint: fingerprintLogisticModel({
      coefficients,
      intercept,
      iterations,
      finalTrainLoss: previousLoss,
      converged,
    }),
    hyperparameters: FROZEN_LOGISTIC_HYPERPARAMETERS,
    coefficients,
    intercept,
    iterations,
    finalTrainLoss: previousLoss,
    converged,
    sampleCount: n,
    positiveCount,
    negativeCount: n - positiveCount,
  };
}
