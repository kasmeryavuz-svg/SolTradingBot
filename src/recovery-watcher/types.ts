import {
  ACTIVE_RECOVERY_EPISODE_STATES,
  RECOVERY_EPISODE_STATES,
  RESEARCH_TRACKS,
  RW0_WATCH_SLOT_STATES,
  SAFETY_GATE_STATUSES,
  SHADOW_CLOSE_REASONS,
  SHADOW_EXIT_ACTIONS,
  TERMINAL_BEFORE_COOLDOWN_STATES,
  RW0_DIP_FILTER_RESULTS,
  RW0_SCREENING_DISPOSITIONS,
} from './constants.js';

export type RecoveryEpisodeState = (typeof RECOVERY_EPISODE_STATES)[number];
export type ActiveRecoveryEpisodeState = (typeof ACTIVE_RECOVERY_EPISODE_STATES)[number];
export type WatchSlotState = (typeof RW0_WATCH_SLOT_STATES)[number];
export type TerminalBeforeCooldownState = (typeof TERMINAL_BEFORE_COOLDOWN_STATES)[number];
export type SafetyGateStatus = (typeof SAFETY_GATE_STATUSES)[number];
export type ResearchTrack = (typeof RESEARCH_TRACKS)[number];
export type CompletenessGate = 'FAIL' | 'PASS' | 'NOT_EVALUATED';
export type RecoveryCostModel = 'none';
export type RecoveryExecutionModel = 'discrete_observed_price_no_quote';
export type ShadowCloseReason = (typeof SHADOW_CLOSE_REASONS)[number];
export type ShadowExitAction = (typeof SHADOW_EXIT_ACTIONS)[number];
export type ScreeningDisposition = (typeof RW0_SCREENING_DISPOSITIONS)[number];
export type ScreeningDipFilterResult = (typeof RW0_DIP_FILTER_RESULTS)[number];

export type RecoveryClock = {
  now: () => Date;
};

export type RecoveryProcessLiveness = {
  isAlive: (pid: number) => boolean;
};

export type RecoveryProcessIdentity = {
  pid: number;
  processStartedAtMs: number;
};

export type RecoveryLockRecord = {
  specVersion: string;
  specFingerprint: string;
  pid: number;
  processStartedAtMs: number;
  runtimeStartedAt: string;
};

export type RecoveryWatcherConfig = {
  tradingEnabled: boolean;
  liveBroadcastEnabled: boolean;
  databasePath: string;
  configuredProductionDatabasePath: string;
  networkTimeoutMs: number;
  screeningMaxCandidates: number;
};

export type SafetyEvidenceKind = 'holder' | 'bundle' | 'creator' | 'token_rights' | 'liquidity_execution' | 'other';

export type DipFilterResult =
  | { kind: 'pass' }
  | { kind: 'reject_filter'; reason: string }
  | { kind: 'reject_incomplete'; reason: string }
  | { kind: 'reject_invalid'; reason: string };

export type RecoveryConfirmationResult =
  | { kind: 'confirmed'; volumeToLiquidity5m: number }
  | { kind: 'not_yet'; reason: string }
  | { kind: 'incomplete'; reason: string }
  | { kind: 'invalid'; reason: string };

export type CloseEvidence = {
  /**
   * Instant of the observed exit market snapshot.
   * If an exit path is later implemented, this must be the same instant as
   * `observationCollectedAt` and the persisted `rw0_market_observations.collected_at`.
   */
  observedAt: string;
  pairAddress: string;
  observedPriceUsd: number;
  reason: ShadowCloseReason;
  /**
   * Identity of the persisted market observation used as the exit snapshot.
   * In rw0_v1 this must not be a second unrelated timestamp: it identifies the
   * same observation as `observedAt`.
   */
  observationCollectedAt: string;
};

export type RecoveryEpisode = {
  episodeId: string;
  mint: string;
  pairAddress: string;
  dipObservedAt: string;
  signalVersion: string;
  signalFingerprint: string;
  watcherSpecVersion: string;
  watcherSpecFingerprint: string;
  shadowPaperSpecVersion: string;
  shadowPaperFingerprint: string;
  exitSpecVersion: string;
  exitFingerprint: string;
  state: RecoveryEpisodeState;
  track: ResearchTrack;
  safetyIncomplete: boolean;
  completenessGate: CompletenessGate;
  holderStatus: SafetyGateStatus;
  bundleStatus: SafetyGateStatus;
  creatorStatus: SafetyGateStatus;
  costModel: RecoveryCostModel;
  executionModel: RecoveryExecutionModel;
  dipPriceUsd: number | null;
  dipLiquidityUsd: number | null;
  dipVolume5mUsd: number | null;
  dipPriceChange5mPct: number | null;
  dipVolumeToLiquidity5m: number | null;
  recoveryConfirmedAt: string | null;
  recoveryConfirmationPriceUsd: number | null;
  recoveryConfirmationLiquidityUsd: number | null;
  recoveryConfirmationVolume5mUsd: number | null;
  recoveryConfirmationVolumeToLiquidity5m: number | null;
  watchStartedAt: string | null;
  lastTransitionEventId: string;
  lastFromState: RecoveryEpisodeState | null;
  safetyCompletedAt: string | null;
  shadowEntryAt: string | null;
  shadowEntryPriceUsd: number | null;
  safeEntryAt: string | null;
  safeEntryPriceUsd: number | null;
  safeEntryObservationCollectedAt: string | null;
  closedAt: string | null;
  closePriceUsd: number | null;
  closeReason: ShadowCloseReason | null;
  closeObservationCollectedAt: string | null;
  cooldownUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TransitionRequest = {
  to: RecoveryEpisodeState;
  at: string;
  reason: string;
  recoveryConfirmedAt?: string;
  recoveryConfirmationPriceUsd?: number;
  recoveryConfirmationLiquidityUsd?: number;
  recoveryConfirmationVolume5mUsd?: number;
  recoveryConfirmationVolumeToLiquidity5m?: number;
  observationPairAddress?: string;
  safetyCompletedAt?: string;
  holderStatus?: SafetyGateStatus;
  bundleStatus?: SafetyGateStatus;
  creatorStatus?: SafetyGateStatus;
  shadowEntryAt?: string;
  shadowEntryPriceUsd?: number;
  safeEntryAt?: string;
  safeEntryPriceUsd?: number;
  safeEntryObservationCollectedAt?: string;
  closeEvidence?: CloseEvidence;
};

export type TransitionContext = {
  now: Date;
  concurrentWatchCount?: number;
};

export type TransitionResult = {
  episode: RecoveryEpisode;
  fromState: RecoveryEpisodeState;
  toState: RecoveryEpisodeState;
  at: string;
  reason: string;
  eventId: string;
  idempotent: boolean;
};

export type PersistTransitionExpected = {
  updatedAt: string;
  state?: RecoveryEpisodeState;
};

export type CreateEpisodeInput = {
  mint: string;
  pairAddress: string;
  dipObservedAt: string;
  createdAt: string;
  dipPriceUsd?: number | null;
  dipLiquidityUsd?: number | null;
  dipVolume5mUsd?: number | null;
  dipPriceChange5mPct?: number | null;
  dipVolumeToLiquidity5m?: number | null;
};

export type MarketObservationRecord = {
  episodeId: string;
  mint: string;
  pairAddress: string;
  collectedAt: string;
  provider: string;
  source: string;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume5mUsd: number | null;
  priceChange5mPct: number | null;
  signalVersion: string;
  signalFingerprint: string;
  watcherSpecVersion: string;
  watcherSpecFingerprint: string;
};

export type SafetyEvidenceRecord = {
  episodeId: string;
  kind: SafetyEvidenceKind;
  status: SafetyGateStatus;
  observedAt: string;
  provider: string | null;
  provenance: string | null;
  notes: string | null;
};

export type ShadowPositionRecord = {
  episodeId: string;
  openedAt: string;
  entryPriceUsd: number;
  entryObservationCollectedAt: string;
  pairAddress: string;
  safetyIncomplete: true;
  completenessGate: 'FAIL';
  liveReadiness: false;
  costModel: RecoveryCostModel;
  executionModel: RecoveryExecutionModel;
};

export type ShadowExitObservationRecord = {
  episodeId: string;
  observedAt: string;
  pairAddress: string;
  observedPriceUsd: number | null;
  thresholdPriceUsd: number | null;
  overshootPct: number | null;
  gapFlag: boolean;
  action: ShadowExitAction;
};

export type PersistObservationResult = {
  idempotent: boolean;
};

export type ScreeningObservationRecord = {
  screeningId: string;
  mint: string;
  screenedAt: string;
  discoverySources: string;
  provider: string | null;
  source: string | null;
  pairAddress: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume5mUsd: number | null;
  priceChange5mPct: number | null;
  signalVersion: string;
  signalFingerprint: string;
  watcherSpecVersion: string;
  watcherSpecFingerprint: string;
  dipFilterResult: ScreeningDipFilterResult;
  disposition: ScreeningDisposition;
  reason: string;
  collectedAtIsLocalCollectionTime: true;
};

export type RecoveryCycleMetrics = {
  at: string;
  discoveryCalls: number;
  discoveryFailures: number;
  candidatesDiscovered: number;
  candidatesDeduped: number;
  candidatesSelected: number;
  candidatesSkippedCap: number;
  candidatesEnriched: number;
  candidatesEnrichmentFailed: number;
  activeWatchesAtStart: number;
  marketFetchSuccesses: number;
  marketFetchFailures: number;
  confirmations: number;
  expiries: number;
  rejectedSafetyUnknown: number;
  providerFailures: number;
  screeningByDisposition: Record<ScreeningDisposition, number>;
  dipFilterPassCount: number;
  candidatesSkippedBudget: number;
  screeningBudgetExhausted: boolean;
};

export type RecoveryReportSnapshot = {
  screeningCount: number;
  screeningByDisposition: Record<ScreeningDisposition, number>;
  dipFilterPassCount: number;
  dipFilterNotDipCount: number;
  dipFilterIncompleteCount: number;
  dipFilterNotEvaluatedCount: number;
  admittedWatchCount: number;
  activeWatchCount: number;
  confirmedRecoveryCount: number;
  rejectedSafetyUnknownCount: number;
  expiredCount: number;
  marketUnavailableCount: number;
  firstObservationAt: string | null;
  lastObservationAt: string | null;
  shadowPositionCount: number;
  paperStateCount: number;
  closedStateCount: number;
};
