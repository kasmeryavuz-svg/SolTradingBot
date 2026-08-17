import { createHash } from 'node:crypto';
import { canonicalDashboardDefinition, type CanonicalDashboardDefinition } from './definition.js';

export function fingerprintDashboardDefinition(
  definition: CanonicalDashboardDefinition = canonicalDashboardDefinition(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export const DASHBOARD_DEFINITION_FINGERPRINT = fingerprintDashboardDefinition();
