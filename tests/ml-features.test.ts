import { describe, expect, it } from 'vitest';
import { FEATURE_NAMES } from '../src/features/definitions.js';
import {
  FORBIDDEN_ML_IDENTITY_FEATURES,
  ML19_MODEL_FEATURE_NAMES,
  ML19_MODEL_FEATURES,
  ML19_NULLABLE_FEATURE_COUNT,
  ML19_RAW_FEATURE_COUNT,
  ML19_TRANSFORMED_COLUMN_NAMES,
  ML19_TRANSFORMED_DIMENSION,
  isForbiddenIdentityFeature,
  requireMl19Feature,
} from '../src/ml/features.js';
import { formatMlFeatureLines, formatMlStatusLines } from '../src/ml/format.js';

describe('ml features', () => {
  it('freezes the exact c06 order and transformed dimension', () => {
    expect(ML19_MODEL_FEATURE_NAMES).toEqual(FEATURE_NAMES);
    expect(ML19_RAW_FEATURE_COUNT).toBe(48);
    expect(ML19_NULLABLE_FEATURE_COUNT).toBe(47);
    expect(ML19_TRANSFORMED_DIMENSION).toBe(95);
    const valueDims = ML19_MODEL_FEATURES.length;
    const missingDims = ML19_MODEL_FEATURES.filter((feature) => feature.missingIndicatorName !== null).length;
    expect(valueDims).toBe(48);
    expect(missingDims).toBe(47);
    expect(valueDims + missingDims).toBe(95);
    expect(ML19_TRANSFORMED_COLUMN_NAMES).toHaveLength(95);
    let cursor = 0;
    for (const feature of ML19_MODEL_FEATURES) {
      expect(ML19_TRANSFORMED_COLUMN_NAMES[cursor]).toBe(feature.name);
      cursor += 1;
      if (feature.nullable) {
        expect(feature.missingIndicatorName).toBe(`${feature.name}__missing`);
        expect(ML19_TRANSFORMED_COLUMN_NAMES[cursor]).toBe(feature.missingIndicatorName);
        cursor += 1;
      } else {
        expect(feature.missingIndicatorName).toBeNull();
      }
    }
    expect(cursor).toBe(95);
    expect(requireMl19Feature('market_age_seconds').nullable).toBe(false);
    expect(requireMl19Feature('market_price_usd').nullable).toBe(true);
    expect(requireMl19Feature('risk_data_complete').role).toBe('boolean');
    expect(() => requireMl19Feature('tokenMint')).toThrow(/Unknown ml19 feature/);
    expect(() => requireMl19Feature('wallet_address')).toThrow(/Unknown ml19 feature/);
  });

  it('rejects identity and leakage names as model features', () => {
    for (const name of FORBIDDEN_ML_IDENTITY_FEATURES) {
      expect(isForbiddenIdentityFeature(name)).toBe(true);
      expect((ML19_MODEL_FEATURE_NAMES as readonly string[]).includes(name)).toBe(false);
    }
    expect((ML19_MODEL_FEATURE_NAMES as readonly string[]).includes('tokenMint')).toBe(false);
    expect((ML19_MODEL_FEATURE_NAMES as readonly string[]).includes('label')).toBe(false);
    expect((ML19_MODEL_FEATURE_NAMES as readonly string[]).includes('pnl')).toBe(false);
  });

  it('prints frozen features without performance numbers', () => {
    const text = formatMlFeatureLines().join('\n');
    expect(text).toContain('NO PERFORMANCE NUMBERS');
    expect(text).toContain('market_price_usd');
    expect(text).not.toMatch(/rocAuc|profit factor|expectancy/i);
    expect(formatMlStatusLines().join('\n')).toContain('Wallet intelligence used: NO');
    expect(formatMlStatusLines().join('\n')).toContain('Migration 010: ABSENT');
  });
});
