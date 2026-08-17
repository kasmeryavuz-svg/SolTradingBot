export type RiskMintAccountResponse = {
  contextSlot: number;
  value: unknown;
};

export type RiskTokenSupplyResponse = {
  contextSlot: number;
  amount: string;
  decimals: number;
};

export type RiskLargestAccountResponse = {
  address: string;
  amount: string;
  decimals: number | null;
};

export type RiskLargestAccountsResponse = {
  contextSlot: number;
  accounts: readonly RiskLargestAccountResponse[];
};

export type RiskDataProvider = {
  getMintAccount(tokenMint: string): Promise<RiskMintAccountResponse>;
  getTokenSupply(tokenMint: string): Promise<RiskTokenSupplyResponse>;
  getLargestTokenAccounts(tokenMint: string): Promise<RiskLargestAccountsResponse>;
};
