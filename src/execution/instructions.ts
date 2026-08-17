import { AccountRole, address, type Instruction } from '@solana/kit';
import { COMPUTE_BUDGET_PROGRAM_ID } from './constants.js';
import { decodeBase64Exact, encodeBase64, encodeSetComputeUnitLimit } from './compute.js';
import type { NormalizedInstruction } from './types.js';

export const E14_INSTRUCTION_ORDER = [
  'set_compute_unit_limit',
  'jupiter_compute_budget_set_compute_unit_price',
  'jupiter_setup_instructions',
  'jupiter_swap_instruction',
  'jupiter_cleanup_instruction_if_present',
  'jupiter_other_instructions',
] as const;

export function createSetComputeUnitLimitInstruction(units: number): NormalizedInstruction {
  return {
    programId: COMPUTE_BUDGET_PROGRAM_ID,
    accounts: [],
    dataBase64: encodeBase64(encodeSetComputeUnitLimit(units)),
  };
}

export function toKitInstruction(instruction: NormalizedInstruction): Instruction {
  return {
    programAddress: address(instruction.programId),
    accounts: instruction.accounts.map((account) => ({
      address: address(account.pubkey),
      role:
        account.isSigner && account.isWritable
          ? AccountRole.WRITABLE_SIGNER
          : account.isSigner
            ? AccountRole.READONLY_SIGNER
            : account.isWritable
              ? AccountRole.WRITABLE
              : AccountRole.READONLY,
    })),
    data: decodeBase64Exact(instruction.dataBase64),
  };
}

export function collectOrderedInstructions(input: {
  computeUnitLimit: number;
  includeComputeUnitPrice: boolean;
  computeUnitPrice: NormalizedInstruction;
  setupInstructions: readonly NormalizedInstruction[];
  swapInstruction: NormalizedInstruction;
  cleanupInstruction: NormalizedInstruction | null;
  otherInstructions: readonly NormalizedInstruction[];
}): NormalizedInstruction[] {
  const ordered: NormalizedInstruction[] = [createSetComputeUnitLimitInstruction(input.computeUnitLimit)];
  if (input.includeComputeUnitPrice) {
    ordered.push(input.computeUnitPrice);
  }
  ordered.push(...input.setupInstructions);
  ordered.push(input.swapInstruction);
  if (input.cleanupInstruction !== null) {
    ordered.push(input.cleanupInstruction);
  }
  ordered.push(...input.otherInstructions);
  return ordered;
}
