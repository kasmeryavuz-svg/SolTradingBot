import type { DiscoverySource, SourceRecord } from './types.js';

export type DiscoveryFeedProvider = {
  source: DiscoverySource;
  fetchRecords(): Promise<SourceRecord[]>;
};
