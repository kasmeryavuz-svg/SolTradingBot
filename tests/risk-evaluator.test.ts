import { describe, expect, it } from 'vitest';
import { USDC_MINT } from '../src/config/index.js';
import {
  CONCENTRATION_ELEVATED_TOP1_BPS,
  CONCENTRATION_ELEVATED_TOP5_BPS,
  CONCENTRATION_VERY_HIGH_TOP1_BPS,
  FINDING_CODES,
  SYSTEM_PROGRAM_ID,
} from '../src/risk/constants.js';
import { computeConcentration, normalizeLargestAccounts } from '../src/risk/concentration.js';
import { evaluateTokenRisk, highestFindingSeverity } from '../src/risk/evaluator.js';
import { parseTokenExtensions } from '../src/risk/extensions.js';
import type { TokenExtensionObservation, TokenRiskFacts } from '../src/risk/types.js';
import { AUTHORITY, HOOK_PROGRAM } from './risk-fixtures.js';

function facts(overrides: Partial<TokenRiskFacts> = {}): TokenRiskFacts {
  return {
    mintAuthority: null,
    freezeAuthority: null,
    extensions: [],
    concentration: null,
    concentrationUnavailableReason: null,
    ...overrides,
  };
}

function codes(result: ReturnType<typeof evaluateTokenRisk>): string[] {
  return result.map((finding) => finding.code);
}

describe('risk evaluator authorities', () => {
  it('emits HIGH mint-authority and freeze-authority findings when they are active', () => {
    const findings = evaluateTokenRisk(facts({
      mintAuthority: AUTHORITY,
      freezeAuthority: AUTHORITY,
    }));

    expect(codes(findings)).toEqual([
      FINDING_CODES.FREEZE_AUTHORITY_ACTIVE,
      FINDING_CODES.MINT_AUTHORITY_ACTIVE,
    ]);
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.confidence).toBe('high');
  });

  it('does not emit authority findings when both authorities are null', () => {
    expect(evaluateTokenRisk(facts()).filter((finding) => finding.category === 'authority')).toEqual([]);
  });
});

describe('risk evaluator Token-2022 extensions', () => {
  it('emits CRITICAL for an active permanent delegate', () => {
    const extensions = parseTokenExtensions([
      { extension: 'permanentDelegate', state: { delegate: AUTHORITY } },
    ]);
    const findings = evaluateTokenRisk(facts({ extensions }));
    expect(codes(findings)).toContain(FINDING_CODES.PERMANENT_DELEGATE_ACTIVE);
    expect(findings.find((finding) => finding.code === FINDING_CODES.PERMANENT_DELEGATE_ACTIVE)?.severity).toBe(
      'critical',
    );
  });

  it('does not claim an active permanent delegate when the address cannot be parsed', () => {
    const missing = parseTokenExtensions([{ extension: 'permanentDelegate', state: {} }]);
    const invalid = parseTokenExtensions([
      { extension: 'permanentDelegate', state: { delegate: 'not-a-solana-address' } },
    ]);
    const empty = parseTokenExtensions([
      { extension: 'permanentDelegate', state: { delegate: '' } },
    ]);

    expect(codes(evaluateTokenRisk(facts({ extensions: missing })))).not.toContain(
      FINDING_CODES.PERMANENT_DELEGATE_ACTIVE,
    );
    expect(codes(evaluateTokenRisk(facts({ extensions: invalid })))).not.toContain(
      FINDING_CODES.PERMANENT_DELEGATE_ACTIVE,
    );
    expect(codes(evaluateTokenRisk(facts({ extensions: empty })))).not.toContain(
      FINDING_CODES.PERMANENT_DELEGATE_ACTIVE,
    );
  });

  it('emits CRITICAL for NonTransferable', () => {
    const extensions = parseTokenExtensions([{ extension: 'nonTransferable' }]);
    expect(codes(evaluateTokenRisk(facts({ extensions })))).toContain(FINDING_CODES.NON_TRANSFERABLE_TOKEN);
  });

  it('emits HIGH for an active transfer hook and not when the program id is missing', () => {
    const active = parseTokenExtensions([
      { extension: 'transferHook', state: { programId: HOOK_PROGRAM } },
    ]);
    const inactive = parseTokenExtensions([{ extension: 'transferHook', state: { programId: null } }]);

    expect(codes(evaluateTokenRisk(facts({ extensions: active })))).toContain(
      FINDING_CODES.TRANSFER_HOOK_ACTIVE,
    );
    expect(codes(evaluateTokenRisk(facts({ extensions: inactive })))).not.toContain(
      FINDING_CODES.TRANSFER_HOOK_ACTIVE,
    );

    const malformed = parseTokenExtensions([
      { extension: 'transferHook', state: { programId: 'not-a-program' } },
    ]);
    const systemProgram = parseTokenExtensions([
      { extension: 'transferHook', state: { programId: SYSTEM_PROGRAM_ID } },
    ]);
    expect(codes(evaluateTokenRisk(facts({ extensions: malformed })))).not.toContain(
      FINDING_CODES.TRANSFER_HOOK_ACTIVE,
    );
    expect(codes(evaluateTokenRisk(facts({ extensions: systemProgram })))).not.toContain(
      FINDING_CODES.TRANSFER_HOOK_ACTIVE,
    );
  });

  it('emits HIGH when DefaultAccountState is Frozen', () => {
    const extensions = parseTokenExtensions([
      { extension: 'defaultAccountState', state: { accountState: 'frozen' } },
    ]);
    expect(codes(evaluateTokenRisk(facts({ extensions })))).toContain(
      FINDING_CODES.DEFAULT_ACCOUNT_STATE_FROZEN,
    );

    const initialized = parseTokenExtensions([
      { extension: 'defaultAccountState', state: { accountState: 'initialized' } },
    ]);
    expect(codes(evaluateTokenRisk(facts({ extensions: initialized })))).not.toContain(
      FINDING_CODES.DEFAULT_ACCOUNT_STATE_FROZEN,
    );
  });

  it('records older and newer transfer-fee schedules without claiming a current fee', () => {
    const newerOnly = parseTokenExtensions([
      {
        extension: 'transferFeeConfig',
        state: { newerTransferFee: { transferFeeBasisPoints: 150, maximumFee: '1000' } },
      },
    ]);
    const olderOnly = parseTokenExtensions([
      {
        extension: 'transferFeeConfig',
        state: {
          olderTransferFee: { transferFeeBasisPoints: 80, maximumFee: '500' },
          newerTransferFee: { transferFeeBasisPoints: 0, maximumFee: '0' },
        },
      },
    ]);
    const bothZero = parseTokenExtensions([
      {
        extension: 'transferFeeConfig',
        state: {
          olderTransferFee: { transferFeeBasisPoints: 0, maximumFee: '0' },
          newerTransferFee: { transferFeeBasisPoints: 0, maximumFee: '0' },
        },
      },
    ]);

    expect(newerOnly[0]?.olderTransferFeeBasisPoints).toBeNull();
    expect(newerOnly[0]?.newerTransferFeeBasisPoints).toBe(150);
    expect(olderOnly[0]?.olderTransferFeeBasisPoints).toBe(80);
    expect(olderOnly[0]?.newerTransferFeeBasisPoints).toBe(0);
    expect(olderOnly[0]?.state).toMatch(/older_bps=80/);
    expect(olderOnly[0]?.state).toMatch(/newer_bps=0/);

    const newerFinding = evaluateTokenRisk(facts({ extensions: newerOnly })).find(
      (finding) => finding.code === FINDING_CODES.TRANSFER_FEE_CONFIGURED,
    );
    const olderFinding = evaluateTokenRisk(facts({ extensions: olderOnly })).find(
      (finding) => finding.code === FINDING_CODES.TRANSFER_FEE_CONFIGURED,
    );
    expect(newerFinding?.severity).toBe('medium');
    expect(olderFinding?.description).toMatch(/configured or scheduled fee schedules/i);
    expect(newerFinding?.description).not.toMatch(/current fee|active fee|currently charged/i);
    expect(olderFinding?.description).not.toMatch(/current fee|active fee|currently charged/i);
    expect(codes(evaluateTokenRisk(facts({ extensions: bothZero })))).not.toContain(
      FINDING_CODES.TRANSFER_FEE_CONFIGURED,
    );
  });

  it('records MintCloseAuthority as informational only', () => {
    const extensions = parseTokenExtensions([
      { extension: 'mintCloseAuthority', state: { closeAuthority: AUTHORITY } },
    ]);
    const finding = evaluateTokenRisk(facts({ extensions })).find(
      (item) => item.code === FINDING_CODES.MINT_CLOSE_AUTHORITY_PRESENT,
    );
    expect(finding?.severity).toBe('info');
  });

  it('surfaces a safely parsed paused mint and pause authority', () => {
    const extensions = parseTokenExtensions([
      { extension: 'pausableConfig', state: { authority: AUTHORITY, paused: true } },
    ]);
    expect(codes(evaluateTokenRisk(facts({ extensions })))).toEqual([
      FINDING_CODES.PAUSABLE_TOKEN_PAUSED,
      FINDING_CODES.PAUSE_AUTHORITY_ACTIVE,
    ]);
  });

  it('treats an uncertain pausable payload as unclassified instead of inventing semantics', () => {
    const extensions = parseTokenExtensions([{ extension: 'pausableConfig', state: { paused: 'maybe' } }]);
    expect(codes(evaluateTokenRisk(facts({ extensions })))).toEqual([
      FINDING_CODES.UNCLASSIFIED_TOKEN_EXTENSION_PRESENT,
    ]);
  });
});

describe('risk concentration math', () => {
  const accounts = [
    { address: '11111111111111111111111111111112', amount: '4000', decimals: 6 },
    { address: '11111111111111111111111111111114', amount: '4000', decimals: 6 },
    { address: '11111111111111111111111111111113', amount: '1500', decimals: 6 },
    { address: USDC_MINT, amount: '300', decimals: 6 },
    { address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', amount: '200', decimals: 6 },
  ];

  it('orders largest accounts by raw amount then address and does not use Number precision', () => {
    const huge = '18446744073709551615';
    const normalized = normalizeLargestAccounts(
      [
        { address: USDC_MINT, amount: huge, decimals: 6 },
        { address: '11111111111111111111111111111113', amount: huge, decimals: 6 },
      ],
      '36893488147419103230',
      6,
    );

    const firstAccount = normalized.accounts[0];
    const secondAccount = normalized.accounts[1];
    expect(firstAccount).toBeDefined();
    expect(secondAccount).toBeDefined();
    expect((firstAccount?.tokenAccount ?? '') < (secondAccount?.tokenAccount ?? '')).toBe(true);
    expect(firstAccount?.amountRaw).toBe(huge);
    expect(String(Number(huge))).not.toBe(huge);
  });

  it('does not double-count duplicate token-account records', () => {
    const normalized = normalizeLargestAccounts(
      [
        { address: USDC_MINT, amount: '10', decimals: 6 },
        { address: USDC_MINT, amount: '20', decimals: 6 },
      ],
      '100',
      6,
    );
    expect(normalized.accounts).toEqual([]);
    expect(normalized.unavailableReason).toMatch(/duplicate/i);
  });

  it('computes top1/top5/top10/top20 basis points from BigInt amounts', () => {
    const normalized = normalizeLargestAccounts(accounts, '10000', 6);
    const result = computeConcentration('10000', normalized.accounts, true);
    expect(result.concentration?.top1Bps).toBe(4000);
    expect(result.concentration?.top5Bps).toBe(10000);
    expect(result.concentration?.top10Bps).toBe(10000);
    expect(result.concentration?.top20Bps).toBe(10000);
  });

  it('marks concentration unavailable for zero supply, missing supply, and failed largest accounts', () => {
    const normalized = normalizeLargestAccounts(accounts, '10000', 6);
    expect(computeConcentration('0', normalized.accounts, true).unavailableReason).toBe('supply is zero');
    expect(computeConcentration(null, normalized.accounts, true).unavailableReason).toBe('supply unavailable');
    expect(computeConcentration('10000', [], false).unavailableReason).toBe(
      'largest token accounts unavailable',
    );
  });

  it('uses min(N, observed) prefix counts when fewer than 20 token accounts exist', () => {
    const three = normalizeLargestAccounts(
      [
        { address: '11111111111111111111111111111112', amount: '4000', decimals: 6 },
        { address: '11111111111111111111111111111113', amount: '3000', decimals: 6 },
        { address: USDC_MINT, amount: '2000', decimals: 6 },
      ],
      '10000',
      6,
    );
    const result = computeConcentration('10000', three.accounts, true);
    expect(result.concentration?.observedAccountsCount).toBe(3);
    expect(result.concentration?.top1Bps).toBe(4000);
    expect(result.concentration?.top5Bps).toBe(9000);
    expect(result.concentration?.top10Bps).toBe(9000);
    expect(result.concentration?.top20Bps).toBe(9000);
  });

  it('computes basis points with integer strings beyond JS safe integer range', () => {
    const amount = '18446744073709551615';
    const supply = '184467440737095516150';
    const normalized = normalizeLargestAccounts(
      [{ address: USDC_MINT, amount, decimals: 6 }],
      supply,
      6,
    );
    expect(normalized.accounts[0]?.shareBps).toBe(1000);
    expect(String(Number(amount))).not.toBe(amount);
    const result = computeConcentration(supply, normalized.accounts, true);
    expect(result.concentration?.top1Bps).toBe(1000);
    expect(result.concentration?.top20Bps).toBe(1000);
  });

  it('rejects a largest-account dataset when any item decimals disagree with the mint', () => {
    const normalized = normalizeLargestAccounts(
      [
        { address: USDC_MINT, amount: '100', decimals: 6 },
        { address: '11111111111111111111111111111113', amount: '50', decimals: 9 },
      ],
      '10000',
      6,
    );
    expect(normalized.accounts).toEqual([]);
    expect(normalized.unavailableReason).toMatch(/decimals/i);
  });

  it('does not clamp when observed amounts exceed supply', () => {
    const normalized = normalizeLargestAccounts(
      [{ address: USDC_MINT, amount: '200', decimals: 6 }],
      '100',
      6,
    );
    const result = computeConcentration('100', normalized.accounts, true);
    expect(result.concentration).toBeNull();
    expect(result.unavailableReason).toMatch(/exceed supply/);
  });

  it('emits very-high and elevated concentration findings with LOW confidence', () => {
    expect(CONCENTRATION_VERY_HIGH_TOP1_BPS).toBe(5000);
    expect(CONCENTRATION_ELEVATED_TOP1_BPS).toBe(2000);
    expect(CONCENTRATION_ELEVATED_TOP5_BPS).toBe(5000);

    const veryHigh = evaluateTokenRisk(facts({
      concentration: { top1Bps: 5000, top5Bps: 8000, top10Bps: 8000, top20Bps: 8000, observedAccountsCount: 1 },
    }));
    const elevated = evaluateTokenRisk(facts({
      concentration: { top1Bps: 2000, top5Bps: 3000, top10Bps: 3000, top20Bps: 3000, observedAccountsCount: 2 },
    }));

    expect(veryHigh[0]?.code).toBe(FINDING_CODES.TOKEN_ACCOUNT_CONCENTRATION_VERY_HIGH);
    expect(veryHigh[0]?.severity).toBe('high');
    expect(veryHigh[0]?.confidence).toBe('low');
    expect(veryHigh[0]?.description).toMatch(/token account/i);
    expect(veryHigh[0]?.description).not.toMatch(/beneficial owner owns/i);
    expect(elevated[0]?.code).toBe(FINDING_CODES.TOKEN_ACCOUNT_CONCENTRATION_ELEVATED);
    expect(elevated[0]?.confidence).toBe('low');
    expect(elevated[0]?.description).toMatch(/largest 2 observed token account/);
    expect(elevated[0]?.description).not.toMatch(/the largest five/);
  });
});

describe('risk finding order and highest severity', () => {
  it('sorts findings by severity then code and computes highest severity', () => {
    const extensions = parseTokenExtensions([
      { extension: 'nonTransferable' },
      { extension: 'mintCloseAuthority', state: { closeAuthority: AUTHORITY } },
    ]);
    const findings = evaluateTokenRisk(facts({
      mintAuthority: AUTHORITY,
      extensions,
    }));

    expect(findings.map((finding) => finding.severity)).toEqual(['critical', 'high', 'info']);
    expect(highestFindingSeverity(findings)).toBe('critical');
    expect(highestFindingSeverity([])).toBe('none');
    expect(new Set(findings.map((finding) => finding.code)).size).toBe(findings.length);
    expect(evaluateTokenRisk(facts({
      mintAuthority: AUTHORITY,
      extensions,
    }))).toEqual(findings);
  });
});

describe('extension observations', () => {
  it('does not invent a transfer-fee finding when fee fields cannot be parsed', () => {
    const extensions: TokenExtensionObservation[] = parseTokenExtensions([
      { extension: 'transferFeeConfig', state: { newerTransferFee: { transferFeeBasisPoints: 'abc' } } },
    ]);
    expect(extensions[0]?.parsed).toBe(false);
    expect(codes(evaluateTokenRisk(facts({ extensions })))).not.toContain(
      FINDING_CODES.TRANSFER_FEE_CONFIGURED,
    );
  });

  it('records an unknown extension without inheriting another extension’s findings', () => {
    const extensions = parseTokenExtensions([
      { extension: 'confidentialTransferFeeConfig', state: { authority: AUTHORITY } },
    ]);
    const findings = evaluateTokenRisk(facts({ extensions }));
    expect(extensions[0]?.classified).toBe(false);
    expect(codes(findings)).toEqual([FINDING_CODES.UNCLASSIFIED_TOKEN_EXTENSION_PRESENT]);
    expect(codes(findings)).not.toContain(FINDING_CODES.TRANSFER_FEE_CONFIGURED);
    expect(codes(findings)).not.toContain(FINDING_CODES.MINT_AUTHORITY_ACTIVE);
    expect(codes(findings)).not.toContain(FINDING_CODES.FREEZE_AUTHORITY_ACTIVE);
  });
});
