export function formatNullDisplay(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'n/a';
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return 'n/a';
  }
  return String(value);
}

export function formatCountDisplay(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'n/a';
  }
  const signed = Object.is(value, -0) ? 0 : value;
  return String(Math.trunc(signed));
}

export function formatUsdDisplay(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'n/a';
  }
  const signed = Object.is(value, -0) ? 0 : value;
  const magnitude = Math.abs(signed);
  if (magnitude === 0) {
    return '0';
  }
  if (magnitude >= 1000) {
    return signed.toFixed(2);
  }
  if (magnitude >= 1) {
    return signed.toFixed(4);
  }
  if (magnitude >= 0.0001) {
    return signed.toFixed(6);
  }
  if (magnitude >= 1e-8) {
    return signed.toFixed(8);
  }
  const exponent = Math.floor(Math.log10(magnitude));
  const decimals = Math.min(18, Math.max(8, -exponent + 2));
  return trimTrailingZeros(signed.toFixed(decimals));
}

export function formatPercentDisplay(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'n/a';
  }
  const signed = Object.is(value, -0) ? 0 : value;
  return `${signed.toFixed(2)}%`;
}

function trimTrailingZeros(text: string): string {
  if (!text.includes('.')) {
    return text;
  }
  return text.replace(/0+$/, '').replace(/\.$/, '');
}

export function abbreviateIdentity(value: string): string {
  if (value.length <= 16) {
    return value;
  }
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function abbreviateFingerprint(value: string): string {
  if (value.length <= 16) {
    return value;
  }
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}
