import { describe, expect, it } from 'vitest';
import { runMlCandidate } from '../src/ml/candidate.js';
import { runPurgedWalkForward } from '../src/ml/walk-forward.js';
import { eligibleWalkForwardSnapshots, makeMlDataset } from './ml-fixtures.js';

describe('ml synthetic eligibility', () => {
  it(
    'reaches ELIGIBLE_FOR_FORWARD_PAPER_MODEL_VALIDATION on a deterministic synthetic set without loosening gates',
    { timeout: 120_000 },
    () => {
      const dataset = makeMlDataset(eligibleWalkForwardSnapshots());
      const run = runPurgedWalkForward(dataset);
      expect(run.candidateTrainingInvoked).toBe(false);
      expect(run.candidate).toBeNull();
      expect(run.integrity.status).toBe('PASS');
      expect(run.promotionStatus).toBe('ELIGIBLE_FOR_FORWARD_PAPER_MODEL_VALIDATION');
      expect(run.aggregateSelectedEconomics.completed).toBeGreaterThanOrEqual(40);
      expect(run.aggregateSelectedEconomics.selectedOpened).toBeGreaterThanOrEqual(
        run.aggregateSelectedEconomics.completed,
      );
      for (const fold of run.folds) {
        expect(fold.evaluability.evaluable).toBe(true);
        expect(fold.logistic?.converged).toBe(true);
        expect(fold.selectedEconomics.completed).toBeGreaterThanOrEqual(5);
        expect((fold.evaluability.trainCensoringBps ?? 10_000) <= 3500).toBe(true);
        expect((fold.evaluability.testCensoringBps ?? 10_000) <= 3500).toBe(true);
      }
      const candidate = runMlCandidate(dataset);
      expect(candidate.candidateTrainingInvoked).toBe(true);
      expect(candidate.candidate).not.toBeNull();
      expect(candidate.candidate?.trainingCutoffAt).toBe(dataset.lastSnapshotAt);
      expect(candidate.candidate?.threshold).toBe(0.65);
    },
  );
});
