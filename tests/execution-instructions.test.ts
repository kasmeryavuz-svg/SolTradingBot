import { describe, expect, it } from 'vitest';
import { COMPUTE_BUDGET_PROGRAM_ID } from '../src/execution/constants.js';
import {
  collectOrderedInstructions,
  createSetComputeUnitLimitInstruction,
  decodeComputeBudgetInstruction,
  normalizeInstruction,
} from '../src/execution/index.js';
import { TOKEN_PROGRAM, cuPriceInstructionData, executionIntent, instruction } from './execution-fixtures.js';

describe('instruction normalization and order', () => {
  it('normalizes Jupiter instruction objects and rejects malformed metas', () => {
    const normalized = normalizeInstruction(
      instruction(TOKEN_PROGRAM, 'AQID', [
        { pubkey: executionIntent().takerPublicKey, isWritable: true, isSigner: true },
      ]),
      'swapInstruction',
    );
    expect(normalized.programId).toBe(TOKEN_PROGRAM);
    expect(normalized.accounts[0]?.isSigner).toBe(true);
    expect(() =>
      normalizeInstruction(
        instruction(TOKEN_PROGRAM, 'AQID', [{ pubkey: executionIntent().takerPublicKey, isWritable: 'yes', isSigner: false }]),
        'swapInstruction',
      ),
    ).toThrow(/signer\/writable/);
  });

  it('orders official V2 instructions as CU limit, CU price, setup, swap, cleanup, other', () => {
    const price = normalizeInstruction(
      instruction(COMPUTE_BUDGET_PROGRAM_ID, cuPriceInstructionData(5n)),
      'compute',
    );
    const setup1 = normalizeInstruction(instruction(TOKEN_PROGRAM, 'U0VUVVBfMQ=='), 'setup1');
    const setup2 = normalizeInstruction(instruction(TOKEN_PROGRAM, 'U0VUVVBfMg=='), 'setup2');
    const swap = normalizeInstruction(instruction(TOKEN_PROGRAM, 'U1dBUA=='), 'swap');
    const cleanup = normalizeInstruction(instruction(TOKEN_PROGRAM, 'Q0xFQU5VUA=='), 'cleanup');
    const other1 = normalizeInstruction(instruction(TOKEN_PROGRAM, 'T1RIRVJfMQ=='), 'other1');
    const other2 = normalizeInstruction(instruction(TOKEN_PROGRAM, 'T1RIRVJfMg=='), 'other2');
    const first = collectOrderedInstructions({
      computeUnitLimit: 1_400_000,
      includeComputeUnitPrice: false,
      computeUnitPrice: price,
      setupInstructions: [setup1, setup2],
      swapInstruction: swap,
      cleanupInstruction: cleanup,
      otherInstructions: [other1, other2],
    });
    const final = collectOrderedInstructions({
      computeUnitLimit: 120_000,
      includeComputeUnitPrice: true,
      computeUnitPrice: price,
      setupInstructions: [setup1, setup2],
      swapInstruction: swap,
      cleanupInstruction: cleanup,
      otherInstructions: [other1, other2],
    });
    expect(first.map((item) => item.dataBase64)).toEqual([
      createSetComputeUnitLimitInstruction(1_400_000).dataBase64,
      setup1.dataBase64,
      setup2.dataBase64,
      swap.dataBase64,
      cleanup.dataBase64,
      other1.dataBase64,
      other2.dataBase64,
    ]);
    expect(final.map((item) => item.dataBase64)).toEqual([
      createSetComputeUnitLimitInstruction(120_000).dataBase64,
      price.dataBase64,
      setup1.dataBase64,
      setup2.dataBase64,
      swap.dataBase64,
      cleanup.dataBase64,
      other1.dataBase64,
      other2.dataBase64,
    ]);
    expect(decodeComputeBudgetInstruction(price)).toEqual({
      kind: 'set_compute_unit_price',
      microLamports: 5n,
    });
  });
});
