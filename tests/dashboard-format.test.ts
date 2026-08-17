import { describe, expect, it } from 'vitest';
import {
  formatCountDisplay,
  formatNullDisplay,
  formatPercentDisplay,
  formatUsdDisplay,
  serializeDashboardJson,
} from '../src/dashboard/index.js';
import { DashboardError } from '../src/dashboard/errors.js';

describe('dashboard display formatting', () => {
  it('keeps null as n/a and does not convert it to zero', () => {
    expect(formatNullDisplay(null)).toBe('n/a');
    expect(formatCountDisplay(null)).toBe('n/a');
    expect(formatUsdDisplay(null)).toBe('n/a');
    expect(formatPercentDisplay(null)).toBe('n/a');
    expect(formatUsdDisplay(0)).toBe('0');
    expect(formatUsdDisplay(-0)).toBe('0');
    expect(formatPercentDisplay(-0)).toBe('0.00%');
  });

  it('formats USD by magnitude without mutating the input', () => {
    const value = 1234.5678;
    expect(formatUsdDisplay(value)).toBe('1234.57');
    expect(value).toBe(1234.5678);
    expect(formatUsdDisplay(1.23456)).toBe('1.2346');
    expect(formatUsdDisplay(0.001234)).toBe('0.001234');
    expect(formatUsdDisplay(0.00000000123)).toBe('0.00000000123');
    expect(formatUsdDisplay(Number.NaN)).toBe('n/a');
    expect(formatUsdDisplay(Number.POSITIVE_INFINITY)).toBe('n/a');
    expect(formatCountDisplay(0)).toBe('0');
    expect(formatPercentDisplay(null)).toBe('n/a');
    expect(formatPercentDisplay(0)).toBe('0.00%');
  });
});

describe('dashboard JSON number safety', () => {
  it('refuses to serialize NaN and infinities', () => {
    expect(() => serializeDashboardJson({ value: Number.NaN })).toThrow(DashboardError);
    expect(() => serializeDashboardJson({ value: Number.POSITIVE_INFINITY })).toThrow(DashboardError);
    expect(() => serializeDashboardJson({ value: Number.NEGATIVE_INFINITY })).toThrow(DashboardError);
    expect(() => serializeDashboardJson({ nested: [{ value: Number.NaN }] })).toThrow(DashboardError);
    expect(() => serializeDashboardJson({ nested: { value: Number.POSITIVE_INFINITY } })).toThrow(
      DashboardError,
    );
    expect(serializeDashboardJson({ value: -0 })).toBe('{"value":0}');
  });
});
