import { createHash } from 'node:crypto';
import {
  RW0_COST_MODEL,
  RW0_EXECUTION_MODEL,
  RW0_EXIT_SPEC_VERSION,
  RW0_SHADOW_PAPER_SPEC_VERSION,
  RW0_SPEC_VERSION,
  RECOVERY_V0_SIGNAL_VERSION,
} from './constants.js';
import {
  canonicalRecoveryV0Signal,
  canonicalRecoveryWatcherDefinition,
  canonicalRw0Exit,
  canonicalRw0ShadowPaper,
  type CanonicalRecoveryV0Signal,
  type CanonicalRecoveryWatcherDefinition,
  type CanonicalRw0Exit,
  type CanonicalRw0ShadowPaper,
} from './definition.js';
import { RecoveryWatcherError } from './errors.js';
export { RW0_SAFETY_SPEC_FINGERPRINT } from './safety.js';
import type {
  CompletenessGate,
  RecoveryCostModel,
  RecoveryEpisodeState,
  RecoveryExecutionModel,
  ResearchTrack,
  SafetyGateStatus,
} from './types.js';

export function fingerprintCanonicalJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

export function fingerprintRecoveryV0Signal(
  definition: CanonicalRecoveryV0Signal = canonicalRecoveryV0Signal(),
): string {
  return fingerprintCanonicalJson(definition);
}

export function fingerprintRw0ShadowPaper(
  definition: CanonicalRw0ShadowPaper = canonicalRw0ShadowPaper(),
): string {
  return fingerprintCanonicalJson(definition);
}

export function fingerprintRw0Exit(definition: CanonicalRw0Exit = canonicalRw0Exit()): string {
  return fingerprintCanonicalJson(definition);
}

export function fingerprintRecoveryWatcherDefinition(
  definition: CanonicalRecoveryWatcherDefinition = canonicalRecoveryWatcherDefinition(),
): string {
  return fingerprintCanonicalJson(definition);
}

export const RECOVERY_V0_SIGNAL_FINGERPRINT = fingerprintRecoveryV0Signal();
export const RW0_SHADOW_PAPER_FINGERPRINT = fingerprintRw0ShadowPaper();
export const RW0_EXIT_FINGERPRINT = fingerprintRw0Exit();
export const RW0_WATCHER_DEFINITION_FINGERPRINT = fingerprintRecoveryWatcherDefinition();

export function recoveryEpisodeId(input: {
  mint: string;
  pairAddress: string;
  dipObservedAt: string;
  signalFingerprint: string;
}): string {
  return fingerprintCanonicalJson({
    mint: input.mint,
    pairAddress: input.pairAddress,
    dipObservedAt: input.dipObservedAt,
    signalFingerprint: input.signalFingerprint,
  });
}

export function recoveryScreeningId(input: {
  mint: string;
  screenedAt: string;
  signalFingerprint: string;
  watcherSpecFingerprint: string;
}): string {
  return fingerprintCanonicalJson({
    mint: input.mint,
    screenedAt: input.screenedAt,
    signalFingerprint: input.signalFingerprint,
    watcherSpecFingerprint: input.watcherSpecFingerprint,
  });
}

export function fingerprintTransitionEvent(input: {
  episodeId: string;
  fromState: RecoveryEpisodeState | null;
  toState: RecoveryEpisodeState;
  at: string;
  reason: string;
  payload: unknown;
}): string {
  return fingerprintCanonicalJson({
    episodeId: input.episodeId,
    fromState: input.fromState,
    toState: input.toState,
    at: input.at,
    reason: input.reason,
    payload: input.payload,
  });
}

export function transitionRequestPayload(request: {
  recoveryConfirmedAt?: string;
  recoveryConfirmationPriceUsd?: number;
  recoveryConfirmationLiquidityUsd?: number;
  recoveryConfirmationVolume5mUsd?: number;
  recoveryConfirmationVolumeToLiquidity5m?: number;
  observationPairAddress?: string;
  safetyCompletedAt?: string;
  holderStatus?: string;
  bundleStatus?: string;
  creatorStatus?: string;
  shadowEntryAt?: string;
  shadowEntryPriceUsd?: number;
  safeEntryAt?: string;
  safeEntryPriceUsd?: number;
  safeEntryObservationCollectedAt?: string;
  closeEvidence?: unknown;
}): unknown {
  return {
    recoveryConfirmedAt: request.recoveryConfirmedAt ?? null,
    recoveryConfirmationPriceUsd: request.recoveryConfirmationPriceUsd ?? null,
    recoveryConfirmationLiquidityUsd: request.recoveryConfirmationLiquidityUsd ?? null,
    recoveryConfirmationVolume5mUsd: request.recoveryConfirmationVolume5mUsd ?? null,
    recoveryConfirmationVolumeToLiquidity5m:
      request.recoveryConfirmationVolumeToLiquidity5m ?? null,
    observationPairAddress: request.observationPairAddress ?? null,
    safetyCompletedAt: request.safetyCompletedAt ?? null,
    holderStatus: request.holderStatus ?? null,
    bundleStatus: request.bundleStatus ?? null,
    creatorStatus: request.creatorStatus ?? null,
    shadowEntryAt: request.shadowEntryAt ?? null,
    shadowEntryPriceUsd: request.shadowEntryPriceUsd ?? null,
    safeEntryAt: request.safeEntryAt ?? null,
    safeEntryPriceUsd: request.safeEntryPriceUsd ?? null,
    safeEntryObservationCollectedAt: request.safeEntryObservationCollectedAt ?? null,
    closeEvidence: request.closeEvidence ?? null,
  };
}

export function assertPersistedRw0Identity(input: {
  state: RecoveryEpisodeState;
  track: ResearchTrack;
  completenessGate: CompletenessGate;
  holderStatus: SafetyGateStatus;
  bundleStatus: SafetyGateStatus;
  creatorStatus: SafetyGateStatus;
  signalVersion: string;
  signalFingerprint: string;
  watcherSpecVersion: string;
  watcherSpecFingerprint: string;
  shadowPaperSpecVersion: string;
  shadowPaperFingerprint: string;
  exitSpecVersion: string;
  exitFingerprint: string;
  costModel: string;
  executionModel: string;
  safetyCompletedAt: string | null;
  shadowEntryAt: string | null;
  shadowEntryPriceUsd: number | null;
  safeEntryAt: string | null;
  safeEntryPriceUsd: number | null;
  safeEntryObservationCollectedAt: string | null;
}): void {
  if (input.state === 'PAPER_ELIGIBLE' || input.state === 'PAPER_OPEN') {
    throw new RecoveryWatcherError(
      'Persisted PAPER_ELIGIBLE/PAPER_OPEN is unreachable in the safety-evidence-only watcher. Definition mismatch.',
      { code: 'definition_mismatch' },
    );
  }
  if (input.state === 'CLOSED') {
    throw new RecoveryWatcherError(
      'Persisted CLOSED is unreachable in rw0_v1. Shadow exit execution is not implemented.',
      { code: 'definition_mismatch' },
    );
  }
  if (input.completenessGate === 'PASS') {
    throw new RecoveryWatcherError(
      'Persisted completeness_gate PASS is unreachable in the safety-evidence-only watcher. Definition mismatch.',
      { code: 'definition_mismatch' },
    );
  }
  if (input.track === 'safety_approved') {
    throw new RecoveryWatcherError(
      'Persisted track safety_approved is unreachable in rw0_v1. Definition mismatch.',
      { code: 'definition_mismatch' },
    );
  }
  if (
    input.holderStatus !== 'UNKNOWN' ||
    input.bundleStatus !== 'UNKNOWN' ||
    input.creatorStatus !== 'UNKNOWN'
  ) {
    throw new RecoveryWatcherError(
      'Episode summary safety columns must remain UNKNOWN; decisions are reduced from canonical persisted evidence.',
      { code: 'definition_mismatch' },
    );
  }
  if (
    input.safeEntryAt !== null ||
    input.safeEntryPriceUsd !== null ||
    input.safeEntryObservationCollectedAt !== null
  ) {
    throw new RecoveryWatcherError(
      'Persisted safe_entry fields must remain NULL in rw0_v1. Definition mismatch.',
      { code: 'definition_mismatch' },
    );
  }
  if (input.safetyCompletedAt !== null) {
    throw new RecoveryWatcherError(
      'Persisted safety_completed_at must remain NULL in rw0_v1. Definition mismatch.',
      { code: 'definition_mismatch' },
    );
  }
  if (input.state === 'SHADOW_RESEARCH_OPEN') {
    if (input.track !== 'shadow') {
      throw new RecoveryWatcherError(
        'Persisted SHADOW_RESEARCH_OPEN must remain on the shadow track.',
        { code: 'definition_mismatch' },
      );
    }
    if (input.shadowEntryAt === null || input.shadowEntryPriceUsd === null) {
      throw new RecoveryWatcherError(
        'Persisted SHADOW_RESEARCH_OPEN requires shadow entry evidence.',
        { code: 'definition_mismatch' },
      );
    }
    if (input.completenessGate !== 'FAIL') {
      throw new RecoveryWatcherError(
        'Persisted SHADOW_RESEARCH_OPEN must keep completeness_gate FAIL.',
        { code: 'definition_mismatch' },
      );
    }
  }
  if (
    (input.state === 'DISCOVERED' ||
      input.state === 'DIP_CANDIDATE' ||
      input.state === 'RECOVERY_WATCH' ||
      input.state === 'SIGNAL_PENDING_SAFETY') &&
    input.track !== 'none'
  ) {
    throw new RecoveryWatcherError(
      'Persisted non-shadow creation states must not load as shadow or safety-approved.',
      { code: 'definition_mismatch' },
    );
  }
  if (
    input.track === 'shadow' &&
    (input.shadowEntryAt === null || input.shadowEntryPriceUsd === null)
  ) {
    throw new RecoveryWatcherError('Persisted shadow track requires shadow entry evidence.', {
      code: 'definition_mismatch',
    });
  }
  if (
    input.signalVersion !== RECOVERY_V0_SIGNAL_VERSION ||
    input.signalFingerprint !== RECOVERY_V0_SIGNAL_FINGERPRINT
  ) {
    throw new RecoveryWatcherError(
      'Persisted recovery signal identity does not match the frozen watcher signal.',
      {
        code: 'definition_mismatch',
      },
    );
  }
  if (
    input.watcherSpecVersion !== RW0_SPEC_VERSION ||
    input.watcherSpecFingerprint !== RW0_WATCHER_DEFINITION_FINGERPRINT
  ) {
    throw new RecoveryWatcherError('Persisted recovery watcher identity does not match rw0_v2.', {
      code: 'definition_mismatch',
    });
  }
  if (
    input.shadowPaperSpecVersion !== RW0_SHADOW_PAPER_SPEC_VERSION ||
    input.shadowPaperFingerprint !== RW0_SHADOW_PAPER_FINGERPRINT
  ) {
    throw new RecoveryWatcherError('Persisted shadow paper identity does not match rw0_v1.', {
      code: 'definition_mismatch',
    });
  }
  if (
    input.exitSpecVersion !== RW0_EXIT_SPEC_VERSION ||
    input.exitFingerprint !== RW0_EXIT_FINGERPRINT
  ) {
    throw new RecoveryWatcherError('Persisted exit spec identity does not match rw0_v1.', {
      code: 'definition_mismatch',
    });
  }
  if (input.costModel !== RW0_COST_MODEL) {
    throw new RecoveryWatcherError('Persisted cost_model does not match rw0_v1 none.', {
      code: 'definition_mismatch',
    });
  }
  if (input.executionModel !== RW0_EXECUTION_MODEL) {
    throw new RecoveryWatcherError(
      'Persisted execution_model does not match rw0_v1 discrete observed price.',
      {
        code: 'definition_mismatch',
      },
    );
  }
}

export function assertFrozenScreeningIdentity(input: {
  signalVersion: string;
  signalFingerprint: string;
  watcherSpecVersion: string;
  watcherSpecFingerprint: string;
}): void {
  if (
    input.signalVersion !== RECOVERY_V0_SIGNAL_VERSION ||
    input.signalFingerprint !== RECOVERY_V0_SIGNAL_FINGERPRINT
  ) {
    throw new RecoveryWatcherError('Screening signal identity does not match frozen recovery_v0.', {
      code: 'definition_mismatch',
    });
  }
  if (
    input.watcherSpecVersion !== RW0_SPEC_VERSION ||
    input.watcherSpecFingerprint !== RW0_WATCHER_DEFINITION_FINGERPRINT
  ) {
    throw new RecoveryWatcherError('Screening watcher identity does not match frozen rw0_v2.', {
      code: 'definition_mismatch',
    });
  }
}

export function asRecoveryCostModel(value: string): RecoveryCostModel {
  if (value !== RW0_COST_MODEL) {
    throw new RecoveryWatcherError('Persisted cost_model does not match rw0_v1 none.', {
      code: 'definition_mismatch',
    });
  }
  return value;
}

export function asRecoveryExecutionModel(value: string): RecoveryExecutionModel {
  if (value !== RW0_EXECUTION_MODEL) {
    throw new RecoveryWatcherError(
      'Persisted execution_model does not match rw0_v1 discrete observed price.',
      {
        code: 'definition_mismatch',
      },
    );
  }
  return value;
}
