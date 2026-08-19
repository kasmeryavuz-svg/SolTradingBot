import { createHash } from 'node:crypto';
import { canonicalProductionDefinition, type CanonicalProductionDefinition } from './definition.js';
import { ProductionError } from './errors.js';

export function fingerprintProductionDefinition(
  definition: CanonicalProductionDefinition = canonicalProductionDefinition(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export const PROD20_DEFINITION_FINGERPRINT = fingerprintProductionDefinition();

export function assertProductionDefinitionFingerprint(
  expected: string = PROD20_DEFINITION_FINGERPRINT,
): void {
  const actual = fingerprintProductionDefinition();
  if (actual !== expected) {
    throw new ProductionError(
      'definition_mismatch',
      'Production definition fingerprint mismatch. The compiled prod20 identity does not match the frozen v1 definition.',
    );
  }
}
