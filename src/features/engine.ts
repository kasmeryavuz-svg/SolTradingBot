import { isPlausibleSolanaMint } from '../utils/solana-mint.js';
import { FEATURE_DEFINITIONS, FEATURE_SET_VERSION, featureRegistrySize } from './definitions.js';
import {
  buyShare,
  directMarketCount,
  directMarketNumber,
  liquidityToMarketCap,
  marketAgeSeconds,
  netBuys,
  pairAgeSeconds,
  tradeCount,
  volumeToLiquidity,
} from './market-features.js';
import {
  observedLiquidityChange,
  observedPriceChange,
  secondsSincePrevious,
  unavailableHistoricalFeatures,
} from './historical-features.js';
import { requireSolanaChain, requireUtcTimestamp } from './numbers.js';
import { riskDerivedFeatures } from './risk-features.js';
import { FeatureEngineError } from './types.js';
import type { FeatureInputs, FeatureValue, FeatureVector } from './types.js';

export function generateFeatureVector(
  inputs: FeatureInputs,
  options: { generatedAt: string },
): FeatureVector {
  assertFeatureInputs(inputs, options.generatedAt);

  const values: FeatureValue[] = [
    directMarketNumber('market_price_usd', inputs.market.priceUsd, 'priceUsd'),
    directMarketNumber('market_liquidity_usd', inputs.market.liquidityUsd, 'liquidityUsd'),
    directMarketNumber('market_volume_5m_usd', inputs.market.volume5mUsd, 'volume5mUsd'),
    directMarketNumber('market_volume_1h_usd', inputs.market.volume1hUsd, 'volume1hUsd'),
    directMarketNumber('market_volume_24h_usd', inputs.market.volume24hUsd, 'volume24hUsd'),
    directMarketCount('market_buys_5m', inputs.market.buys5m, 'buys5m'),
    directMarketCount('market_sells_5m', inputs.market.sells5m, 'sells5m'),
    directMarketCount('market_buys_1h', inputs.market.buys1h, 'buys1h'),
    directMarketCount('market_sells_1h', inputs.market.sells1h, 'sells1h'),
    directMarketNumber('market_price_change_5m_pct', inputs.market.priceChange5mPct, 'priceChange5mPct', {
      allowNegative: true,
    }),
    directMarketNumber('market_price_change_1h_pct', inputs.market.priceChange1hPct, 'priceChange1hPct', {
      allowNegative: true,
    }),
    directMarketNumber('market_price_change_24h_pct', inputs.market.priceChange24hPct, 'priceChange24hPct', {
      allowNegative: true,
    }),
    directMarketNumber('market_cap_usd', inputs.market.marketCapUsd, 'marketCapUsd'),
    directMarketNumber('market_fdv_usd', inputs.market.fdvUsd, 'fdvUsd'),
    pairAgeSeconds(inputs.market),
    marketAgeSeconds(inputs.asOf, inputs.market.collectedAt),
    tradeCount('trades_5m', inputs.market.buys5m, inputs.market.sells5m, 'buys5m', 'sells5m'),
    tradeCount('trades_1h', inputs.market.buys1h, inputs.market.sells1h, 'buys1h', 'sells1h'),
    netBuys('net_buys_5m', inputs.market.buys5m, inputs.market.sells5m, 'buys5m', 'sells5m'),
    netBuys('net_buys_1h', inputs.market.buys1h, inputs.market.sells1h, 'buys1h', 'sells1h'),
    buyShare('buy_share_5m_bps', inputs.market.buys5m, inputs.market.sells5m, 'buys5m', 'sells5m', '5m'),
    buyShare('buy_share_1h_bps', inputs.market.buys1h, inputs.market.sells1h, 'buys1h', 'sells1h', '1h'),
    volumeToLiquidity(
      'volume_to_liquidity_5m_ratio',
      inputs.market.volume5mUsd,
      inputs.market.liquidityUsd,
      'volume5mUsd',
    ),
    volumeToLiquidity(
      'volume_to_liquidity_1h_ratio',
      inputs.market.volume1hUsd,
      inputs.market.liquidityUsd,
      'volume1hUsd',
    ),
    volumeToLiquidity(
      'volume_to_liquidity_24h_ratio',
      inputs.market.volume24hUsd,
      inputs.market.liquidityUsd,
      'volume24hUsd',
    ),
    liquidityToMarketCap(inputs.market.liquidityUsd, inputs.market.marketCapUsd),
    ...historicalValues(inputs),
    ...riskDerivedFeatures(inputs.risk, inputs.asOf),
  ];

  assertRegistryCoverage(values);

  const availableFeatureCount = values.filter((value) => value.status === 'available').length;
  const unavailableFeatureCount = values.length - availableFeatureCount;

  return {
    chain: 'solana',
    tokenMint: inputs.market.tokenMint,
    featureSetVersion: FEATURE_SET_VERSION,
    generatedAt: options.generatedAt,
    asOf: inputs.asOf,
    marketCollectedAt: inputs.market.collectedAt,
    marketPairAddress: inputs.market.pairAddress,
    previousMarketCollectedAt: inputs.previousMarket?.collectedAt ?? null,
    riskScannedAt: inputs.risk?.scannedAt ?? null,
    featureCompleteness: unavailableFeatureCount === 0 ? 'complete' : 'partial',
    availableFeatureCount,
    unavailableFeatureCount,
    values,
  };
}

function historicalValues(inputs: FeatureInputs): FeatureValue[] {
  if (inputs.previousMarket === null) {
    return unavailableHistoricalFeatures('no eligible previous same-pair market snapshot');
  }

  return [
    secondsSincePrevious(inputs.market, inputs.previousMarket),
    observedPriceChange(inputs.market, inputs.previousMarket),
    observedLiquidityChange(inputs.market, inputs.previousMarket),
  ];
}

function assertFeatureInputs(inputs: FeatureInputs, generatedAt: string): void {
  requireSolanaChain(inputs.market.chain, 'Feature inputs must describe a Solana market snapshot.');

  if (!isPlausibleSolanaMint(inputs.market.tokenMint)) {
    throw new FeatureEngineError('Invalid market token mint.');
  }

  const generatedAtMs = requireUtcTimestamp(generatedAt, 'generatedAt');
  const asOfMs = requireUtcTimestamp(inputs.asOf, 'asOf');
  const marketCollectedAtMs = requireUtcTimestamp(inputs.market.collectedAt, 'market.collectedAt');

  if (generatedAtMs < asOfMs) {
    throw new FeatureEngineError('generatedAt must be at or after asOf.');
  }

  if (marketCollectedAtMs > asOfMs) {
    throw new FeatureEngineError('market.collectedAt must be at or before asOf.');
  }

  if (inputs.risk !== null) {
    if (inputs.risk.tokenMint !== inputs.market.tokenMint) {
      throw new FeatureEngineError('Risk report token mint does not match the market snapshot.');
    }

    const riskScannedAtMs = requireUtcTimestamp(inputs.risk.scannedAt, 'risk.scannedAt');
    if (riskScannedAtMs > asOfMs) {
      throw new FeatureEngineError('risk.scannedAt must be at or before asOf.');
    }
  }

  if (inputs.previousMarket !== null) {
    if (inputs.previousMarket.tokenMint !== inputs.market.tokenMint) {
      throw new FeatureEngineError('Previous market token mint does not match the current snapshot.');
    }

    if (inputs.previousMarket.pairAddress !== inputs.market.pairAddress) {
      throw new FeatureEngineError('Previous market pair address does not match the current snapshot.');
    }

    const previousCollectedAtMs = requireUtcTimestamp(
      inputs.previousMarket.collectedAt,
      'previousMarket.collectedAt',
    );
    if (previousCollectedAtMs >= marketCollectedAtMs) {
      throw new FeatureEngineError('previousMarket.collectedAt must be strictly before market.collectedAt.');
    }
  }
}

function assertRegistryCoverage(values: readonly FeatureValue[]): void {
  if (values.length !== featureRegistrySize()) {
    throw new FeatureEngineError('Feature vector does not contain every registered c06_v1 feature.');
  }

  for (const [index, definition] of FEATURE_DEFINITIONS.entries()) {
    const value = values[index];
    if (value === undefined || value.name !== definition.name || value.kind !== definition.kind) {
      throw new FeatureEngineError('Feature vector order does not match the c06_v1 registry.');
    }
  }
}
