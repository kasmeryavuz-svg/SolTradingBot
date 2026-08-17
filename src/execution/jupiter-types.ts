export type RawJupiterInstruction = {
  programId: string;
  accounts: readonly {
    pubkey: string;
    isWritable: boolean;
    isSigner: boolean;
  }[];
  data: string;
};

export type RawJupiterBuildResponse = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  routePlan: readonly unknown[];
  computeBudgetInstructions: readonly unknown[];
  setupInstructions: readonly unknown[];
  swapInstruction: unknown;
  cleanupInstruction: unknown;
  otherInstructions: readonly unknown[];
  tipInstruction: unknown;
  addressesByLookupTableAddress: Record<string, string[]> | null;
  blockhashWithMetadata: {
    blockhash: number[];
    lastValidBlockHeight: number;
    fetchedAt: string;
  };
};
