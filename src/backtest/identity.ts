import { createHash } from 'node:crypto';
import {
  BACKTEST_SPEC_NAME,
  BACKTEST_SPEC_VERSION,
  FORWARD_HORIZON_SECONDS,
  OUTCOME_MAX_DELAY_SECONDS,
  REQUIRED_BACKTEST_FEATURE_SET_VERSION,
  REQUIRED_BACKTEST_STRATEGY_VERSION,
} from './constants.js';

/**
 * Canonical b08_v1 definition fingerprint contract.
 *
 * SHA-256 of JSON.stringify(canonicalBacktestDefinition()) with explicit key
 * order. Portable data only: no function source, file bytes, git SHA, locale,
 * timezone, wall-clock time, or randomness.
 */
export type CanonicalBacktestDefinition = {
  backtestSpecVersion: string;
  backtestSpecName: string;
  requiredFeatureSetVersion: string;
  requiredStrategyVersion: string;
  samplingPolicy: string;
  asOfPolicy: string;
  previousMarketPolicy: {
    sameToken: boolean;
    samePair: boolean;
    relation: string;
    selection: string;
  };
  riskPolicy: {
    sameToken: boolean;
    relation: string;
    selection: string;
    freshnessGate: string;
  };
  forwardHorizonSeconds: number;
  outcomeMaxDelaySeconds: number;
  outcomeWindow: {
    startInclusive: boolean;
    endInclusive: boolean;
  };
  outcomePairPolicy: string;
  outcomeSelection: string;
  invalidOutcomePricePolicy: string;
  returnFormula: string;
  costModel: string;
  positionModel: string;
  candidateDedup: string;
};

export type CanonicalBacktestDefinitionOverrides = {
  backtestSpecVersion?: string;
  backtestSpecName?: string;
  requiredFeatureSetVersion?: string;
  requiredStrategyVersion?: string;
  samplingPolicy?: string;
  asOfPolicy?: string;
  previousMarketPolicy?: Partial<CanonicalBacktestDefinition['previousMarketPolicy']>;
  riskPolicy?: Partial<CanonicalBacktestDefinition['riskPolicy']>;
  forwardHorizonSeconds?: number;
  outcomeMaxDelaySeconds?: number;
  outcomeWindow?: Partial<CanonicalBacktestDefinition['outcomeWindow']>;
  outcomePairPolicy?: string;
  outcomeSelection?: string;
  invalidOutcomePricePolicy?: string;
  returnFormula?: string;
  costModel?: string;
  positionModel?: string;
  candidateDedup?: string;
};

export function canonicalBacktestDefinition(
  overrides: CanonicalBacktestDefinitionOverrides = {},
): CanonicalBacktestDefinition {
  return {
    backtestSpecVersion: overrides.backtestSpecVersion ?? BACKTEST_SPEC_VERSION,
    backtestSpecName: overrides.backtestSpecName ?? BACKTEST_SPEC_NAME,
    requiredFeatureSetVersion: overrides.requiredFeatureSetVersion ?? REQUIRED_BACKTEST_FEATURE_SET_VERSION,
    requiredStrategyVersion: overrides.requiredStrategyVersion ?? REQUIRED_BACKTEST_STRATEGY_VERSION,
    samplingPolicy: overrides.samplingPolicy ?? 'every_historical_market_snapshot',
    asOfPolicy: overrides.asOfPolicy ?? 'market_collected_at',
    previousMarketPolicy: {
      sameToken: overrides.previousMarketPolicy?.sameToken ?? true,
      samePair: overrides.previousMarketPolicy?.samePair ?? true,
      relation: overrides.previousMarketPolicy?.relation ?? '<',
      selection: overrides.previousMarketPolicy?.selection ?? 'latest_eligible',
    },
    riskPolicy: {
      sameToken: overrides.riskPolicy?.sameToken ?? true,
      relation: overrides.riskPolicy?.relation ?? '<=',
      selection: overrides.riskPolicy?.selection ?? 'latest_eligible',
      freshnessGate: overrides.riskPolicy?.freshnessGate ?? 'none',
    },
    forwardHorizonSeconds: overrides.forwardHorizonSeconds ?? FORWARD_HORIZON_SECONDS,
    outcomeMaxDelaySeconds: overrides.outcomeMaxDelaySeconds ?? OUTCOME_MAX_DELAY_SECONDS,
    outcomeWindow: {
      startInclusive: overrides.outcomeWindow?.startInclusive ?? true,
      endInclusive: overrides.outcomeWindow?.endInclusive ?? true,
    },
    outcomePairPolicy: overrides.outcomePairPolicy ?? 'same_pair_only',
    outcomeSelection: overrides.outcomeSelection ?? 'earliest_snapshot_in_window',
    invalidOutcomePricePolicy:
      overrides.invalidOutcomePricePolicy ??
      'selected_earliest_becomes_unavailable_do_not_search_later',
    returnFormula:
      overrides.returnFormula ?? '((outcomePriceUsd-referencePriceUsd)/referencePriceUsd)*100',
    costModel: overrides.costModel ?? 'none',
    positionModel: overrides.positionModel ?? 'none',
    candidateDedup: overrides.candidateDedup ?? 'none',
  };
}

export function mutateCanonicalBacktestDefinition(
  mutate: (definition: CanonicalBacktestDefinition) => void,
): CanonicalBacktestDefinition {
  const definition = structuredClone(canonicalBacktestDefinition());
  mutate(definition);
  return definition;
}

export function fingerprintBacktestDefinition(
  definition: CanonicalBacktestDefinition = canonicalBacktestDefinition(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export const BACKTEST_DEFINITION_FINGERPRINT = fingerprintBacktestDefinition();
