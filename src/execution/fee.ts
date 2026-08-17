import { MAX_PRIORITY_FEE_LAMPORTS, MICRO_LAMPORTS_PER_LAMPORT } from './constants.js';

export type PriorityFeeResult =
  | {
      readonly kind: 'ok';
      readonly calculatedPriorityFeeComponentLamports: bigint;
      readonly maxPriorityFeeLamports: bigint;
    }
  | {
      readonly kind: 'blocked_priority_fee_cap';
      readonly calculatedPriorityFeeComponentLamports: bigint;
      readonly maxPriorityFeeLamports: bigint;
    };

export function calculatePriorityFeeLamports(
  computeUnitPriceMicroLamports: bigint,
  finalComputeUnitLimit: bigint,
): bigint {
  if (computeUnitPriceMicroLamports < 0n || finalComputeUnitLimit < 0n) {
    throw new RangeError('Priority-fee inputs must be non-negative.');
  }
  return (
    (computeUnitPriceMicroLamports * finalComputeUnitLimit + (MICRO_LAMPORTS_PER_LAMPORT - 1n)) /
    MICRO_LAMPORTS_PER_LAMPORT
  );
}

export function classifyPriorityFee(
  computeUnitPriceMicroLamports: bigint,
  finalComputeUnitLimit: number,
): PriorityFeeResult {
  const estimatedPriorityFeeLamports = calculatePriorityFeeLamports(
    computeUnitPriceMicroLamports,
    BigInt(finalComputeUnitLimit),
  );
  if (estimatedPriorityFeeLamports > MAX_PRIORITY_FEE_LAMPORTS) {
    return {
      kind: 'blocked_priority_fee_cap',
      calculatedPriorityFeeComponentLamports: estimatedPriorityFeeLamports,
      maxPriorityFeeLamports: MAX_PRIORITY_FEE_LAMPORTS,
    };
  }
  return {
    kind: 'ok',
    calculatedPriorityFeeComponentLamports: estimatedPriorityFeeLamports,
    maxPriorityFeeLamports: MAX_PRIORITY_FEE_LAMPORTS,
  };
}

export function isBlockhashExpired(currentHeight: bigint, lastValidBlockHeight: bigint): boolean {
  return currentHeight > lastValidBlockHeight;
}
