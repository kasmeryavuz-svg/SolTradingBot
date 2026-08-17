import type { MarketSnapshot } from '../market-data/types.js';
import {
  availableInteger,
  availableNumber,
  isFiniteNumber,
  percentChange,
  secondsBetween,
  unavailable,
} from './numbers.js';
import type { FeatureValue } from './types.js';

export function secondsSincePrevious(market: MarketSnapshot, previous: MarketSnapshot): FeatureValue {
  const seconds = secondsBetween(
    market.collectedAt,
    previous.collectedAt,
    'seconds_since_previous_snapshot',
  );
  return availableInteger('seconds_since_previous_snapshot', seconds);
}

export function observedPriceChange(market: MarketSnapshot, previous: MarketSnapshot): FeatureValue {
  if (market.priceUsd === null) {
    return unavailable('observed_price_change_from_previous_pct', 'current priceUsd is unavailable');
  }
  if (!isFiniteNumber(market.priceUsd)) {
    return unavailable('observed_price_change_from_previous_pct', 'current priceUsd is not finite');
  }
  if (previous.priceUsd === null) {
    return unavailable('observed_price_change_from_previous_pct', 'previous priceUsd is unavailable');
  }
  if (!isFiniteNumber(previous.priceUsd)) {
    return unavailable('observed_price_change_from_previous_pct', 'previous priceUsd is not finite');
  }
  if (previous.priceUsd <= 0) {
    return unavailable('observed_price_change_from_previous_pct', 'previous priceUsd must be greater than 0');
  }

  const change = percentChange(market.priceUsd, previous.priceUsd);
  if (change === null) {
    return unavailable('observed_price_change_from_previous_pct', 'observed price change is not finite');
  }

  return availableNumber('observed_price_change_from_previous_pct', change);
}

export function observedLiquidityChange(market: MarketSnapshot, previous: MarketSnapshot): FeatureValue {
  if (market.liquidityUsd === null) {
    return unavailable('observed_liquidity_change_from_previous_pct', 'current liquidityUsd is unavailable');
  }
  if (!isFiniteNumber(market.liquidityUsd)) {
    return unavailable('observed_liquidity_change_from_previous_pct', 'current liquidityUsd is not finite');
  }
  if (previous.liquidityUsd === null) {
    return unavailable('observed_liquidity_change_from_previous_pct', 'previous liquidityUsd is unavailable');
  }
  if (!isFiniteNumber(previous.liquidityUsd)) {
    return unavailable('observed_liquidity_change_from_previous_pct', 'previous liquidityUsd is not finite');
  }
  if (previous.liquidityUsd <= 0) {
    return unavailable(
      'observed_liquidity_change_from_previous_pct',
      'previous liquidityUsd must be greater than 0',
    );
  }

  const change = percentChange(market.liquidityUsd, previous.liquidityUsd);
  if (change === null) {
    return unavailable(
      'observed_liquidity_change_from_previous_pct',
      'observed liquidity change is not finite',
    );
  }

  return availableNumber('observed_liquidity_change_from_previous_pct', change);
}

export function unavailableHistoricalFeatures(reason: string): FeatureValue[] {
  return [
    unavailable('seconds_since_previous_snapshot', reason),
    unavailable('observed_price_change_from_previous_pct', reason),
    unavailable('observed_liquidity_change_from_previous_pct', reason),
  ];
}
