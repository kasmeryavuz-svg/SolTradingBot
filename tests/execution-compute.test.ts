import { describe, expect, it } from 'vitest';
import { COMPUTE_BUDGET_PROGRAM_ID } from '../src/execution/constants.js';
import {
  calculateFinalComputeLimit,
  calculatePriorityFeeLamports,
  classifyPriorityFee,
  decodeComputeBudgetInstruction,
  isBlockhashExpired,
} from '../src/execution/index.js';
import { cuPriceInstructionData } from './execution-fixtures.js';
import { MAX_PRIORITY_FEE_LAMPORTS } from '../src/execution/constants.js';

describe('compute-unit limit policy', () => {
  it('applies a 20% ceiling without floating-point drift', () => {
    expect(calculateFinalComputeLimit(100_000n)).toEqual({ kind: 'ok', finalLimit: 120_000 });
    expect(calculateFinalComputeLimit(100_001n)).toEqual({ kind: 'ok', finalLimit: 120_002 });
    expect(calculateFinalComputeLimit(1_000_000n)).toEqual({ kind: 'ok', finalLimit: 1_200_000 });
    expect(calculateFinalComputeLimit(1n)).toEqual({ kind: 'ok', finalLimit: 2 });
    expect(calculateFinalComputeLimit(4n)).toEqual({ kind: 'ok', finalLimit: 5 });
    expect(calculateFinalComputeLimit(5n)).toEqual({ kind: 'ok', finalLimit: 6 });
    expect(calculateFinalComputeLimit(6n)).toEqual({ kind: 'ok', finalLimit: 8 });
    expect(calculateFinalComputeLimit(1_166_666n)).toEqual({ kind: 'ok', finalLimit: 1_400_000 });
    expect(calculateFinalComputeLimit(1_166_667n)).toEqual({ kind: 'ok', finalLimit: 1_400_000 });
    expect(calculateFinalComputeLimit(1_399_999n)).toEqual({ kind: 'ok', finalLimit: 1_400_000 });
  });

  it('blocks at or above the hard max instead of pretending a cap is safe', () => {
    expect(calculateFinalComputeLimit(1_400_000n)).toEqual({
      kind: 'blocked_compute_limit',
      simulatedUnits: 1_400_000n,
    });
    expect(calculateFinalComputeLimit(1_400_001n).kind).toBe('blocked_compute_limit');
  });
});

describe('priority fee policy', () => {
  it('uses BigInt ceiling division and the frozen cap', () => {
    expect(calculatePriorityFeeLamports(0n, 1_200_000n)).toBe(0n);
    expect(calculatePriorityFeeLamports(1_000_000n, 1n)).toBe(1n);
    expect(calculatePriorityFeeLamports(1n, 1n)).toBe(1n);
    expect(calculatePriorityFeeLamports(3n, 1_000_000n)).toBe(3n);
    expect(classifyPriorityFee(1n, 1_000_000).kind).toBe('ok');
    expect(classifyPriorityFee(MAX_PRIORITY_FEE_LAMPORTS, 1_000_000)).toEqual({
      kind: 'ok',
      calculatedPriorityFeeComponentLamports: MAX_PRIORITY_FEE_LAMPORTS,
      maxPriorityFeeLamports: MAX_PRIORITY_FEE_LAMPORTS,
    });
    expect(classifyPriorityFee(MAX_PRIORITY_FEE_LAMPORTS + 1n, 1_000_000).kind).toBe(
      'blocked_priority_fee_cap',
    );
    expect(calculatePriorityFeeLamports(18_446_744_073_709_551_615n, 1n) > 0n).toBe(true);
    expect(calculatePriorityFeeLamports(1n, 1_000_000n)).toBe(1n);
    expect(calculatePriorityFeeLamports(1n, 1_000_001n)).toBe(2n);
    expect(calculatePriorityFeeLamports(2n, 500_000n)).toBe(1n);
  });
});

describe('compute-budget binary decoder', () => {
  it('rejects short, trailing, and wrong-discriminator SetComputeUnitPrice data', () => {
    const exact = {
      programId: COMPUTE_BUDGET_PROGRAM_ID,
      accounts: [],
      dataBase64: cuPriceInstructionData(7n),
    };
    expect(decodeComputeBudgetInstruction(exact)).toEqual({
      kind: 'set_compute_unit_price',
      microLamports: 7n,
    });
    const short = Buffer.alloc(8);
    short.writeUInt8(3, 0);
    expect(
      decodeComputeBudgetInstruction({
        programId: COMPUTE_BUDGET_PROGRAM_ID,
        accounts: [],
        dataBase64: short.toString('base64'),
      }).kind,
    ).toBe('unexpected');
    const trailing = Buffer.alloc(10);
    trailing.writeUInt8(3, 0);
    trailing.writeBigUInt64LE(7n, 1);
    expect(
      decodeComputeBudgetInstruction({
        programId: COMPUTE_BUDGET_PROGRAM_ID,
        accounts: [],
        dataBase64: trailing.toString('base64'),
      }).kind,
    ).toBe('unexpected');
  });
});

describe('blockhash validity boundary', () => {
  it('treats lastValidBlockHeight as inclusive', () => {
    expect(isBlockhashExpired(999n, 1000n)).toBe(false);
    expect(isBlockhashExpired(1000n, 1000n)).toBe(false);
    expect(isBlockhashExpired(1001n, 1000n)).toBe(true);
  });
});
