export const SOLANA_MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isPlausibleSolanaMint(value: string): boolean {
  return SOLANA_MINT_PATTERN.test(value);
}
