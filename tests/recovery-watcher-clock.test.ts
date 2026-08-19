import { describe, expect, it } from 'vitest';
import { assertTimestampOrder, parseUtcInstant } from '../src/recovery-watcher/clock.js';

describe('recovery watcher timestamp instants', () => {
  it('orders equivalent UTC formats numerically, not lexically', () => {
    const noFraction: string = '2026-08-19T11:00:00Z';
    const oneTenth: string = '2026-08-19T11:00:00.1Z';
    const oneHundredMillis: string = '2026-08-19T11:00:00.100Z';
    expect(parseUtcInstant(noFraction, 'noFraction')).toBe(Date.parse('2026-08-19T11:00:00.000Z'));
    expect(parseUtcInstant(oneTenth, 'oneTenth')).toBe(parseUtcInstant(oneHundredMillis, 'oneHundredMillis'));
    expect(parseUtcInstant(oneHundredMillis, 'later')).toBeGreaterThan(parseUtcInstant(noFraction, 'earlier'));
    expect(lexicalLess(oneHundredMillis, noFraction)).toBe(true);
    expect(lexicalLess(noFraction, oneHundredMillis)).toBe(false);
    expect(parseUtcInstant(oneHundredMillis, 'later') > parseUtcInstant(noFraction, 'earlier')).toBe(true);
    expect(() => {
      assertTimestampOrder(oneHundredMillis, noFraction, 'later cannot precede earlier');
    }).toThrow(/later cannot precede earlier/);
    expect(() => {
      assertTimestampOrder(noFraction, oneHundredMillis, 'ok');
    }).not.toThrow();
    expect(() => {
      assertTimestampOrder(oneTenth, oneHundredMillis, 'same instant');
    }).not.toThrow();
  });
});

function lexicalLess(left: string, right: string): boolean {
  return left < right;
}
