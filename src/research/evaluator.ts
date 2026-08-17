import type { FeatureVector } from '../features/types.js';
import { evaluateRegisteredCandidate } from './catalog.js';
import type { ResearchCandidateEvaluation, ResearchCandidateId } from './types.js';

export function evaluateResearchCandidate(
  candidateId: ResearchCandidateId,
  vector: FeatureVector,
): ResearchCandidateEvaluation {
  return evaluateRegisteredCandidate(candidateId, vector);
}
