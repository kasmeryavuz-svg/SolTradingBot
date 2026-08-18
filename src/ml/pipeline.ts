import { executeLoadMlDataset } from './dataset.js';
import { runMlCandidate } from './candidate.js';
import { runPurgedWalkForward } from './walk-forward.js';
import type { MlRuntimeConfig } from './env.js';
import type { MlWalkForwardReport } from './types.js';

export function executeMlRun(config: MlRuntimeConfig): MlWalkForwardReport {
  return runPurgedWalkForward(executeLoadMlDataset(config));
}

export function executeMlFolds(config: MlRuntimeConfig): MlWalkForwardReport {
  return executeMlRun(config);
}

export function executeMlCandidate(config: MlRuntimeConfig): MlWalkForwardReport {
  return runMlCandidate(executeLoadMlDataset(config));
}
