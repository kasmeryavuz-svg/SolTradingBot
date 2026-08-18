import {
  LIVE_BROADCAST_RISK_STATUSES,
  LIVE_MAY_HAVE_SENT_STATUSES,
  LIVE_UNRESOLVED_STATUSES,
} from './constants.js';
import type { LiveAttemptStatus } from './types.js';

const RISK = new Set<string>(LIVE_BROADCAST_RISK_STATUSES);
const MAYBE_SENT = new Set<string>(LIVE_MAY_HAVE_SENT_STATUSES);
const UNRESOLVED = new Set<string>(LIVE_UNRESOLVED_STATUSES);

export function isBroadcastRiskStatus(status: LiveAttemptStatus): boolean {
  return RISK.has(status);
}

export function mayHaveBeenSent(status: LiveAttemptStatus): boolean {
  return MAYBE_SENT.has(status);
}

export function isReconcileEligibleStatus(status: LiveAttemptStatus): boolean {
  return UNRESOLVED.has(status);
}

export function existingAttemptMaySendAgain(status: LiveAttemptStatus): false {
  void status;
  return false;
}
