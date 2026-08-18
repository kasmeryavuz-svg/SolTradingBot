import { LIVE_MAX_RPC_TRANSACTION_FEE_LAMPORTS, LIVE_OUTPUT_MINT } from './constants.js';
import { LiveError } from './errors.js';
import { signedWireSha256FromBase64 } from './identity.js';
import { firstSignatureFromWireBase64 } from './signature.js';
import type { LiveTokenBalance, LiveTransactionReceipt } from './types.js';

export type ReceiptVerification = {
  readonly confirmedTransactionSha256: string | null;
  readonly actualOutputRaw: string | null;
  readonly feeLamports: bigint | null;
  readonly slot: string;
  readonly feeAnomaly: boolean;
};

export function verifyConfirmedReceipt(input: {
  receipt: LiveTransactionReceipt;
  localSignedWireSha256: string;
  expectedSignature: string;
  takerAddress: string;
  minimumOutputRaw: string;
  requireSuccess: boolean;
  statusErr?: unknown;
}): ReceiptVerification {
  assertStatusReceiptErrCoherence(input.statusErr, input.receipt.err, input.requireSuccess);

  if (input.requireSuccess && input.receipt.err !== null && input.receipt.err !== undefined) {
    throw new LiveError('Confirmed transaction metadata reports a failure.', {
      code: 'receipt_integrity_error',
    });
  }

  const confirmedTransactionSha256 =
    input.receipt.transactionBase64 === null
      ? null
      : signedWireSha256FromBase64(input.receipt.transactionBase64);

  if (confirmedTransactionSha256 === null) {
    throw new LiveError('getTransaction did not return base64 wire bytes for integrity comparison.', {
      code: 'confirmation_integrity_error',
    });
  }
  if (confirmedTransactionSha256 !== input.localSignedWireSha256) {
    throw new LiveError(
      'Confirmed transaction wire SHA-256 does not match the locally signed wire. confirmation_integrity_error.',
      { code: 'confirmation_integrity_error' },
    );
  }

  const firstSignature =
    input.receipt.firstSignature ??
    (input.receipt.transactionBase64 === null ? null : firstSignatureFromWireBase64(input.receipt.transactionBase64));
  if (firstSignature !== input.expectedSignature) {
    throw new LiveError(
      'Confirmed transaction first signature does not equal the expected txid. confirmation_integrity_error.',
      { code: 'confirmation_integrity_error' },
    );
  }

  const actualOutputRaw = deriveTakerUsdcOutputRaw(
    input.receipt.preTokenBalances,
    input.receipt.postTokenBalances,
    input.takerAddress,
  );
  if (
    input.requireSuccess &&
    actualOutputRaw !== null &&
    BigInt(actualOutputRaw) < BigInt(input.minimumOutputRaw)
  ) {
    throw new LiveError(
      'Derived taker USDC output is below Jupiter’s enforced minimum threshold. receipt_integrity_error. This is not PnL.',
      { code: 'receipt_integrity_error' },
    );
  }

  const feeAnomaly =
    input.receipt.feeLamports !== null && input.receipt.feeLamports > LIVE_MAX_RPC_TRANSACTION_FEE_LAMPORTS;

  return {
    confirmedTransactionSha256,
    actualOutputRaw,
    feeLamports: input.receipt.feeLamports,
    slot: input.receipt.slot,
    feeAnomaly,
  };
}

export function deriveTakerUsdcOutputRaw(
  pre: readonly LiveTokenBalance[],
  post: readonly LiveTokenBalance[],
  takerAddress: string,
): string | null {
  const preOwned = selectTakerUsdc(pre, takerAddress);
  const postOwned = selectTakerUsdc(post, takerAddress);
  if (preOwned === null || postOwned === null) {
    return null;
  }
  if (postOwned.length === 0 && preOwned.length === 0) {
    return null;
  }
  try {
    const postSum = sumRaw(postOwned);
    const preSum = sumRaw(preOwned);
    const delta = postSum - preSum;
    if (delta < 0n) {
      return null;
    }
    return delta.toString();
  } catch {
    return null;
  }
}

function selectTakerUsdc(
  balances: readonly LiveTokenBalance[],
  takerAddress: string,
): LiveTokenBalance[] | null {
  const usdc = balances.filter((item) => item.mint === LIVE_OUTPUT_MINT);
  const owned = usdc.filter((item) => item.owner === takerAddress);
  const missingOwner = usdc.some((item) => item.owner === null);
  if (missingOwner && owned.length > 0) {
    return null;
  }
  if (missingOwner && owned.length === 0) {
    return null;
  }
  if (hasDuplicateAccountIndex(owned)) {
    return null;
  }
  return owned;
}

function hasDuplicateAccountIndex(balances: readonly LiveTokenBalance[]): boolean {
  if (balances.length <= 1) {
    return false;
  }
  const seen = new Set<number>();
  for (const item of balances) {
    if (item.accountIndex === null) {
      return true;
    }
    if (seen.has(item.accountIndex)) {
      return true;
    }
    seen.add(item.accountIndex);
  }
  return false;
}

function sumRaw(balances: readonly LiveTokenBalance[]): bigint {
  let total = 0n;
  for (const item of balances) {
    if (!/^\d+$/.test(item.amountRaw)) {
      throw new RangeError('non-canonical token amount');
    }
    total += BigInt(item.amountRaw);
  }
  return total;
}

function assertStatusReceiptErrCoherence(
  statusErr: unknown,
  receiptErr: unknown,
  requireSuccess: boolean,
): void {
  const statusFailed = statusErr !== null && statusErr !== undefined;
  const receiptFailed = receiptErr !== null && receiptErr !== undefined;
  if (requireSuccess && !statusFailed && receiptFailed) {
    throw new LiveError(
      'getSignatureStatuses err is null but getTransaction meta.err is not null. receipt/status integrity conflict.',
      { code: 'receipt_integrity_error' },
    );
  }
  if (requireSuccess && statusFailed && !receiptFailed) {
    throw new LiveError(
      'getSignatureStatuses err is non-null but getTransaction meta.err is null. receipt/status integrity conflict.',
      { code: 'receipt_integrity_error' },
    );
  }
}
