import { DashboardError } from './errors.js';

export function assertJsonSafe(value: unknown, path = '$'): void {
  if (value === undefined) {
    throw new DashboardError(`Cannot serialize undefined at ${path}.`);
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new DashboardError(`Cannot serialize non-finite number at ${path}.`);
    }
    return;
  }
  if (typeof value === 'bigint') {
    throw new DashboardError(`Cannot serialize bigint at ${path}.`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertJsonSafe(item, `${path}[${String(index)}]`);
    });
    return;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      assertJsonSafe(nested, `${path}.${key}`);
    }
    return;
  }
  throw new DashboardError(`Cannot serialize value at ${path}.`);
}

export function serializeDashboardJson(value: unknown): string {
  assertJsonSafe(value);
  return JSON.stringify(value);
}
