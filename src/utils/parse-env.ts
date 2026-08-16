export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function readOptionalEnv(
  source: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const raw = source[name];
  if (raw === undefined) {
    return undefined;
  }

  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function parseEnumValue<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  fallback: T,
  name: string,
): T {
  if (raw === undefined) {
    return fallback;
  }

  const normalized = raw.toLowerCase();
  const match = allowed.find((value) => value === normalized);
  if (match === undefined) {
    throw new ConfigError(
      `Invalid ${name}="${raw}". Expected one of: ${allowed.join(', ')}.`,
    );
  }

  return match;
}

export function parseBooleanFlag(
  raw: string | undefined,
  fallback: boolean,
  name: string,
): boolean {
  if (raw === undefined) {
    return fallback;
  }

  const normalized = raw.toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }

  throw new ConfigError(`Invalid ${name}="${raw}". Expected true or false.`);
}

export function parsePositiveInteger(
  raw: string | undefined,
  fallback: number,
  name: string,
): number {
  if (raw === undefined) {
    return fallback;
  }

  if (!/^\d+$/.test(raw)) {
    throw new ConfigError(`Invalid ${name}. Expected a positive integer.`);
  }

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`Invalid ${name}. Expected a positive integer.`);
  }

  return parsed;
}

export function parseBoundedPositiveInteger(
  raw: string | undefined,
  fallback: number,
  name: string,
  maximum: number,
): number {
  const parsed = parsePositiveInteger(raw, fallback, name);
  if (parsed > maximum) {
    throw new ConfigError(`Invalid ${name}. Expected a positive integer up to ${String(maximum)}.`);
  }

  return parsed;
}

export function parseHttpUrl(raw: string | undefined, fallback: string, name: string): string {
  const value = raw ?? fallback;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ConfigError(`Invalid ${name}. Expected an http or https URL.`);
    }
  } catch (error: unknown) {
    if (error instanceof ConfigError) {
      throw error;
    }
    throw new ConfigError(`Invalid ${name}. Expected an http or https URL.`);
  }

  return value;
}
