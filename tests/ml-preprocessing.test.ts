import { describe, expect, it } from 'vitest';
import { fitPreprocessor, transformRawFeatures } from '../src/ml/preprocessing.js';
import { ML19_MODEL_FEATURES } from '../src/ml/features.js';
import { populationMean, populationStd, stableMedian } from '../src/ml/numbers.js';
import type { RawFeatureObservation } from '../src/ml/types.js';

function row(values: Record<string, { status: 'available' | 'unavailable'; numeric?: number; boolean?: boolean }>): RawFeatureObservation[] {
  return ML19_MODEL_FEATURES.map((spec) => {
    const item = values[spec.name];
    if (item === undefined || item.status === 'unavailable') {
      return {
        name: spec.name,
        kind: spec.kind,
        status: 'unavailable',
        numericValue: null,
        booleanValue: null,
      };
    }
    if (spec.role === 'boolean') {
      return {
        name: spec.name,
        kind: spec.kind,
        status: 'available',
        numericValue: item.boolean === true ? 1 : 0,
        booleanValue: item.boolean === true,
      };
    }
    return {
      name: spec.name,
      kind: spec.kind,
      status: 'available',
      numericValue: item.numeric ?? 0,
      booleanValue: null,
    };
  });
}

describe('ml preprocessing', () => {
  it('fits TRAIN median/mean/std and ignores TEST outliers', () => {
    const train = [
      row({ market_price_usd: { status: 'available', numeric: 1 } }),
      row({ market_price_usd: { status: 'available', numeric: 3 } }),
      row({ market_price_usd: { status: 'available', numeric: 5 } }),
    ];
    const preprocessor = fitPreprocessor(train);
    const price = preprocessor.numeric.find((item) => item.name === 'market_price_usd');
    expect(price?.median).toBe(3);
    expect(price?.mean).toBe(3);
    const test = row({ market_price_usd: { status: 'available', numeric: 1_000_000 } });
    const again = fitPreprocessor(train);
    expect(again.numeric.find((item) => item.name === 'market_price_usd')?.median).toBe(price?.median);
    expect(again.numeric.find((item) => item.name === 'market_price_usd')?.std).toBe(price?.std);
    const transformed = transformRawFeatures(test, preprocessor);
    const priceIndex = 0;
    expect(transformed[priceIndex]).toBe(10);
  });

  it('uses z=0 when std is 0 and imputes 0 when the TRAIN column is entirely missing', () => {
    const train = [row({ market_price_usd: { status: 'available', numeric: 2 } }), row({ market_price_usd: { status: 'available', numeric: 2 } })];
    const preprocessor = fitPreprocessor(train);
    const z = transformRawFeatures(row({ market_price_usd: { status: 'available', numeric: 2 } }), preprocessor);
    expect(z[0]).toBe(0);
    const missingTrain = [row({}), row({})];
    const missingFit = fitPreprocessor(missingTrain);
    const cap = missingFit.numeric.find((item) => item.name === 'market_cap_usd');
    expect(cap?.median).toBe(0);
    const transformed = transformRawFeatures(row({}), missingFit);
    const capIndex = ML19_MODEL_FEATURES.findIndex((feature) => feature.name === 'market_cap_usd');
    let cursor = 0;
    for (let i = 0; i < capIndex; i += 1) {
      cursor += ML19_MODEL_FEATURES[i]?.nullable ? 2 : 1;
    }
    expect(transformed[cursor]).toBe(0);
    expect(transformed[cursor + 1]).toBe(1);
  });

  it('keeps missing indicators as 0/1 and clips ±100 sigma to ±10', () => {
    const train = [
      row({ market_price_usd: { status: 'available', numeric: 0 } }),
      row({ market_price_usd: { status: 'available', numeric: 1 } }),
    ];
    const preprocessor = fitPreprocessor(train);
    const high = transformRawFeatures(row({ market_price_usd: { status: 'available', numeric: 100 } }), preprocessor);
    const low = transformRawFeatures(row({ market_price_usd: { status: 'available', numeric: -100 } }), preprocessor);
    expect(high[0]).toBe(10);
    expect(low[0]).toBe(-10);
    const observed = transformRawFeatures(row({ market_price_usd: { status: 'available', numeric: 1 } }), preprocessor);
    expect(observed[1]).toBe(0);
    const missing = transformRawFeatures(row({ market_price_usd: { status: 'unavailable' } }), preprocessor);
    expect(missing[1]).toBe(1);
  });

  it('encodes nullable booleans without treating missing as observed false', () => {
    const train = [
      row({ risk_data_complete: { status: 'available', boolean: false } }),
      row({ risk_data_complete: { status: 'available', boolean: true } }),
      row({ risk_data_complete: { status: 'unavailable' } }),
    ];
    const preprocessor = fitPreprocessor(train);
    expect(preprocessor.booleanMissingPolicy).toBe('observed_false_0_0__observed_true_1_0__missing_0_1');
    expect(preprocessor.medianImputeBooleans).toBe(false);
    let index = 0;
    for (const spec of ML19_MODEL_FEATURES) {
      if (spec.name === 'risk_data_complete') {
        break;
      }
      index += spec.nullable ? 2 : 1;
    }
    expect(
      transformRawFeatures(row({ risk_data_complete: { status: 'available', boolean: false } }), preprocessor).slice(
        index,
        index + 2,
      ),
    ).toEqual([0, 0]);
    expect(
      transformRawFeatures(row({ risk_data_complete: { status: 'available', boolean: true } }), preprocessor).slice(
        index,
        index + 2,
      ),
    ).toEqual([1, 0]);
    expect(
      transformRawFeatures(row({ risk_data_complete: { status: 'unavailable' } }), preprocessor).slice(index, index + 2),
    ).toEqual([0, 1]);
  });

  it('uses the frozen TRAIN median and population std and ignores TEST in the fingerprint', () => {
    expect(stableMedian([1, 2, 100])).toBe(2);
    expect(stableMedian([1, 2, 3, 100])).toBe(2.5);
    expect(stableMedian([100, 1, 2])).toBe(2);
    const mean = populationMean([1, 2, 3]);
    expect(mean).toBe(2);
    expect(populationStd([1, 2, 3], mean)).toBeCloseTo(Math.sqrt(2 / 3), 12);
    const train = [
      row({ market_price_usd: { status: 'available', numeric: 1 } }),
      row({ market_price_usd: { status: 'available', numeric: 3 } }),
    ];
    const first = fitPreprocessor(train);
    expect(fitPreprocessor(train).fingerprint).toBe(first.fingerprint);
    const withTest = fitPreprocessor([
      ...train,
      row({ market_price_usd: { status: 'available', numeric: 1_000_000 } }),
    ]);
    expect(withTest.fingerprint).not.toBe(first.fingerprint);
  });
});
