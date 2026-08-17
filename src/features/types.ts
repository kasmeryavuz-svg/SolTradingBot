import type { MarketSnapshot } from '../market-data/types.js';
import type { TokenRiskReport } from '../risk/types.js';
import type { FeatureName } from './definitions.js';

export class FeatureEngineError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FeatureEngineError';
  }
}

export const FEATURE_VALUE_KINDS = ['number', 'integer', 'boolean'] as const;
export const FEATURE_VALUE_STATUSES = ['available', 'unavailable'] as const;
export const FEATURE_COMPLETENESS_VALUES = ['complete', 'partial'] as const;
export const FEATURE_CATEGORIES = ['market', 'flow', 'historical', 'risk', 'data_quality'] as const;

export type FeatureValueKind = (typeof FEATURE_VALUE_KINDS)[number];
export type FeatureValueStatus = (typeof FEATURE_VALUE_STATUSES)[number];
export type FeatureCompleteness = (typeof FEATURE_COMPLETENESS_VALUES)[number];
export type FeatureCategory = (typeof FEATURE_CATEGORIES)[number];

export type FeatureInputs = {
  market: MarketSnapshot;
  previousMarket: MarketSnapshot | null;
  risk: TokenRiskReport | null;
  /**
   * Sanitized live-command detail only. Persisted risk-unavailable feature
   * reasons use stable codes, not this transient provider text.
   */
  riskUnavailableReason: string | null;
  asOf: string;
};

export type FeatureValue = {
  name: FeatureName;
  kind: FeatureValueKind;
  status: FeatureValueStatus;
  value: number | boolean | null;
  unavailableReason: string | null;
};

export type FeatureVector = {
  chain: 'solana';
  tokenMint: string;
  featureSetVersion: string;
  generatedAt: string;
  asOf: string;
  marketCollectedAt: string;
  marketPairAddress: string;
  previousMarketCollectedAt: string | null;
  riskScannedAt: string | null;
  featureCompleteness: FeatureCompleteness;
  availableFeatureCount: number;
  unavailableFeatureCount: number;
  values: FeatureValue[];
};
