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
