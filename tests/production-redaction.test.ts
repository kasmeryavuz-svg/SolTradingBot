import { describe, expect, it } from 'vitest';
import { serializeProductionLog } from '../src/production/logger.js';
import { sanitizeProductionErrorMessage, sanitizeProductionText } from '../src/production/sanitizer.js';

describe('production redaction', () => {
  it('redacts complete URLs including path, query, and userinfo secrets', () => {
    const inputs = [
      'request failed https://rpc.example/SECRET123',
      'https://user:SECRET123@example.com',
      'https://rpc.example/v1/SECRET123/method',
      'https://rpc.example/?token=SECRET123',
      'https://rpc.example/?foo=SECRET123',
      'https://example.com/?api-key=SECRET123',
    ];
    for (const input of inputs) {
      const sanitized = sanitizeProductionText(input);
      expect(sanitized).not.toContain('SECRET123');
      expect(sanitized).toContain('[REDACTED_URL]');
    }
  });

  it('redacts header and key-value secrets', () => {
    const inputs = [
      'Authorization: Bearer SECRET123',
      'authorization=SECRET123',
      'x-api-key: SECRET123',
      'api-key=SECRET123',
      'privateKey=SECRET123',
      'secret=SECRET123',
      'mnemonic=SECRET123',
      'seed=SECRET123',
      'rpc.example/SECRET123',
    ];
    for (const input of inputs) {
      expect(sanitizeProductionText(input)).not.toContain('SECRET123');
    }
  });

  it('does not serialize source Error objects', () => {
    const error = new Error('request failed https://rpc.example/SECRET123');
    const message = sanitizeProductionErrorMessage(error);
    expect(message).not.toContain('SECRET123');
    const line = serializeProductionLog({
      timestamp: '2026-08-19T00:00:00.000Z',
      level: 'error',
      event: 'collector_cycle',
      specVersion: 'prod20_v1',
      message,
    });
    expect(line).not.toContain('SECRET123');
    expect(line).not.toContain('stack');
    expect(line).not.toContain('"cause"');
    expect((JSON.parse(line) as { message: string }).message).toBeTypeOf('string');
  });
});
