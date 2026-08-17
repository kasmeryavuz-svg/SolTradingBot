import { describe, expect, it, afterEach } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import {
  createSqlitePersistenceRepository,
  PersistenceError,
  SqlitePersistenceRepository,
} from '../src/persistence/index.js';
import { FINDING_CODES, TOKEN_2022_PROGRAM_ID } from '../src/risk/constants.js';
import type { RiskFinding, TokenRiskReport } from '../src/risk/types.js';
import { sampleReport } from './risk-fixtures.js';

const openRepos: SqlitePersistenceRepository[] = [];

function openMemoryRepo(): SqlitePersistenceRepository {
  const repository = createSqlitePersistenceRepository({
    path: ':memory:',
    busyTimeoutMs: 1000,
  });
  repository.initialize();
  openRepos.push(repository);
  return repository;
}

afterEach(() => {
  while (openRepos.length > 0) {
    openRepos.pop()?.close();
  }
});

function highFinding(): RiskFinding {
  return {
    code: FINDING_CODES.MINT_AUTHORITY_ACTIVE,
    category: 'authority',
    severity: 'high',
    confidence: 'high',
    title: 'Mint authority is active',
    description: 'There is currently a mint authority capable of minting additional supply.',
  };
}

function mediumFinding(): RiskFinding {
  return {
    code: FINDING_CODES.TRANSFER_FEE_CONFIGURED,
    category: 'token_extension',
    severity: 'medium',
    confidence: 'high',
    title: 'Transfer fee is configured',
    description: 'A TransferFeeConfig extension is present with configured or scheduled fee schedules.',
  };
}

function expectUnchangedRejection(report: TokenRiskReport): void {
  const repository = openMemoryRepo();
  repository.recordRiskReport(sampleReport());
  const beforeToken = repository.getToken(WRAPPED_SOL_MINT);
  const beforeCounts = repository.getTableCounts();

  expect(() => {
    repository.recordRiskReport(report);
  }).toThrow(PersistenceError);

  expect(repository.getToken(WRAPPED_SOL_MINT)?.firstObservedAt).toBe(beforeToken?.firstObservedAt);
  expect(repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt).toBe(beforeToken?.lastObservedAt);
  expect(repository.getTableCounts()).toEqual(beforeCounts);
}

describe('risk report persistence invariants', () => {
  it('rejects highestFindingSeverity=none when findings contain HIGH', () => {
    expectUnchangedRejection(sampleReport({
      findings: [highFinding()],
      highestFindingSeverity: 'none',
    }));
  });

  it('rejects highestFindingSeverity=critical when the highest finding is MEDIUM', () => {
    expectUnchangedRejection(sampleReport({
      findings: [mediumFinding()],
      highestFindingSeverity: 'critical',
    }));
  });

  it('rejects dataCompleteness=complete when an optional check failed', () => {
    expectUnchangedRejection(sampleReport({
      supplyRaw: null,
      supplyContextSlot: null,
      concentration: null,
      largestTokenAccounts: [],
      dataCompleteness: 'complete',
      checks: [
        { check: 'mint_account', ok: true, contextSlot: 100, error: null },
        { check: 'supply', ok: false, contextSlot: null, error: 'unavailable' },
        { check: 'largest_accounts', ok: true, contextSlot: 102, error: null },
      ],
    }));
  });

  it('rejects a TokenRiskReport whose mint-account check failed', () => {
    expectUnchangedRejection(sampleReport({
      dataCompleteness: 'partial',
      checks: [
        { check: 'mint_account', ok: false, contextSlot: null, error: 'missing' },
        { check: 'supply', ok: true, contextSlot: 101, error: null },
        { check: 'largest_accounts', ok: true, contextSlot: 102, error: null },
      ],
    }));
  });

  it('rejects observedAccountsCount that differs from largestTokenAccounts.length', () => {
    expectUnchangedRejection(sampleReport({
      concentration: {
        top1Bps: 1000,
        top5Bps: 1000,
        top10Bps: 1000,
        top20Bps: 1000,
        observedAccountsCount: 2,
      },
    }));
  });

  it('rejects duplicate finding codes', () => {
    expectUnchangedRejection(sampleReport({
      findings: [highFinding(), highFinding()],
      highestFindingSeverity: 'high',
    }));
  });

  it('rejects duplicate token-account addresses', () => {
    expectUnchangedRejection(sampleReport({
      largestTokenAccounts: [
        { rank: 1, tokenAccount: WRAPPED_SOL_MINT, amountRaw: '1000', shareBps: 1000 },
        { rank: 2, tokenAccount: WRAPPED_SOL_MINT, amountRaw: '500', shareBps: 500 },
      ],
      concentration: {
        top1Bps: 1000,
        top5Bps: 1500,
        top10Bps: 1500,
        top20Bps: 1500,
        observedAccountsCount: 2,
      },
    }));
  });

  it('rejects non-contiguous token-account ranks', () => {
    expectUnchangedRejection(sampleReport({
      largestTokenAccounts: [
        { rank: 1, tokenAccount: WRAPPED_SOL_MINT, amountRaw: '1000', shareBps: 1000 },
        { rank: 3, tokenAccount: USDC_MINT, amountRaw: '500', shareBps: 500 },
      ],
      concentration: {
        top1Bps: 1000,
        top5Bps: 1500,
        top10Bps: 1500,
        top20Bps: 1500,
        observedAccountsCount: 2,
      },
    }));
  });

  it('rejects a top-account rank outside 1..20', () => {
    expectUnchangedRejection(sampleReport({
      largestTokenAccounts: [
        { rank: 21, tokenAccount: WRAPPED_SOL_MINT, amountRaw: '1000', shareBps: 1000 },
      ],
    }));
  });

  it('rejects shareBps outside 0..10000', () => {
    expectUnchangedRejection(sampleReport({
      largestTokenAccounts: [
        { rank: 1, tokenAccount: WRAPPED_SOL_MINT, amountRaw: '1000', shareBps: 10001 },
      ],
    }));
  });

  it('rejects concentration when required input data was unavailable', () => {
    expectUnchangedRejection(sampleReport({
      supplyRaw: null,
      supplyContextSlot: null,
      dataCompleteness: 'partial',
      checks: [
        { check: 'mint_account', ok: true, contextSlot: 100, error: null },
        { check: 'supply', ok: false, contextSlot: null, error: 'unavailable' },
        { check: 'largest_accounts', ok: true, contextSlot: 102, error: null },
      ],
    }));
  });

  it('rejects tokenProgram/programOwner mismatches', () => {
    expectUnchangedRejection(sampleReport({
      tokenProgram: 'spl_token',
      programOwner: TOKEN_2022_PROGRAM_ID,
    }));
    expectUnchangedRejection(sampleReport({
      tokenProgram: 'token_2022',
      programOwner: sampleReport().programOwner,
    }));
  });

  it('rejects unsafe context slots', () => {
    expectUnchangedRejection(sampleReport({ mintContextSlot: -1 }));
    expectUnchangedRejection(sampleReport({ supplyContextSlot: 1.5 }));
  });

  it('rejects invalid raw integer strings', () => {
    expectUnchangedRejection(sampleReport({ supplyRaw: '12.3' }));
    expectUnchangedRejection(sampleReport({ supplyRaw: '1e6' }));
  });

  it('rejects NaN and Infinity numeric fields', () => {
    expectUnchangedRejection(sampleReport({ mintContextSlot: Number.NaN }));
    expectUnchangedRejection(sampleReport({
      concentration: {
        top1Bps: Number.POSITIVE_INFINITY,
        top5Bps: 1000,
        top10Bps: 1000,
        top20Bps: 1000,
        observedAccountsCount: 1,
      },
    }));
  });
});
