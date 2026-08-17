import type { MarketSnapshot } from '../market-data/types.js';
import type { FeatureName } from './definitions.js';
import {
  availableInteger,
  availableNumber,
  buyShareBps,
  isFiniteNumber,
  isNonNegativeFinite,
  isNonNegativeSafeInteger,
  secondsBetween,
  unavailable,
} from './numbers.js';
import { FeatureEngineError, type FeatureValue } from './types.js';

export function directMarketNumber(
  name: FeatureName,
  value: number | null,
  sourceField: string,
  options: { allowNegative?: boolean } = {},
): FeatureValue {
  if (value === null) {
    return unavailable(name, `${sourceField} is unavailable`);
  }

  if (options.allowNegative === true) {
    if (!isFiniteNumber(value)) {
      return unavailable(name, `${sourceField} is not a finite number`);
    }
  } else if (!isNonNegativeFinite(value)) {
    return unavailable(name, `${sourceField} is not a finite non-negative number`);
  }

  return availableNumber(name, value);
}

export function directMarketCount(name: FeatureName, value: number | null, sourceField: string): FeatureValue {
  if (value === null) {
    return unavailable(name, `${sourceField} is unavailable`);
  }

  if (!isNonNegativeSafeInteger(value)) {
    return unavailable(name, `${sourceField} is not a non-negative safe integer`);
  }

  return availableInteger(name, value);
}

export function pairAgeSeconds(market: MarketSnapshot): FeatureValue {
  if (market.pairCreatedAt === null) {
    return unavailable('pair_age_seconds', 'pairCreatedAt is unavailable');
  }

  try {
    const seconds = secondsBetween(market.collectedAt, market.pairCreatedAt, 'pair_age_seconds');
    if (seconds < 0) {
      return unavailable('pair_age_seconds', 'pairCreatedAt is after collectedAt');
    }

    return availableInteger('pair_age_seconds', seconds);
  } catch {
    return unavailable('pair_age_seconds', 'pairCreatedAt is not a valid UTC timestamp');
  }
}

export function marketAgeSeconds(asOf: string, collectedAt: string): FeatureValue {
  const seconds = secondsBetween(asOf, collectedAt, 'market_age_seconds');
  if (seconds < 0) {
    throw new FeatureEngineError('market_age_seconds must not be negative.');
  }
  return availableInteger('market_age_seconds', seconds);
}

export function tradeCount(
  name: 'trades_5m' | 'trades_1h',
  buys: number | null,
  sells: number | null,
  buyField: string,
  sellField: string,
): FeatureValue {
  const counts = requireTradeCounts(buys, sells);
  if (counts === null) {
    return unavailable(name, tradeUnavailableReason(buys, sells, buyField, sellField));
  }

  return availableInteger(name, counts.buys + counts.sells);
}

export function netBuys(
  name: 'net_buys_5m' | 'net_buys_1h',
  buys: number | null,
  sells: number | null,
  buyField: string,
  sellField: string,
): FeatureValue {
  const counts = requireTradeCounts(buys, sells);
  if (counts === null) {
    return unavailable(name, tradeUnavailableReason(buys, sells, buyField, sellField));
  }

  return availableInteger(name, counts.buys - counts.sells);
}

export function buyShare(
  name: 'buy_share_5m_bps' | 'buy_share_1h_bps',
  buys: number | null,
  sells: number | null,
  buyField: string,
  sellField: string,
  interval: string,
): FeatureValue {
  const counts = requireTradeCounts(buys, sells);
  if (counts === null) {
    return unavailable(name, tradeUnavailableReason(buys, sells, buyField, sellField));
  }

  if (counts.buys + counts.sells === 0) {
    return unavailable(name, `no observed trades in the ${interval} interval`);
  }

  const share = buyShareBps(counts.buys, counts.sells);
  if (share === null) {
    return unavailable(name, `no observed trades in the ${interval} interval`);
  }

  return availableInteger(name, share);
}

export function volumeToLiquidity(
  name: 'volume_to_liquidity_5m_ratio' | 'volume_to_liquidity_1h_ratio' | 'volume_to_liquidity_24h_ratio',
  volume: number | null,
  liquidity: number | null,
  volumeField: string,
): FeatureValue {
  if (liquidity === null) {
    return unavailable(name, 'liquidityUsd is unavailable');
  }
  if (!isFiniteNumber(liquidity) || liquidity <= 0) {
    return unavailable(name, 'liquidityUsd must be finite and greater than 0');
  }
  if (volume === null) {
    return unavailable(name, `${volumeField} is unavailable`);
  }
  if (!isNonNegativeFinite(volume)) {
    return unavailable(name, `${volumeField} is not a finite non-negative number`);
  }

  const value = volume / liquidity;
  if (!Number.isFinite(value)) {
    return unavailable(name, 'volume/liquidity ratio is not finite');
  }

  return availableNumber(name, value);
}

export function liquidityToMarketCap(liquidity: number | null, marketCap: number | null): FeatureValue {
  if (liquidity === null) {
    return unavailable('liquidity_to_market_cap_ratio', 'liquidityUsd is unavailable');
  }
  if (!isNonNegativeFinite(liquidity)) {
    return unavailable('liquidity_to_market_cap_ratio', 'liquidityUsd is not a finite non-negative number');
  }
  if (marketCap === null) {
    return unavailable('liquidity_to_market_cap_ratio', 'marketCapUsd is unavailable');
  }
  if (!isFiniteNumber(marketCap) || marketCap <= 0) {
    return unavailable('liquidity_to_market_cap_ratio', 'marketCapUsd must be finite and greater than 0');
  }

  const value = liquidity / marketCap;
  if (!Number.isFinite(value)) {
    return unavailable('liquidity_to_market_cap_ratio', 'liquidity/market-cap ratio is not finite');
  }

  return availableNumber('liquidity_to_market_cap_ratio', value);
}

function requireTradeCounts(
  buys: number | null,
  sells: number | null,
): { buys: number; sells: number } | null {
  if (!isNonNegativeSafeInteger(buys) || !isNonNegativeSafeInteger(sells)) {
    return null;
  }

  return { buys, sells };
}

function tradeUnavailableReason(
  buys: number | null,
  sells: number | null,
  buyField: string,
  sellField: string,
): string {
  if (buys === null) {
    return `${buyField} is unavailable`;
  }
  if (sells === null) {
    return `${sellField} is unavailable`;
  }
  if (!isNonNegativeSafeInteger(buys)) {
    return `${buyField} is not a non-negative safe integer`;
  }
  return `${sellField} is not a non-negative safe integer`;
}
