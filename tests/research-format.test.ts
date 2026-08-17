import { describe, expect, it } from 'vitest';
import {
  RESEARCH_DEFINITION_FINGERPRINT,
  assertNoExtraResearchArguments,
  fingerprintResearchCandidateRun,
  fingerprintResearchDefinition,
  formatResearchCatalogLines,
  formatResearchCompareLines,
  mutateCanonicalResearchDefinition,
  parseResearchTradesArgv,
  requireResearchCandidateId,
} from '../src/research/index.js';
import { buildResearchCompareReport } from '../src/research/report.js';
import { allEntrySnapshot, makeResearchDataset } from './research-fixtures.js';

describe('r125 definition fingerprint', () => {
  it('derives a stable 64-hex definition fingerprint and changes on semantic mutation', () => {
    expect(RESEARCH_DEFINITION_FINGERPRINT).toBe(
      '61f5a9d091ce9214e440dddf029f81bb881a907f4cd9193e04ecd3238c20a83a',
    );
    expect(fingerprintResearchDefinition()).toBe(RESEARCH_DEFINITION_FINGERPRINT);
    expect(
      fingerprintResearchDefinition(mutateCanonicalResearchDefinition((definition) => {
        definition.researchSpecVersion = 'r125_v2';
      })),
    ).not.toBe(RESEARCH_DEFINITION_FINGERPRINT);
  });

  it('changes the candidate run fingerprint when the candidate or dataset changes', () => {
    const dataset = makeResearchDataset([allEntrySnapshot()]);
    const report = buildResearchCompareReport(dataset);
    const first = report.candidates[0];
    const second = report.candidates[1];
    if (first === undefined || second === undefined) {
      throw new Error('expected two candidate reports');
    }
    expect(first.candidateRunFingerprint).not.toBe(second.candidateRunFingerprint);
    expect(
      fingerprintResearchCandidateRun({
        researchDefinitionFingerprint: first.researchDefinitionFingerprint,
        researchDatasetFingerprint: first.researchDatasetFingerprint,
        candidateDefinitionFingerprint: first.candidate.candidateDefinitionFingerprint,
        completedTradeIdentities: first.completedTrades.map((trade) => trade.researchTradeIdentity),
        unresolvedRecords: first.unresolvedPositions.map((position) => ({
          researchPositionIdentity: position.researchPositionIdentity,
          unresolvedReason: position.unresolvedReason,
          lastExactPairMarketIdentity: position.lastExactPairMarketIdentity,
          lastExactPairExitReason: position.lastExactPairExitReason,
        })),
        decisions: first.decisions,
        lifecycle: {
          positionsOpened: first.lifecycle.positionsOpened,
          completedPositions: first.lifecycle.completedPositions,
          unresolvedPositions: first.lifecycle.unresolvedPositions,
        },
      }),
    ).toBe(first.candidateRunFingerprint);
  });
});

describe('research CLI args', () => {
  it('rejects extra compare arguments and unknown trades candidates', () => {
    const rejected = [
      '--optimize',
      '--only-winners',
      '--token',
      '--start-date',
      '--end-date',
      '--exclude-token',
      '--candidate-threshold',
      '--minimum-return',
      '--best-period',
      '--pair',
    ];
    for (const flag of rejected) {
      expect(() => {
        assertNoExtraResearchArguments(['node', 'run-compare.ts', flag], 'research:compare');
      }).toThrow(/Unexpected extra arguments/);
    }
    expect(() => {
      parseResearchTradesArgv(['node', 'run-trades.ts']);
    }).toThrow(/Missing candidate id/);
    expect(() => {
      parseResearchTradesArgv(['node', 'run-trades.ts', 's07_baseline', 'extra']);
    }).toThrow(/Unexpected extra arguments/);
    expect(() => {
      parseResearchTradesArgv(['node', 'run-trades.ts', 'not_a_candidate']);
    }).toThrow(/Unknown research candidate/);
    expect(requireResearchCandidateId('s07_baseline')).toBe('s07_baseline');
  });
});

describe('research formatting', () => {
  it('prints catalog without performance and compare without ranking language', () => {
    const catalog = formatResearchCatalogLines().join('\n');
    expect(catalog).toContain('FIXED CANDIDATE CATALOG');
    expect(catalog).toContain('s07_baseline');
    expect(catalog).toContain('quality_control_v1');
    expect(catalog).toContain('time_series_momentum_v1');
    expect(catalog).toContain('flow_confirmed_momentum_v1');
    expect(catalog).toContain('runner_friendly_momentum_v1');
    expect(catalog).not.toMatch(/GROSS paper PnL|Win rate|profit factor/i);
    expect(catalog).toContain('Checkpoint: 12.5');

    const compare = formatResearchCompareLines(
      buildResearchCompareReport(makeResearchDataset([allEntrySnapshot()])),
    ).join('\n');
    expect(compare.startsWith('STRATEGY RESEARCH LAB\nHISTORICAL GROSS PAPER REFERENCE RESULTS\nNOT LIVE / NOT NET / NOT OPTIMIZED')).toBe(
      true,
    );
    expect(compare).toContain('rawMarketSnapshotCount');
    expect(compare).toContain('runtimeExitReferencedSnapshotCountExcluded');
    expect(compare).toContain('researchMarketSnapshotCount');
    expect(compare).toContain('Unresolved positions at dataset end');
    expect(compare).toContain('No candidate is declared a winner');
    expect(compare).toContain('canonical candidateId order, not ranked by PnL');
    expect(compare).toContain('x11 currently closes the ENTIRE simulated position at +20%');
    expect(compare).not.toMatch(
      /Best strategy|Rank #1|Go live|edge proven|Most profitable|Recommended strategy|validated strategy|safe to trade|expected profit/i,
    );
    expect(compare).toContain('r125 does not apply a numeric sample-adequacy threshold');
    expect(compare).not.toMatch(/limited historical sample/);
    expect(compare).toContain('Checkpoint: 12.5');
    expect(compare).toContain('Strategy benchmark lab: available');
  });
});
