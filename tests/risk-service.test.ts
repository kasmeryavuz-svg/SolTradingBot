import { describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { assertPersistableRiskReport } from '../src/persistence/validate.js';
import { FINDING_CODES, TOKEN_2022_PROGRAM_ID } from '../src/risk/constants.js';
import { scanTokenRisk } from '../src/risk/service.js';
import { RiskScanError } from '../src/risk/types.js';
import { AUTHORITY, fakeRiskProvider, mintAccountValue, SCAN_TIME } from './risk-fixtures.js';

describe('scanTokenRisk', () => {
  it('keeps mint, supply, and largest-account slots separate', async () => {
    const report = await scanTokenRisk({
      tokenMint: WRAPPED_SOL_MINT,
      provider: fakeRiskProvider({ mintSlot: 10, supplySlot: 11, largestSlot: 12 }),
      commitment: 'confirmed',
      now: () => new Date(SCAN_TIME),
    });

    expect(report.dataCompleteness).toBe('complete');
    expect(report.concentration).not.toBeNull();
    expect(report.mintContextSlot).toBe(10);
    expect(report.supplyContextSlot).toBe(11);
    expect(report.largestAccountsContextSlot).toBe(12);
    expect(report).not.toHaveProperty('riskSnapshotSlot');
    expect(report).not.toHaveProperty('score');
    expect(report).not.toHaveProperty('riskScore');
    expect(() => {
      assertPersistableRiskReport(report);
    }).not.toThrow();
  });

  it('returns a partial report when supply RPC fails', async () => {
    const report = await scanTokenRisk({
      tokenMint: WRAPPED_SOL_MINT,
      provider: fakeRiskProvider({
        mintValue: mintAccountValue({ mintAuthority: AUTHORITY }),
        supplyError: 'supply rate limited https://api.example.com/?api-key=supersecret',
      }),
      commitment: 'confirmed',
      now: () => new Date(SCAN_TIME),
    });

    expect(report.dataCompleteness).toBe('partial');
    expect(report.supplyRaw).toBeNull();
    expect(report.concentration).toBeNull();
    expect(report.checks.find((check) => check.check === 'supply')?.ok).toBe(false);
    expect(report.findings.map((finding) => finding.code)).toContain(FINDING_CODES.MINT_AUTHORITY_ACTIVE);
    expect(JSON.stringify(report)).not.toContain('supersecret');
    expect(() => {
      assertPersistableRiskReport(report);
    }).not.toThrow();
  });

  it('returns a partial report when largest-account RPC fails', async () => {
    const report = await scanTokenRisk({
      tokenMint: WRAPPED_SOL_MINT,
      provider: fakeRiskProvider({ largestError: 'too many requests' }),
      commitment: 'finalized',
      now: () => new Date(SCAN_TIME),
    });

    expect(report.dataCompleteness).toBe('partial');
    expect(report.largestTokenAccounts).toEqual([]);
    expect(report.concentrationUnavailableReason).toBe('largest token accounts unavailable');
    expect(report.checks.find((check) => check.check === 'mint_account')?.ok).toBe(true);
  });

  it('returns a partial report when both optional RPCs fail and keeps authority findings', async () => {
    const report = await scanTokenRisk({
      tokenMint: WRAPPED_SOL_MINT,
      provider: fakeRiskProvider({
        mintValue: mintAccountValue({ mintAuthority: AUTHORITY, freezeAuthority: AUTHORITY }),
        supplyError: 'supply unavailable',
        largestError: 'largest accounts unavailable',
      }),
      commitment: 'confirmed',
      now: () => new Date(SCAN_TIME),
    });

    expect(report.dataCompleteness).toBe('partial');
    expect(report.supplyRaw).toBeNull();
    expect(report.concentration).toBeNull();
    expect(report.largestTokenAccounts).toEqual([]);
    expect(report.findings.map((finding) => finding.code)).toEqual([
      FINDING_CODES.FREEZE_AUTHORITY_ACTIVE,
      FINDING_CODES.MINT_AUTHORITY_ACTIVE,
    ]);
  });

  it('rejects supply decimals that disagree with mint decimals', async () => {
    const report = await scanTokenRisk({
      tokenMint: WRAPPED_SOL_MINT,
      provider: fakeRiskProvider({ supplyDecimals: 9 }),
      commitment: 'confirmed',
      now: () => new Date(SCAN_TIME),
    });

    expect(report.dataCompleteness).toBe('partial');
    expect(report.supplyRaw).toBeNull();
    expect(report.concentration).toBeNull();
    expect(report.checks.find((check) => check.check === 'supply')?.ok).toBe(false);
    expect(report.checks.find((check) => check.check === 'supply')?.error).toMatch(/decimals/i);
  });

  it('rejects a largest-account dataset with inconsistent decimals', async () => {
    const report = await scanTokenRisk({
      tokenMint: WRAPPED_SOL_MINT,
      provider: fakeRiskProvider({
        accounts: [
          { address: WRAPPED_SOL_MINT, amount: '1000', decimals: 6 },
          { address: USDC_MINT, amount: '100', decimals: 9 },
        ],
      }),
      commitment: 'confirmed',
      now: () => new Date(SCAN_TIME),
    });

    expect(report.dataCompleteness).toBe('partial');
    expect(report.largestTokenAccounts).toEqual([]);
    expect(report.concentration).toBeNull();
    expect(report.checks.find((check) => check.check === 'largest_accounts')?.ok).toBe(false);
    expect(report.checks.find((check) => check.check === 'largest_accounts')?.error).toMatch(
      /decimals/i,
    );
  });

  it('hard-fails on a core mint RPC failure and does not invent a report', async () => {
    await expect(
      scanTokenRisk({
        tokenMint: WRAPPED_SOL_MINT,
        provider: fakeRiskProvider({ mintError: 'connection reset' }),
        commitment: 'confirmed',
      }),
    ).rejects.toBeInstanceOf(RiskScanError);
  });

  it('hard-fails an invalid mint before calling the provider', async () => {
    await expect(
      scanTokenRisk({
        tokenMint: 'not-a-mint',
        provider: fakeRiskProvider(),
        commitment: 'confirmed',
      }),
    ).rejects.toThrow(/Invalid token mint/);
  });

  it('scans a Token-2022 mint with mixed extension findings', async () => {
    const report = await scanTokenRisk({
      tokenMint: USDC_MINT,
      provider: fakeRiskProvider({
        mintValue: mintAccountValue({
          owner: TOKEN_2022_PROGRAM_ID,
          freezeAuthority: AUTHORITY,
          extensions: [
            { extension: 'transferHook', state: { programId: TOKEN_2022_PROGRAM_ID } },
            { extension: 'unknownFuture' },
          ],
        }),
      }),
      commitment: 'confirmed',
      now: () => new Date(SCAN_TIME),
    });

    expect(report.tokenProgram).toBe('token_2022');
    expect(report.findings.map((finding) => finding.code)).toEqual([
      FINDING_CODES.FREEZE_AUTHORITY_ACTIVE,
      FINDING_CODES.TRANSFER_HOOK_ACTIVE,
      FINDING_CODES.UNCLASSIFIED_TOKEN_EXTENSION_PRESENT,
    ]);
  });
});
