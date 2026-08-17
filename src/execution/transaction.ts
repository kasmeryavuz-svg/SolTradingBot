import { createHash } from 'node:crypto';
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  compressTransactionMessageUsingAddressLookupTables,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type AddressesByLookupTableAddress,
  type Blockhash,
  type Transaction,
} from '@solana/kit';
import { COMPUTE_UNIT_HARD_MAX, SOLANA_PACKET_DATA_SIZE } from './constants.js';
import { ExecutionError } from './errors.js';
import { collectOrderedInstructions, E14_INSTRUCTION_ORDER, toKitInstruction } from './instructions.js';
import type { ExecutionCandidate, NormalizedJupiterBuild } from './types.js';

export type CompiledUnsignedCandidate = {
  readonly candidate: ExecutionCandidate;
  readonly wireTransactionBase64: string;
  readonly messageBase64: string;
  readonly compiledTransaction: Transaction;
};

export function compileUnsignedCandidate(
  build: NormalizedJupiterBuild,
  options: {
    feePayer: string;
    computeUnitLimit: number;
    includeComputeUnitPrice: boolean;
  },
): CompiledUnsignedCandidate {
  if (
    !Number.isInteger(options.computeUnitLimit) ||
    options.computeUnitLimit <= 0 ||
    options.computeUnitLimit > COMPUTE_UNIT_HARD_MAX
  ) {
    throw new ExecutionError('Unsigned candidate compute-unit limit is outside the e14 contract.', {
      code: 'invalid_compute_limit',
    });
  }

  const normalized = collectOrderedInstructions({
    computeUnitLimit: options.computeUnitLimit,
    includeComputeUnitPrice: options.includeComputeUnitPrice,
    computeUnitPrice: build.computeUnitPrice,
    setupInstructions: build.setupInstructions,
    swapInstruction: build.swapInstruction,
    cleanupInstruction: build.cleanupInstruction,
    otherInstructions: build.otherInstructions,
  });

  try {
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (current) => appendTransactionMessageInstructions(normalized.map(toKitInstruction), current),
      (current) =>
        compressTransactionMessageUsingAddressLookupTables(current, toKitLookupTables(build.lookupTables)),
      (current) => setTransactionMessageFeePayer(address(options.feePayer), current),
      (current) =>
        setTransactionMessageLifetimeUsingBlockhash(
          {
            blockhash: build.blockhash.blockhashBase58 as Blockhash,
            lastValidBlockHeight: build.blockhash.lastValidBlockHeight,
          },
          current,
        ),
    );
    const compiled = compileTransaction(message);
    const requiredSigners = Object.keys(compiled.signatures);
    if (requiredSigners.length !== 1 || requiredSigners[0] !== options.feePayer) {
      throw new ExecutionError(
        'Compiled v0 message requires a signer set other than the single public taker. e14 does not generate another signer.',
        { code: 'unsupported_signer_requirement' },
      );
    }
    const wireTransactionBase64 = getBase64EncodedWireTransaction(compiled);
    const serializedTransactionBytes = Buffer.from(wireTransactionBase64, 'base64').byteLength;
    if (serializedTransactionBytes > SOLANA_PACKET_DATA_SIZE) {
      throw new ExecutionError(
        `Unsigned v0 candidate serialized to ${String(serializedTransactionBytes)} bytes, above the Solana 1232-byte packet limit.`,
        { code: 'blocked_transaction_size' },
      );
    }
    return {
      candidate: {
        version: 0,
        feePayer: options.feePayer,
        computeUnitLimit: options.computeUnitLimit,
        instructionOrder: [...E14_INSTRUCTION_ORDER],
        instructionCount: normalized.length,
        lookupTableCount: Object.keys(build.lookupTables).length,
        blockhashBase58: build.blockhash.blockhashBase58,
        lastValidBlockHeight: build.blockhash.lastValidBlockHeight,
        compiledMessageSha256: createHash('sha256')
          .update(Buffer.from(compiled.messageBytes))
          .digest('hex'),
        serializedTransactionBytes,
      },
      wireTransactionBase64,
      messageBase64: Buffer.from(compiled.messageBytes).toString('base64'),
      compiledTransaction: compiled,
    };
  } catch (error: unknown) {
    if (error instanceof ExecutionError) {
      throw error;
    }
    throw new ExecutionError('Failed to compile the unsigned v0 transaction message from Jupiter instructions.', {
      cause: error,
      code: 'provider_invalid_response',
    });
  }
}

function toKitLookupTables(
  tables: NormalizedJupiterBuild['lookupTables'],
): AddressesByLookupTableAddress {
  const mapped: AddressesByLookupTableAddress = {};
  for (const [table, accounts] of Object.entries(tables)) {
    mapped[address(table)] = accounts.map((item) => address(item));
  }
  return mapped;
}
