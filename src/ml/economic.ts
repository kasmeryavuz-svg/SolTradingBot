import { allScenarioMetrics } from '../optimization/metrics.js';
import { optimizationMarketTimeIdentity } from '../optimization/identity.js';
import { POSITION_ENTRY_NOTIONAL_USD } from '../position/constants.js';
import type { OptimizationCompletedTrade } from '../optimization/types.js';
import { censoringBps } from './censoring.js';
import { MlError } from './errors.js';
import { labeledOutcome } from './folds.js';
import type { MlLabelOutcome, PredictedSample, SelectedEconomicSlice } from './types.js';

export function outcomeToCompletedTrade(
  sampleIdentity: string,
  tokenMint: string,
  pairAddress: string,
  collectedAt: string,
  entryPriceUsd: number,
  label: MlLabelOutcome,
): OptimizationCompletedTrade {
  if (
    label.state === 'CENSORED' ||
    label.completedAt === null ||
    label.netBasePnlUsd === null ||
    label.grossPnlUsd === null ||
    label.netStressPnlUsd === null ||
    label.netLowPnlUsd === null ||
    label.grossExitReferenceUsd === null ||
    label.quantityTokens === null ||
    label.holdingDurationMs === null ||
    label.exitReason === null ||
    label.observedExitPriceUsd === null
  ) {
    throw new MlError('Completed-trade conversion requires a labeled non-censored sample.');
  }
  return {
    tokenMint,
    pairAddress,
    positionIdentity: sampleIdentity,
    entryMarketIdentity: optimizationMarketTimeIdentity({
      tokenMint,
      pairAddress,
      collectedAt,
    }),
    openedAt: collectedAt,
    exitedAt: label.completedAt,
    holdingDurationMs: label.holdingDurationMs,
    entryReferencePriceUsd: entryPriceUsd,
    entryReferenceNotionalUsd: POSITION_ENTRY_NOTIONAL_USD,
    originalQuantityTokens: label.quantityTokens,
    legs: [
      {
        reason: label.exitReason,
        exitedAt: label.completedAt,
        exitMarketIdentity: optimizationMarketTimeIdentity({
          tokenMint,
          pairAddress,
          collectedAt: label.completedAt,
        }),
        quantityTokens: label.quantityTokens,
        grossExitReferenceUsd: label.grossExitReferenceUsd,
        observedPriceUsd: label.observedExitPriceUsd,
      },
    ],
    grossPnlUsd: label.grossPnlUsd,
    netLowPnlUsd: label.netLowPnlUsd,
    netBasePnlUsd: label.netBasePnlUsd,
    netStressPnlUsd: label.netStressPnlUsd,
    outcomeGross: label.grossPnlUsd > 0 ? 'win' : label.grossPnlUsd < 0 ? 'loss' : 'breakeven',
    outcomeBase: label.netBasePnlUsd > 0 ? 'win' : label.netBasePnlUsd < 0 ? 'loss' : 'breakeven',
  };
}

export type SelectedUniverseCounts = {
  testDecisionSamples: number;
  testFeatureEligibleSamples: number;
  testLabeledSamples: number;
  testCensoredSamples: number;
};

export function selectedEconomicSlice(
  predictions: readonly PredictedSample[],
  foldPositiveExpectancy?: readonly (number | null)[],
  universe?: SelectedUniverseCounts,
): SelectedEconomicSlice {
  const testDecisionSamples = universe?.testDecisionSamples ?? predictions.length;
  const testFeatureEligibleSamples = universe?.testFeatureEligibleSamples ?? predictions.length;
  const testLabeledSamples =
    universe?.testLabeledSamples ?? predictions.filter((item) => labeledOutcome(item.foldOutcome)).length;
  const testCensoredSamples = universe?.testCensoredSamples ?? testDecisionSamples - testLabeledSamples;
  const selected = predictions.filter((item) => item.selected);
  const selectedIdentities = selected.map((item) => item.sample.sampleIdentity);
  const completedSelected = selected.filter((item) => labeledOutcome(item.foldOutcome));
  const censoredSelected = selected.filter((item) => !labeledOutcome(item.foldOutcome));
  const trades = completedSelected.map((item) =>
    outcomeToCompletedTrade(
      item.sample.sampleIdentity,
      item.sample.tokenMint,
      item.sample.pairAddress,
      item.sample.collectedAt,
      item.sample.entryPriceUsd,
      item.foldOutcome,
    ),
  );
  const scenarios = trades.length === 0 ? null : allScenarioMetrics(trades);
  return {
    testDecisionSamples,
    testFeatureEligibleSamples,
    testLabeledSamples,
    testCensoredSamples,
    selectedSamples: selected.length,
    selectedOpened: selected.length,
    completed: completedSelected.length,
    censored: censoredSelected.length,
    selectedCensoringBps: censoringBps(censoredSelected.length, selected.length),
    selectedIdentities,
    completedIdentities: completedSelected.map((item) => item.sample.sampleIdentity),
    censoredIdentities: censoredSelected.map((item) => item.sample.sampleIdentity),
    netBase: scenarios?.netBase ?? null,
    netStress: scenarios?.netStress ?? null,
    positiveFoldCount:
      foldPositiveExpectancy === undefined
        ? null
        : foldPositiveExpectancy.filter((value) => value !== null && value > 0).length,
  };
}

export function emptySelectedEconomicSlice(): SelectedEconomicSlice {
  return {
    testDecisionSamples: 0,
    testFeatureEligibleSamples: 0,
    testLabeledSamples: 0,
    testCensoredSamples: 0,
    selectedSamples: 0,
    selectedOpened: 0,
    completed: 0,
    censored: 0,
    selectedCensoringBps: null,
    selectedIdentities: [],
    completedIdentities: [],
    censoredIdentities: [],
    netBase: null,
    netStress: null,
    positiveFoldCount: null,
  };
}
