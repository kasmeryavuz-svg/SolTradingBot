import { describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { parseBoostFeed, parseProfileFeed } from '../src/discovery/dexscreener/normalize.js';
import { DiscoveryError } from '../src/discovery/types.js';

const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

function profileItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    url: `https://dexscreener.com/solana/${WRAPPED_SOL_MINT}`,
    chainId: 'solana',
    tokenAddress: WRAPPED_SOL_MINT,
    description: 'Public profile metadata only',
    links: [{ type: 'twitter', label: 'Twitter', url: 'https://x.com/example' }],
    ...overrides,
  };
}

function boostItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    url: `https://dexscreener.com/solana/${USDC_MINT}`,
    chainId: 'solana',
    tokenAddress: USDC_MINT,
    description: 'Boosted listing metadata',
    amount: 10,
    totalAmount: 40,
    ...overrides,
  };
}

describe('DEX Screener discovery normalization', () => {
  it('parses valid latest-profile records', () => {
    const records = parseProfileFeed([profileItem()]);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      source: 'dexscreener_profile',
      tokenMint: WRAPPED_SOL_MINT,
      description: 'Public profile metadata only',
      profileUpdatedAt: null,
      boostAmount: null,
      boostTotalAmount: null,
    });
  });

  it('parses valid latest-boost records from amount and totalAmount only', () => {
    const records = parseBoostFeed([boostItem()]);

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      source: 'dexscreener_boost',
      tokenMint: USDC_MINT,
      boostAmount: 10,
      boostTotalAmount: 40,
      profileUpdatedAt: null,
    });
  });

  it('does not copy profile amount fields onto a profile-only record', () => {
    const records = parseProfileFeed([profileItem({ amount: 99, totalAmount: 150 })]);

    expect(records[0]?.boostAmount).toBeNull();
    expect(records[0]?.boostTotalAmount).toBeNull();
  });

  it('stores missing boost values as null', () => {
    const records = parseBoostFeed([boostItem({ amount: undefined, totalAmount: undefined })]);

    expect(records[0]?.boostAmount).toBeNull();
    expect(records[0]?.boostTotalAmount).toBeNull();
  });

  it('ignores non-Solana profile records', () => {
    const records = parseProfileFeed([
      profileItem({ chainId: 'ethereum', tokenAddress: '0x123' }),
      profileItem({ chainId: 'Solana', tokenAddress: BONK_MINT }),
    ]);

    expect(records.map((record) => record.tokenMint)).toEqual([BONK_MINT]);
  });

  it('ignores non-Solana boost records', () => {
    const records = parseBoostFeed([
      boostItem({ chainId: 'base' }),
      boostItem({ chainId: 'bsc' }),
      boostItem({ chainId: 'solana', tokenAddress: BONK_MINT }),
    ]);

    expect(records).toHaveLength(1);
    expect(records[0]?.tokenMint).toBe(BONK_MINT);
  });

  it('skips a malformed chainId without failing the feed', () => {
    const records = parseProfileFeed([
      profileItem({ chainId: 1 }),
      profileItem({ chainId: '' }),
      profileItem({ tokenAddress: BONK_MINT }),
    ]);

    expect(records).toHaveLength(1);
    expect(records[0]?.tokenMint).toBe(BONK_MINT);
  });

  it('ignores malformed tokenAddress values without failing the feed', () => {
    const records = parseProfileFeed([
      profileItem({ tokenAddress: 'not-a-mint' }),
      profileItem({ tokenAddress: '0xabc' }),
      profileItem({ tokenAddress: BONK_MINT }),
    ]);

    expect(records).toHaveLength(1);
    expect(records[0]?.tokenMint).toBe(BONK_MINT);
  });

  it('stores a missing optional description as null', () => {
    const records = parseProfileFeed([profileItem({ description: '' })]);

    expect(records[0]?.description).toBeNull();
  });

  it('ignores a malformed url without dropping the mint', () => {
    const records = parseProfileFeed([profileItem({ url: 'not-a-url', tokenAddress: BONK_MINT })]);

    expect(records).toHaveLength(1);
    expect(records[0]?.dexScreenerUrl).toBeNull();
    expect(records[0]?.tokenMint).toBe(BONK_MINT);
  });

  it('ignores malformed links safely', () => {
    const records = parseProfileFeed([
      profileItem({
        links: [
          { type: 'web', label: 'Broken', url: 'not-a-url' },
          { type: 'web', label: 'Script', url: 'javascript:alert(1)' },
          'https://example.com',
          { url: 123 },
        ],
      }),
    ]);

    expect(records[0]?.links).toEqual([]);
  });

  it('normalizes valid http(s) links', () => {
    const records = parseProfileFeed([
      profileItem({
        links: [
          { type: 'website', label: 'Site', url: 'https://example.com' },
          { type: 'telegram', label: null, url: 'http://t.me/example' },
        ],
      }),
    ]);

    expect(records[0]?.links).toEqual([
      { type: 'website', label: 'Site', url: 'https://example.com' },
      { type: 'telegram', label: null, url: 'http://t.me/example' },
    ]);
  });

  it('ignores malformed boost amount and totalAmount without failing the feed', () => {
    const records = parseBoostFeed([
      boostItem({
        tokenAddress: BONK_MINT,
        amount: 'not-a-number',
        totalAmount: { nested: 1 },
      }),
    ]);

    expect(records).toHaveLength(1);
    expect(records[0]?.boostAmount).toBeNull();
    expect(records[0]?.boostTotalAmount).toBeNull();
  });

  it('keeps profileUpdatedAt null because latest profiles document no timestamp', () => {
    const records = parseProfileFeed([
      profileItem({
        updatedAt: '2026-01-15T12:00:00.000Z',
        profileUpdatedAt: '2026-01-15T12:00:00.000Z',
      }),
    ]);

    expect(records[0]?.profileUpdatedAt).toBeNull();
  });

  it('does not invent a token launch timestamp', () => {
    const [record] = parseProfileFeed([profileItem()]);

    expect(record).toBeDefined();
    expect(record).not.toHaveProperty('launchTime');
    expect(record).not.toHaveProperty('tokenCreatedAt');
    expect(record).not.toHaveProperty('mintCreatedAt');
  });

  it('treats an invalid root payload as a provider failure, not an empty feed', () => {
    expect(() => parseProfileFeed({ tokenAddress: WRAPPED_SOL_MINT })).toThrow(DiscoveryError);
    expect(() => parseProfileFeed({ data: [profileItem()] })).toThrow(/unexpected response/);
    expect(() => parseBoostFeed('not-json-array')).toThrow(DiscoveryError);
    expect(parseProfileFeed([])).toEqual([]);
  });
});
