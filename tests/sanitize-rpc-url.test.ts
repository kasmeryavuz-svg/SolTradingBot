import { describe, expect, it } from 'vitest';
import { sanitizeErrorText, sanitizeRpcUrl } from '../src/utils/sanitize-rpc-url.js';

describe('sanitizeRpcUrl', () => {
  it('redacts query values that may contain API keys', () => {
    const sanitized = sanitizeRpcUrl('https://api.mainnet-beta.solana.com/?api-key=supersecret');

    expect(sanitized).toContain('api-key=REDACTED');
    expect(sanitized).not.toContain('supersecret');
  });

  it('redacts usernames and passwords', () => {
    const sanitized = sanitizeRpcUrl('https://user:hunter2@rpc.example.com/');

    expect(sanitized).toContain('REDACTED');
    expect(sanitized).not.toContain('hunter2');
    expect(sanitized).not.toContain('user:');
  });

  it('redacts secret-looking path segments', () => {
    const sanitized = sanitizeRpcUrl('https://solana-mainnet.g.alchemy.com/v2/abcdefghijklmnopqrstuvwxyz');

    expect(sanitized).toContain('/v2/REDACTED');
    expect(sanitized).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('returns a placeholder for malformed URLs', () => {
    expect(sanitizeRpcUrl('not a url')).toBe('[unprintable-rpc-url]');
  });

  it('redacts URLs embedded in error text', () => {
    const sanitized = sanitizeErrorText(
      'request to https://rpc.example/?token=abcd1234secret failed',
    );

    expect(sanitized).toContain('token=REDACTED');
    expect(sanitized).not.toContain('abcd1234secret');
  });
});
