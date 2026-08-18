import { describe, expect, it } from 'vitest';
import { runMlCandidate } from '../src/ml/candidate.js';
import { runPurgedWalkForward } from '../src/ml/walk-forward.js';
import { O17_END, O17_START } from './optimization-fixtures.js';
import { makeMlDataset, mlSnapshot, optimizationMint } from './ml-fixtures.js';

describe('ml candidate', () => {
  it('does not train a candidate when OOS is insufficient', () => {
    const dataset = makeMlDataset([
      mlSnapshot(optimizationMint(0), O17_START, 100),
      mlSnapshot(optimizationMint(0), O17_END, 101),
    ]);
    const run = runPurgedWalkForward(dataset);
    expect(run.candidateTrainingInvoked).toBe(false);
    const candidate = runMlCandidate(dataset);
    expect(candidate.promotionStatus).toBe('NO_MODEL_PROMOTION_INSUFFICIENT_DATA');
    expect(candidate.candidateTrainingInvoked).toBe(false);
    expect(candidate.candidate).toBeNull();
  });
});
