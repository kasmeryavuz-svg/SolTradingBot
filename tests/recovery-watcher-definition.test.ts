import { describe, expect, it } from 'vitest';
import {
  RECOVERY_V0_MAX_PRICE_CHANGE_5M_PCT,
  RECOVERY_V0_MAX_VOLUME_TO_LIQUIDITY_5M_EXCLUSIVE,
  RECOVERY_V0_MIN_CONFIRMATION_LIQUIDITY_USD,
  RECOVERY_V0_MIN_DIP_VOLUME_5M_USD,
  RECOVERY_V0_MIN_PRICE_CHANGE_5M_PCT,
  RECOVERY_V0_MIN_VOLUME_TO_LIQUIDITY_5M,
  RECOVERY_V0_SIGNAL_VERSION,
  RW0_COOLDOWN_MS,
  RW0_EXIT_SPEC_VERSION,
  RW0_SHADOW_PAPER_SPEC_VERSION,
  RW0_SPEC_VERSION,
  RW0_SAFETY_SPEC_VERSION,
  RW0_WATCH_CADENCE_MS,
  RW0_WATCH_TTL_MS,
} from '../src/recovery-watcher/constants.js';
import {
  canonicalRecoveryV0Signal,
  canonicalRecoveryWatcherDefinition,
  mutateCanonicalRecoveryV0Signal,
  mutateCanonicalRecoveryWatcherDefinition,
  mutateCanonicalRw0Exit,
  mutateCanonicalRw0ShadowPaper,
} from '../src/recovery-watcher/definition.js';
import { recoveryMigrationSqlDigest } from '../src/recovery-watcher/db/migrations.js';
import {
  fingerprintRecoveryV0Signal,
  fingerprintRecoveryWatcherDefinition,
  fingerprintRw0Exit,
  fingerprintRw0ShadowPaper,
  RECOVERY_V0_SIGNAL_FINGERPRINT,
  RW0_EXIT_FINGERPRINT,
  RW0_SHADOW_PAPER_FINGERPRINT,
  RW0_WATCHER_DEFINITION_FINGERPRINT,
  RW0_SAFETY_SPEC_FINGERPRINT,
} from '../src/recovery-watcher/identity.js';

describe('rw0_v3 frozen definitions', () => {
  it('freezes spec names and deterministic fingerprints', () => {
    expect(RW0_SPEC_VERSION).toBe('rw0_v3');
    expect(RW0_SAFETY_SPEC_VERSION).toBe('rw0_safety_v2');
    expect(RECOVERY_V0_SIGNAL_VERSION).toBe('recovery_v0');
    expect(RW0_SHADOW_PAPER_SPEC_VERSION).toBe('rw0_shadow_paper_v0');
    expect(RW0_EXIT_SPEC_VERSION).toBe('rw0_exit_v0');
    expect(RW0_WATCH_CADENCE_MS).toBe(60_000);
    expect(RW0_WATCH_TTL_MS).toBe(7_200_000);
    expect(RW0_COOLDOWN_MS).toBe(7_200_000);
    expect(RW0_WATCH_TTL_MS).toBe(RW0_COOLDOWN_MS);
    expect(RECOVERY_V0_SIGNAL_FINGERPRINT).toBe(
      '4e91a7d77a4e1699c5263b99dc468d3b579816525a6232e17eb966d5d0f6c06b',
    );
    expect(RW0_SHADOW_PAPER_FINGERPRINT).toBe(
      'f934384aaa87864778013613ec1bfe82dddb4428ffcbb41d4e54b9d5acbe93d5',
    );
    expect(RW0_EXIT_FINGERPRINT).toBe(
      'fda2db41481e11970451621c9c162ed14555c648a1c496bc81a2dd0a21f023f4',
    );
    expect(RW0_SAFETY_SPEC_FINGERPRINT).toBe(
      'f4282f42d979fcd8f1682f5223be72b8a3476c78875e164826cf0ac4ff2fe808',
    );
    expect(RW0_WATCHER_DEFINITION_FINGERPRINT).toBe(
      'ef65622c7b4b70790c16d959d5de69dcdb34a76f2d877ca58672ab779ba184db',
    );
    expect(recoveryMigrationSqlDigest(1)).toBe(
      '84832895ff70d1d6362058699a2301ed590eb3b5e6ce70bf598b2eb41060f234',
    );
    expect(recoveryMigrationSqlDigest(2)).toBe(
      'bea11ee4cb756d12560b238e205085d0c9446f2d3ad80934e87c0e68ab9a626a',
    );
    expect(fingerprintRecoveryV0Signal()).toBe(RECOVERY_V0_SIGNAL_FINGERPRINT);
    expect(fingerprintRecoveryWatcherDefinition()).toBe(RW0_WATCHER_DEFINITION_FINGERPRINT);
    expect(fingerprintRw0ShadowPaper()).toBe(RW0_SHADOW_PAPER_FINGERPRINT);
    expect(fingerprintRw0Exit()).toBe(RW0_EXIT_FINGERPRINT);
    expect(fingerprintRecoveryV0Signal(canonicalRecoveryV0Signal())).toBe(
      RECOVERY_V0_SIGNAL_FINGERPRINT,
    );
    expect(fingerprintRecoveryWatcherDefinition(canonicalRecoveryWatcherDefinition())).toBe(
      RW0_WATCHER_DEFINITION_FINGERPRINT,
    );
  });

  it('binds the recovery migration digest into the watcher fingerprint', () => {
    expect(canonicalRecoveryWatcherDefinition().recoveryMigrationSqlDigest).toBe(
      recoveryMigrationSqlDigest(2),
    );
    expect(
      fingerprintRecoveryWatcherDefinition(
        mutateCanonicalRecoveryWatcherDefinition((definition) => {
          definition.recoveryMigrationSqlDigest = '0'.repeat(64);
        }),
      ),
    ).not.toBe(RW0_WATCHER_DEFINITION_FINGERPRINT);
  });

  it('changes the signal fingerprint when a frozen threshold changes', () => {
    expect(
      fingerprintRecoveryV0Signal(
        mutateCanonicalRecoveryV0Signal((definition) => {
          definition.recoveryConfirmation.liquidityUsd.minInclusive =
            RECOVERY_V0_MIN_CONFIRMATION_LIQUIDITY_USD + 1;
        }),
      ),
    ).not.toBe(RECOVERY_V0_SIGNAL_FINGERPRINT);
    expect(
      fingerprintRecoveryV0Signal(
        mutateCanonicalRecoveryV0Signal((definition) => {
          definition.dipObservation.volume5mUsd.minInclusive =
            RECOVERY_V0_MIN_DIP_VOLUME_5M_USD + 1;
        }),
      ),
    ).not.toBe(RECOVERY_V0_SIGNAL_FINGERPRINT);
    expect(
      fingerprintRecoveryV0Signal(
        mutateCanonicalRecoveryV0Signal((definition) => {
          definition.dipObservation.priceChange5mPct.minInclusive =
            RECOVERY_V0_MIN_PRICE_CHANGE_5M_PCT - 1;
        }),
      ),
    ).not.toBe(RECOVERY_V0_SIGNAL_FINGERPRINT);
    expect(
      fingerprintRecoveryV0Signal(
        mutateCanonicalRecoveryV0Signal((definition) => {
          definition.dipObservation.priceChange5mPct.maxInclusive =
            RECOVERY_V0_MAX_PRICE_CHANGE_5M_PCT + 1;
        }),
      ),
    ).not.toBe(RECOVERY_V0_SIGNAL_FINGERPRINT);
    expect(
      fingerprintRecoveryV0Signal(
        mutateCanonicalRecoveryV0Signal((definition) => {
          definition.recoveryConfirmation.volumeToLiquidity5m.minInclusive =
            RECOVERY_V0_MIN_VOLUME_TO_LIQUIDITY_5M + 0.1;
        }),
      ),
    ).not.toBe(RECOVERY_V0_SIGNAL_FINGERPRINT);
    expect(
      fingerprintRecoveryV0Signal(
        mutateCanonicalRecoveryV0Signal((definition) => {
          definition.recoveryConfirmation.volumeToLiquidity5m.maxExclusive =
            RECOVERY_V0_MAX_VOLUME_TO_LIQUIDITY_5M_EXCLUSIVE + 1;
        }),
      ),
    ).not.toBe(RECOVERY_V0_SIGNAL_FINGERPRINT);
  });

  it('changes watcher fingerprint when operational constants or nested specs change', () => {
    expect(
      fingerprintRecoveryWatcherDefinition(
        mutateCanonicalRecoveryWatcherDefinition((definition) => {
          definition.operational.watchCadenceMs = 30_000;
        }),
      ),
    ).not.toBe(RW0_WATCHER_DEFINITION_FINGERPRINT);
    expect(
      fingerprintRecoveryWatcherDefinition(
        mutateCanonicalRecoveryWatcherDefinition((definition) => {
          definition.operational.cooldownMs = RW0_COOLDOWN_MS + 1;
        }),
      ),
    ).not.toBe(RW0_WATCHER_DEFINITION_FINGERPRINT);
    expect(
      fingerprintRecoveryWatcherDefinition(
        mutateCanonicalRecoveryWatcherDefinition((definition) => {
          definition.operational.maxConcurrentWatches = 11;
        }),
      ),
    ).not.toBe(RW0_WATCHER_DEFINITION_FINGERPRINT);
    expect(
      fingerprintRw0ShadowPaper(
        mutateCanonicalRw0ShadowPaper((definition) => {
          definition.liveReadiness = true as unknown as false;
        }),
      ),
    ).not.toBe(RW0_SHADOW_PAPER_FINGERPRINT);
    expect(
      fingerprintRw0Exit(
        mutateCanonicalRw0Exit((definition) => {
          definition.intendedComparatorWhenImplemented.stopLossBps = 500;
        }),
      ),
    ).not.toBe(RW0_EXIT_FINGERPRINT);
  });

  it('binds unproven signal, distinct shadow/paper tracks, unreachable safe paper, and unresolved safety gates', () => {
    const definition = canonicalRecoveryWatcherDefinition();
    expect(definition.signal.unproven).toBe(true);
    expect(definition.signal.notProfitableClaim).toBe(true);
    expect(definition.signal.historicalPercentagesAreNotProofOfNewExecutionRegime).toBe(true);
    expect(definition.signal.historicalSampleCadence).toBe(
      'sparse_approximately_5_minute_observations',
    );
    expect(definition.signal.forwardObservationCadenceMs).toBe(60_000);
    expect(definition.signal.dipObservation.liquidityUsdNotADipGate).toBe(true);
    expect(definition.shadowPaper.neverCountsAsPaperEligible).toBe(true);
    expect(definition.shadowPaper.neverCountsAsPaperOpen).toBe(true);
    expect(definition.shadowPaper.onlySimulationPathInRw0V1).toBe(true);
    expect(definition.safePaperReachableInRw0V1).toBe(false);
    expect(definition.completenessGatePassUnreachableInRw0V1).toBe(true);
    expect(definition.holderGate).toBe('persisted_fail_closed');
    expect(definition.bundleGate).toBe('persisted_fail_closed');
    expect(definition.discoveryCoverageComplete).toBe(false);
    expect(definition.largestRealHolderPctImplemented).toBe(true);
    expect(definition.linkedBundlePctImplemented).toBe(true);
    expect(definition.unexplainedTop20RemainderDoesNotProveHiddenSingleAccountOverTenPercent).toBe(
      true,
    );
    expect(definition.safePaperEntry.unimplementedInRw0V1).toBe(true);
    expect(
      definition.safePaperEntry.neverBackfillRecoveryConfirmationPriceIfSafetyCompletedLater,
    ).toBe(true);
    expect(definition.automaticLiveTrading).toBe(false);
    expect(definition.migration010).toBe('ABSENT');
    expect(definition.productionSchemaMustRemain9).toBe(true);
    expect(
      definition.signal.recoveryConfirmation
        .legalOnlyWhenRecoveryConfirmedAtStrictlyBeforeWatchExpiresAt,
    ).toBe(true);
    expect(definition.signal.recoveryConfirmation.exactWatchExpiryBoundaryBelongsToExpired).toBe(
      true,
    );
    expect(definition.operational.confirmationMustBindPersistedMarketObservation).toBe(true);
    expect(definition.operational.closedFromShadowReachableInRw0V1).toBe(false);
    expect(definition.operational.exitExecutionImplementedInRw0V1).toBe(false);
    expect(definition.operational.safetyEvidenceReducerImplemented).toBe(true);
    expect(definition.shadowPaper.cannotClosedInRw0V1).toBe(true);
    expect(definition.exit.exitExecutionImplementedInRw0V1).toBe(false);
    expect(definition.exit.closedFromShadowReachableInRw0V1).toBe(false);
    expect(definition.exit.unimplementedUntilDedicatedShadowExitSlice).toBe(true);
    expect(
      definition.exit.intendedComparatorWhenImplemented.closedRequiresObservedExitEvidence,
    ).toBe(true);
    expect(
      definition.exit.intendedComparatorWhenImplemented
        .observedAtAndObservationCollectedAtAreTheSameInstant,
    ).toBe(true);
    expect(
      definition.exit.intendedComparatorWhenImplemented.maxHoldingExitsAsClosedNotExpired,
    ).toBe(true);
    expect(definition.operational.networkedForwardObservationImplemented).toBe(true);
    expect(definition.operational.screeningIndependentOfEpisodes).toBe(true);
    expect(definition.operational.slice2DoesNotOpenShadowResearch).toBe(true);
    expect(definition.operational.confirmationDrainsToRejectedSafetyUnknown).toBe(true);
    expect(definition.operational.collectedAtIsLocalCollectionTime).toBe(true);
  });
});
