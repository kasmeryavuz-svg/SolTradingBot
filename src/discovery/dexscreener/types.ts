/**
 * Documented DEX Screener discovery fields we may read.
 * Latest profiles and latest boosts do not document a timestamp.
 * We do not invent updatedAt, scores, or launch times.
 */
export type DexScreenerDiscoveryItem = {
  url?: unknown;
  chainId?: unknown;
  tokenAddress?: unknown;
  icon?: unknown;
  header?: unknown;
  description?: unknown;
  links?: unknown;
  amount?: unknown;
  totalAmount?: unknown;
};
