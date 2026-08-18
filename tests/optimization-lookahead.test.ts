import { describe, expect, it } from 'vitest';
import { reconstructIndexedPointInTimeVector, buildOptimizationIndexes } from '../src/optimization/timeline.js';
import { runAnchoredWalkForward } from '../src/optimization/walk-forward.js';
import { evaluateOptimizationEntry } from '../src/optimization/entries.js';
import {
  O17_START,
  makeOptimizationDataset,
  optimizationMint,
  qualityControlOnlySnapshot,
  qualityControlWalkForwardSnapshots,
  researchRisk,
} from './optimization-fixtures.js';
import { addMs } from './exit-fixtures.js';
import { FINDING_CODES } from '../src/risk/constants.js';

describe('lookahead isolation', () => {
  it('does not change FOLD 1 training selection when S3 future prices are mutated', () => {
    const baselineSnapshots = qualityControlWalkForwardSnapshots({ s3ExitPriceUsd: 80 });
    const mutatedSnapshots = qualityControlWalkForwardSnapshots({ s3ExitPriceUsd: 10_000 });
    const baseline = runAnchoredWalkForward(makeOptimizationDataset(baselineSnapshots));
    const mutated = runAnchoredWalkForward(makeOptimizationDataset(mutatedSnapshots));
    expect(baseline.folds[0]?.selectedEntryId).toBe(mutated.folds[0]?.selectedEntryId);
    expect(baseline.folds[0]?.selectedExitId).toBe(mutated.folds[0]?.selectedExitId);
    expect(baseline.folds[0]?.entrySelection.candidateId).toBe(mutated.folds[0]?.entrySelection.candidateId);
    expect(mutated.folds[0]?.oosSelected?.gross.totalPnlUsd).not.toBe(
      baseline.folds[0]?.oosSelected?.gross.totalPnlUsd,
    );
  });

  it('ignores future risk and future market rows when reconstructing features at T', () => {
    const current = qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(1), priceUsd: 100 });
    const futureMarket = qualityControlOnlySnapshot({
      collectedAt: addMs(O17_START, 1),
      tokenMint: optimizationMint(1),
      priceUsd: 9_000,
      liquidityUsd: 9_000_000,
    });
    const nowRisk = researchRisk({ tokenMint: optimizationMint(1), scannedAt: O17_START });
    const futureDanger = researchRisk({
      tokenMint: optimizationMint(1),
      scannedAt: addMs(O17_START, 1),
      findings: [
        {
          code: FINDING_CODES.MINT_AUTHORITY_ACTIVE,
          category: 'authority',
          severity: 'critical',
          confidence: 'high',
          title: 'mint',
          description: 'after T',
        },
      ],
    });
    const withFuture = reconstructIndexedPointInTimeVector({
      snapshot: current,
      indexes: buildOptimizationIndexes({
        marketSnapshots: [current, futureMarket],
        riskReports: [nowRisk, futureDanger],
      }),
    });
    const withoutFuture = reconstructIndexedPointInTimeVector({
      snapshot: current,
      indexes: buildOptimizationIndexes({
        marketSnapshots: [current],
        riskReports: [nowRisk],
      }),
    });
    expect(withFuture.values).toEqual(withoutFuture.values);
    expect(evaluateOptimizationEntry('quality_control_v1', withFuture).decision).toBe(
      evaluateOptimizationEntry('quality_control_v1', withoutFuture).decision,
    );
  });
});
