import { describe, expect, it } from 'vitest';
import { selectedEconomicSlice } from '../src/ml/economic.js';
import { isResearchSelected } from '../src/ml/metrics.js';
import type { MlDecisionSample, PredictedSample } from '../src/ml/types.js';
import { ML_T0, mlSnapshot, optimizationMint } from './ml-fixtures.js';
import { assignSampleIdentity } from '../src/ml/identity.js';

function labeled(tokenMint: string, netBase: number, netStress: number): PredictedSample {
  const snapshot = mlSnapshot(tokenMint, ML_T0, 100);
  const sample: MlDecisionSample = assignSampleIdentity({
    tokenMint,
    pairAddress: snapshot.pairAddress,
    collectedAt: snapshot.collectedAt,
    collectedAtMs: Date.parse(snapshot.collectedAt),
    entryPriceUsd: 100,
    rawFeatures: [],
    datasetLabel: {
      state: netBase > 0 ? 'POSITIVE' : 'NON_POSITIVE',
      label: netBase > 0 ? 1 : 0,
      censorReason: null,
      completedAt: snapshot.collectedAt,
      completedAtMs: Date.parse(snapshot.collectedAt),
      exitReason: 'take_profit_threshold',
      grossExitReferenceUsd: 120,
      observedExitPriceUsd: 120,
      grossPnlUsd: netBase + 1,
      netBasePnlUsd: netBase,
      netStressPnlUsd: netStress,
      netLowPnlUsd: netBase,
      holdingDurationMs: 1000,
      quantityTokens: 1,
    },
  });
  return {
    sample,
    foldOutcome: sample.datasetLabel,
    probability: 0.7,
    nullProbability: 0.5,
    selected: isResearchSelected(0.7),
    novelToken: false,
  };
}

describe('ml economic diagnostics', () => {
  it('reports BASE/STRESS selected-slice expectancy from the same x11 path', () => {
    const slice = selectedEconomicSlice([
      labeled(optimizationMint(1), 2, 1),
      labeled(optimizationMint(2), -1, -2),
    ]);
    expect(slice.selectedSamples).toBe(2);
    expect(slice.completed).toBe(2);
    expect(slice.netBase?.expectancyUsd).toBe(0.5);
    expect(slice.netStress?.expectancyUsd).toBe(-0.5);
  });
});
