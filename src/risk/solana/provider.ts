import { address, createSolanaRpc } from '@solana/kit';
import type { RiskCommitment } from '../../config/types.js';
import { sanitizeErrorText } from '../../utils/sanitize-rpc-url.js';
import { parseSafeSlot } from '../numbers.js';
import type {
  RiskDataProvider,
  RiskLargestAccountsResponse,
  RiskMintAccountResponse,
  RiskTokenSupplyResponse,
} from '../provider.js';
import { RiskScanError } from '../types.js';

export function createSolanaRiskDataProvider(options: {
  rpcUrl: string;
  timeoutMs: number;
  commitment: RiskCommitment;
}): RiskDataProvider {
  const rpc = createSolanaRpc(options.rpcUrl);

  return {
    async getMintAccount(tokenMint: string): Promise<RiskMintAccountResponse> {
      try {
        const response = await rpc
          .getAccountInfo(address(tokenMint), {
            encoding: 'jsonParsed',
            commitment: options.commitment,
          })
          .send({ abortSignal: AbortSignal.timeout(options.timeoutMs) });

        return {
          contextSlot: parseSafeSlot(response.context.slot, 'mintContextSlot'),
          value: response.value,
        };
      } catch (error: unknown) {
        throw wrapRpcError('getAccountInfo', error);
      }
    },

    async getTokenSupply(tokenMint: string): Promise<RiskTokenSupplyResponse> {
      try {
        const response = await rpc
          .getTokenSupply(address(tokenMint), { commitment: options.commitment })
          .send({ abortSignal: AbortSignal.timeout(options.timeoutMs) });

        return {
          contextSlot: parseSafeSlot(response.context.slot, 'supplyContextSlot'),
          amount: String(response.value.amount),
          decimals: response.value.decimals,
        };
      } catch (error: unknown) {
        throw wrapRpcError('getTokenSupply', error);
      }
    },

    async getLargestTokenAccounts(tokenMint: string): Promise<RiskLargestAccountsResponse> {
      try {
        const response = await rpc
          .getTokenLargestAccounts(address(tokenMint), { commitment: options.commitment })
          .send({ abortSignal: AbortSignal.timeout(options.timeoutMs) });

        return {
          contextSlot: parseSafeSlot(response.context.slot, 'largestAccountsContextSlot'),
          accounts: response.value.map((account) => ({
            address: String(account.address),
            amount: String(account.amount),
            decimals: account.decimals,
          })),
        };
      } catch (error: unknown) {
        throw wrapRpcError('getTokenLargestAccounts', error);
      }
    },
  };
}

function wrapRpcError(method: string, error: unknown): RiskScanError {
  if (error instanceof RiskScanError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new RiskScanError(`Solana RPC ${method} failed. ${sanitizeErrorText(message)}`, {
    cause: error,
  });
}
