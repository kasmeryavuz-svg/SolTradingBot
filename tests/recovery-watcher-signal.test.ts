import { describe, expect, it } from 'vitest';
import {
  evaluateRecoveryConfirmation,
  evaluateRecoveryV0DipFilters,
  resolveVolumeToLiquidity5m,
} from '../src/recovery-watcher/signal.js';
import { FIXTURE_DIP_AT, FIXTURE_PAIR, FIXTURE_TTL_ELIGIBLE_AT, FIXTURE_WATCH_AT } from './recovery-watcher-fixtures.js';

describe('recovery_v0 signal boundaries', () => {
  it('passes dip on crash band, dip volume >= 5000, and positive price without liquidity/V/L gates', () => {
    expect(
      evaluateRecoveryV0DipFilters({
        observedPriceUsd: 1,
        priceChange5mPct: -60,
        volume5mUsd: 5_000,
      }).kind,
    ).toBe('pass');
    expect(
      evaluateRecoveryV0DipFilters({
        observedPriceUsd: 0.0001,
        priceChange5mPct: -40,
        volume5mUsd: 5_000,
        liquidityUsd: 100,
      }).kind,
    ).toBe('pass');
  });

  it('does not apply $10k liquidity or V/L 1-3 to dip fields', () => {
    expect(
      evaluateRecoveryV0DipFilters({
        observedPriceUsd: 1,
        priceChange5mPct: -50,
        volume5mUsd: 5_000,
        liquidityUsd: 1,
      }).kind,
    ).toBe('pass');
    expect(
      evaluateRecoveryV0DipFilters({
        observedPriceUsd: 1,
        priceChange5mPct: -50,
        volume5mUsd: 5_000,
        liquidityUsd: 10_000,
        volumeToLiquidity5m: 0.5,
      }).kind,
    ).toBe('pass');
  });

  it('rejects dip values just outside each dip bound', () => {
    expect(
      evaluateRecoveryV0DipFilters({
        observedPriceUsd: 1,
        priceChange5mPct: -60.0001,
        volume5mUsd: 5_000,
      }).kind,
    ).toBe('reject_filter');
    expect(
      evaluateRecoveryV0DipFilters({
        observedPriceUsd: 1,
        priceChange5mPct: -39.9999,
        volume5mUsd: 5_000,
      }).kind,
    ).toBe('reject_filter');
    expect(
      evaluateRecoveryV0DipFilters({
        observedPriceUsd: 1,
        priceChange5mPct: -50,
        volume5mUsd: 4_999.99,
      }).kind,
    ).toBe('reject_filter');
    expect(
      evaluateRecoveryV0DipFilters({
        observedPriceUsd: 0,
        priceChange5mPct: -50,
        volume5mUsd: 5_000,
      }).kind,
    ).toBe('reject_filter');
  });

  it('fails closed on missing required dip fields', () => {
    expect(evaluateRecoveryV0DipFilters({ priceChange5mPct: -50, volume5mUsd: 5_000 }).kind).toBe('reject_incomplete');
    expect(evaluateRecoveryV0DipFilters({ observedPriceUsd: 1, volume5mUsd: 5_000 }).kind).toBe('reject_incomplete');
    expect(evaluateRecoveryV0DipFilters({ observedPriceUsd: 1, priceChange5mPct: -50 }).kind).toBe('reject_incomplete');
  });

  it('fails closed when a supplied dip V/L contradicts raw volume and liquidity', () => {
    expect(
      evaluateRecoveryV0DipFilters({
        observedPriceUsd: 1,
        priceChange5mPct: -50,
        volume5mUsd: 5_000,
        liquidityUsd: 10_000,
        volumeToLiquidity5m: 1.5,
      }).kind,
    ).toBe('reject_invalid');
  });

  it('computes confirmation V/L from raw volume and liquidity and rejects disagreement', () => {
    expect(
      resolveVolumeToLiquidity5m({
        volume5mUsd: 15_000,
        liquidityUsd: 10_000,
      }),
    ).toEqual({ kind: 'computed', value: 1.5 });
    expect(
      resolveVolumeToLiquidity5m({
        volume5mUsd: 15_000,
        liquidityUsd: 10_000,
        volumeToLiquidity5m: 2,
      }).kind,
    ).toBe('conflict');
  });

  it('confirms recovery only on a later same-pair higher price with confirmation liquidity and V/L', () => {
    const withinWindow = {
      dipPairAddress: FIXTURE_PAIR,
      dipPriceUsd: 1,
      dipObservedAt: FIXTURE_DIP_AT,
      watchStartedAt: FIXTURE_WATCH_AT,
      observationPairAddress: FIXTURE_PAIR,
      observationCollectedAt: '2026-08-19T11:01:00.000Z',
    };
    expect(
      evaluateRecoveryConfirmation({
        ...withinWindow,
        observationPriceUsd: 1.01,
        observationLiquidityUsd: 10_000,
        observationVolume5mUsd: 10_000,
      }).kind,
    ).toBe('confirmed');
    expect(
      evaluateRecoveryConfirmation({
        ...withinWindow,
        observationPriceUsd: 1,
        observationLiquidityUsd: 10_000,
        observationVolume5mUsd: 15_000,
      }).kind,
    ).toBe('not_yet');
    expect(
      evaluateRecoveryConfirmation({
        ...withinWindow,
        observationPriceUsd: 1.2,
        observationLiquidityUsd: 9_999.99,
        observationVolume5mUsd: 20_000,
      }).kind,
    ).toBe('not_yet');
    expect(
      evaluateRecoveryConfirmation({
        ...withinWindow,
        observationPriceUsd: 1.2,
        observationLiquidityUsd: 10_000,
        observationVolume5mUsd: 30_000,
      }).kind,
    ).toBe('not_yet');
    expect(
      evaluateRecoveryConfirmation({
        ...withinWindow,
        observationPriceUsd: 1.2,
        observationCollectedAt: FIXTURE_DIP_AT,
        observationLiquidityUsd: 10_000,
        observationVolume5mUsd: 15_000,
      }).kind,
    ).toBe('invalid');
    expect(
      evaluateRecoveryConfirmation({
        ...withinWindow,
        observationPairAddress: 'So11111111111111111111111111111111111111112',
        observationPriceUsd: 1.2,
        observationLiquidityUsd: 10_000,
        observationVolume5mUsd: 15_000,
      }).kind,
    ).toBe('invalid');
    expect(
      evaluateRecoveryConfirmation({
        ...withinWindow,
        observationPriceUsd: 1.2,
        observationLiquidityUsd: 10_000,
        observationVolume5mUsd: 15_000,
        observationVolumeToLiquidity5m: 3,
      }).kind,
    ).toBe('invalid');
    expect(
      evaluateRecoveryConfirmation({
        ...withinWindow,
        observationPriceUsd: 1.2,
      }).kind,
    ).toBe('incomplete');
    expect(
      evaluateRecoveryConfirmation({
        ...withinWindow,
        observationPriceUsd: 1.2,
        observationCollectedAt: '2026-08-19T13:00:01.999Z',
        observationLiquidityUsd: 10_000,
        observationVolume5mUsd: 15_000,
      }).kind,
    ).toBe('confirmed');
    expect(
      evaluateRecoveryConfirmation({
        ...withinWindow,
        observationPriceUsd: 1.2,
        observationCollectedAt: FIXTURE_TTL_ELIGIBLE_AT,
        observationLiquidityUsd: 10_000,
        observationVolume5mUsd: 15_000,
      }).kind,
    ).toBe('invalid');
    expect(
      evaluateRecoveryConfirmation({
        ...withinWindow,
        observationPriceUsd: 1.2,
        observationCollectedAt: '2026-08-19T13:00:02.001Z',
        observationLiquidityUsd: 10_000,
        observationVolume5mUsd: 15_000,
      }).kind,
    ).toBe('invalid');
  });
});
