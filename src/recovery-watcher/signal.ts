import {
  RECOVERY_V0_MAX_PRICE_CHANGE_5M_PCT,
  RECOVERY_V0_MAX_VOLUME_TO_LIQUIDITY_5M_EXCLUSIVE,
  RECOVERY_V0_MIN_CONFIRMATION_LIQUIDITY_USD,
  RECOVERY_V0_MIN_DIP_VOLUME_5M_USD,
  RECOVERY_V0_MIN_PRICE_CHANGE_5M_PCT,
  RECOVERY_V0_MIN_VOLUME_TO_LIQUIDITY_5M,
  RW0_WATCH_TTL_MS,
} from './constants.js';
import { parseUtcInstant } from './clock.js';
import { RecoveryWatcherError } from './errors.js';
import type { DipFilterResult, RecoveryConfirmationResult } from './types.js';

const RATIO_RELATIVE_TOLERANCE = 1e-9;

export function isKnownFinite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

export function assertOptionalFiniteNonNegative(
  value: number | null | undefined,
  label: string,
): void {
  if (value === null || value === undefined) {
    return;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new RecoveryWatcherError(`${label} must be a finite number >= 0.`, {
      code: 'evidence_invalid',
    });
  }
}

export function assertOptionalPositivePrice(value: number | null | undefined, label: string): void {
  if (value === null || value === undefined) {
    return;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new RecoveryWatcherError(`${label} must be a finite price > 0.`, {
      code: 'evidence_invalid',
    });
  }
}

export function computeVolumeToLiquidity5m(
  volume5mUsd: number | null | undefined,
  liquidityUsd: number | null | undefined,
): number | null {
  if (!isKnownFinite(volume5mUsd) || !isKnownFinite(liquidityUsd) || liquidityUsd <= 0) {
    return null;
  }
  const ratio = volume5mUsd / liquidityUsd;
  return Number.isFinite(ratio) ? ratio : null;
}

export function suppliedRatioDisagrees(supplied: number, computed: number): boolean {
  if (Object.is(supplied, computed)) {
    return false;
  }
  const scale = Math.max(1, Math.abs(computed), Math.abs(supplied));
  return Math.abs(supplied - computed) > RATIO_RELATIVE_TOLERANCE * scale;
}

export function resolveVolumeToLiquidity5m(input: {
  volumeToLiquidity5m?: number | null;
  volume5mUsd?: number | null;
  liquidityUsd?: number | null;
}): { kind: 'computed'; value: number } | { kind: 'missing' } | { kind: 'conflict'; reason: string } {
  const computed = computeVolumeToLiquidity5m(input.volume5mUsd, input.liquidityUsd);
  if (isKnownFinite(input.volumeToLiquidity5m)) {
    if (computed === null) {
      return {
        kind: 'conflict',
        reason: 'caller-supplied volume_to_liquidity_5m cannot be verified without raw volume and liquidity',
      };
    }
    if (suppliedRatioDisagrees(input.volumeToLiquidity5m, computed)) {
      return {
        kind: 'conflict',
        reason: 'caller-supplied volume_to_liquidity_5m disagrees with volume_5m_usd / liquidity_usd',
      };
    }
    return { kind: 'computed', value: computed };
  }
  if (computed === null) {
    return { kind: 'missing' };
  }
  return { kind: 'computed', value: computed };
}

export function evaluateRecoveryV0DipFilters(input: {
  observedPriceUsd?: number | null;
  priceChange5mPct?: number | null;
  volume5mUsd?: number | null;
  liquidityUsd?: number | null;
  volumeToLiquidity5m?: number | null;
}): DipFilterResult {
  if (!isKnownFinite(input.observedPriceUsd)) {
    return { kind: 'reject_incomplete', reason: 'dip observed price is unavailable' };
  }
  if (!isKnownFinite(input.priceChange5mPct)) {
    return { kind: 'reject_incomplete', reason: 'price_change_5m_pct is unavailable' };
  }
  if (!isKnownFinite(input.volume5mUsd)) {
    return { kind: 'reject_incomplete', reason: 'dip volume_5m_usd is unavailable' };
  }

  if (
    isKnownFinite(input.volumeToLiquidity5m) ||
    (isKnownFinite(input.volume5mUsd) && isKnownFinite(input.liquidityUsd))
  ) {
    const ratio = resolveVolumeToLiquidity5m(input);
    if (ratio.kind === 'conflict') {
      return { kind: 'reject_invalid', reason: ratio.reason };
    }
  }

  if (input.observedPriceUsd <= 0) {
    return { kind: 'reject_filter', reason: 'dip observed price must be > 0' };
  }
  if (
    input.priceChange5mPct < RECOVERY_V0_MIN_PRICE_CHANGE_5M_PCT ||
    input.priceChange5mPct > RECOVERY_V0_MAX_PRICE_CHANGE_5M_PCT
  ) {
    return { kind: 'reject_filter', reason: 'price_change_5m_pct outside [-60, -40]' };
  }
  if (input.volume5mUsd < RECOVERY_V0_MIN_DIP_VOLUME_5M_USD) {
    return { kind: 'reject_filter', reason: 'dip volume_5m_usd below 5000' };
  }
  return { kind: 'pass' };
}

export function evaluateRecoveryConfirmation(input: {
  dipPairAddress: string;
  dipPriceUsd: number | null;
  dipObservedAt: string;
  watchStartedAt: string;
  observationPairAddress: string;
  observationPriceUsd: number | null;
  observationCollectedAt: string;
  observationLiquidityUsd?: number | null;
  observationVolume5mUsd?: number | null;
  observationVolumeToLiquidity5m?: number | null;
}): RecoveryConfirmationResult {
  if (!isKnownFinite(input.dipPriceUsd)) {
    return { kind: 'incomplete', reason: 'dip price is unavailable' };
  }
  if (input.dipPriceUsd <= 0) {
    return { kind: 'invalid', reason: 'dip observed price must be > 0' };
  }
  if (!isKnownFinite(input.observationPriceUsd)) {
    return { kind: 'incomplete', reason: 'confirmation price is unavailable' };
  }
  if (input.observationPriceUsd <= 0) {
    return { kind: 'invalid', reason: 'confirmation price must be > 0' };
  }
  if (input.observationPairAddress !== input.dipPairAddress) {
    return { kind: 'invalid', reason: 'observation pair does not match dip pair' };
  }
  const dipAt = parseUtcInstant(input.dipObservedAt, 'dip_observed_at');
  const observedAt = parseUtcInstant(input.observationCollectedAt, 'observation_collected_at');
  if (observedAt <= dipAt) {
    return { kind: 'invalid', reason: 'recovery observation must be strictly later than the dip' };
  }
  const watchExpiresAtMs = parseUtcInstant(input.watchStartedAt, 'watch_started_at') + RW0_WATCH_TTL_MS;
  if (observedAt >= watchExpiresAtMs) {
    return {
      kind: 'invalid',
      reason:
        'recovery confirmation must occur strictly before watchStartedAt + RW0_WATCH_TTL_MS; exact expiry belongs to EXPIRED',
    };
  }
  if (!isKnownFinite(input.observationLiquidityUsd)) {
    return { kind: 'incomplete', reason: 'confirmation liquidity_usd is unavailable' };
  }
  if (!isKnownFinite(input.observationVolume5mUsd)) {
    return { kind: 'incomplete', reason: 'confirmation volume_5m_usd is unavailable' };
  }
  const ratio = resolveVolumeToLiquidity5m({
    volume5mUsd: input.observationVolume5mUsd,
    liquidityUsd: input.observationLiquidityUsd,
    ...(input.observationVolumeToLiquidity5m === undefined
      ? {}
      : { volumeToLiquidity5m: input.observationVolumeToLiquidity5m }),
  });
  if (ratio.kind === 'conflict') {
    return { kind: 'invalid', reason: ratio.reason };
  }
  if (ratio.kind === 'missing') {
    return { kind: 'incomplete', reason: 'confirmation volume_to_liquidity_5m is unavailable' };
  }
  if (input.observationPriceUsd <= input.dipPriceUsd) {
    return { kind: 'not_yet', reason: 'confirmation price is not greater than dip price' };
  }
  if (input.observationLiquidityUsd < RECOVERY_V0_MIN_CONFIRMATION_LIQUIDITY_USD) {
    return { kind: 'not_yet', reason: 'confirmation liquidity_usd below 10000' };
  }
  if (
    ratio.value < RECOVERY_V0_MIN_VOLUME_TO_LIQUIDITY_5M ||
    ratio.value >= RECOVERY_V0_MAX_VOLUME_TO_LIQUIDITY_5M_EXCLUSIVE
  ) {
    return { kind: 'not_yet', reason: 'confirmation volume_to_liquidity_5m outside [1.0, 3.0)' };
  }
  return { kind: 'confirmed', volumeToLiquidity5m: ratio.value };
}
