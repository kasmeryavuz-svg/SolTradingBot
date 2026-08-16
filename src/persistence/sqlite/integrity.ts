import type { PersistenceIntegrity } from '../types.js';

export function interpretIntegrityPragmas(
  quickCheck: string,
  foreignKeyViolationCount: number,
): PersistenceIntegrity {
  if (quickCheck === 'ok' && foreignKeyViolationCount === 0) {
    return { ok: true, detail: 'ok' };
  }

  return { ok: false, detail: 'integrity check failed' };
}
