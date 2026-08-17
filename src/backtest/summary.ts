import { BacktestError, type BacktestEvent, type BacktestSummary } from './types.js';

export function summarizeBacktestEvents(events: readonly BacktestEvent[]): BacktestSummary {
  let entryCandidateCount = 0;
  let noEntryCount = 0;
  let insufficientDataCount = 0;
  let resolvedEntryCandidateCount = 0;
  let unresolvedEntryCandidateCount = 0;
  let positiveForwardOutcomeCount = 0;
  let nonPositiveForwardOutcomeCount = 0;
  let returnSum = 0;

  for (const event of events) {
    if (event.strategyDecision === 'entry_candidate') {
      entryCandidateCount += 1;
      if (event.outcome === null) {
        throw new BacktestError('ENTRY_CANDIDATE events must carry an outcome object.');
      }
      if (event.outcome.status === 'resolved') {
        resolvedEntryCandidateCount += 1;
        returnSum += event.outcome.grossForwardReturnPct;
        if (event.outcome.grossForwardReturnPct > 0) {
          positiveForwardOutcomeCount += 1;
        } else {
          nonPositiveForwardOutcomeCount += 1;
        }
      } else {
        unresolvedEntryCandidateCount += 1;
      }
    } else if (event.strategyDecision === 'no_entry') {
      noEntryCount += 1;
    } else {
      insufficientDataCount += 1;
    }
  }

  return {
    evaluationCount: events.length,
    entryCandidateCount,
    noEntryCount,
    insufficientDataCount,
    resolvedEntryCandidateCount,
    unresolvedEntryCandidateCount,
    positiveForwardOutcomeCount,
    nonPositiveForwardOutcomeCount,
    averageGrossForwardReturnPct:
      resolvedEntryCandidateCount === 0 ? null : returnSum / resolvedEntryCandidateCount,
  };
}
