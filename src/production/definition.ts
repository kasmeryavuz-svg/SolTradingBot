import {
  DEFAULT_PROD20_HEALTH_PORT,
  DEFAULT_PROD20_INTERVAL_MS,
  FROZEN_A12_DEFINITION_FINGERPRINT,
  FROZEN_B08_DEFINITION_FINGERPRINT,
  FROZEN_COST17_DEFINITION_FINGERPRINT,
  FROZEN_D13_DEFINITION_FINGERPRINT,
  FROZEN_E14_DEFINITION_FINGERPRINT,
  FROZEN_L16_DEFINITION_FINGERPRINT,
  FROZEN_ML19_DEFINITION_FINGERPRINT,
  FROZEN_ML19_FEATURE_FINGERPRINT,
  FROZEN_O17_DEFINITION_FINGERPRINT,
  FROZEN_P09_DEFINITION_FINGERPRINT,
  FROZEN_PM10_DEFINITION_FINGERPRINT,
  FROZEN_R125_DEFINITION_FINGERPRINT,
  FROZEN_S07_DEFINITION_FINGERPRINT,
  FROZEN_W15_DEFINITION_FINGERPRINT,
  FROZEN_WI18_DEFINITION_FINGERPRINT,
  FROZEN_X11_DEFINITION_FINGERPRINT,
  FORBIDDEN_MIGRATION_010_PREFIX,
  PROD20_CHECKPOINT,
  PROD20_HEALTH_HOST,
  PROD20_INTERVAL_MS_MAX,
  PROD20_INTERVAL_MS_MIN,
  PROD20_LOCK_FILE_NAME,
  PROD20_REDACTED_URL_TOKEN,
  PROD20_MAX_CONSECUTIVE_FAILED_CYCLES,
  PROD20_MAX_WATCHLIST,
  PROD20_SPEC_NAME,
  PROD20_SPEC_VERSION,
  REQUIRED_SCHEMA_VERSION,
} from './constants.js';

export type CanonicalProductionDefinition = {
  specVersion: string;
  specName: string;
  checkpoint: string;
  schema: {
    version: number;
    migration010: 'ABSENT';
    forbiddenMigrationPrefix: string;
  };
  upstreamFingerprints: {
    s07: string;
    b08: string;
    p09: string;
    pm10: string;
    x11: string;
    a12: string;
    r125: string;
    d13: string;
    e14: string;
    w15: string;
    l16: string;
    o17: string;
    cost17: string;
    wi18: string;
    ml19: string;
    ml19FeatureFingerprint: string;
  };
  capability: {
    paperOnly: true;
    dataCollection: true;
    automaticLiveTrading: false;
    manualCp16Live: 'SEPARATE';
    mlProductionInput: false;
    walletIntelligenceProductionInput: false;
    noSigner: true;
    noPrivateKey: true;
    noMnemonic: true;
    noTransactionBuilding: true;
    noJupiterExecution: true;
    noSendTransaction: true;
    noJito: true;
    noLivePreviewAutomation: true;
    noLiveExecuteAutomation: true;
    noImportLive: true;
    noImportWallet: true;
    noImportExecution: true;
  };
  liveGates: {
    refuseTradingEnabledTrue: true;
    refuseLiveBroadcastEnabledTrue: true;
    failClosedBeforeNetwork: true;
    failClosedBeforeDbWrite: true;
  };
  scheduler: {
    kind: 'fixed_delay';
    defaultIntervalMs: number;
    minIntervalMs: number;
    maxIntervalMs: number;
    noFixedRate: true;
    noCatchUp: true;
    noJitter: true;
    noMathRandom: true;
  };
  watchlist: {
    maxUniqueMints: number;
    ordering: 'stable_code_point_sort';
    requireWhenPaperEnabled: true;
    noTokenSymbols: true;
    noTokenNames: true;
    explicitOperatorOnly: true;
  };
  cycle: {
    serialExecution: true;
    collectorBeforePaper: true;
    oneOperationPerMint: true;
    openPositionSnapshotRule: 'exit_only_if_open_at_mint_start__position_only_if_closed_at_mint_start';
    noSameCycleCloseReopen: true;
    noPromiseAllWritableTasks: true;
  };
  failure: {
    maxConsecutiveFailedCycles: number;
    successResetsCounter: true;
    collectorFailureContinuesPaperIfDbHealthy: true;
    integrityConfigLockAreFatal: true;
    recoverableVsFatalTaxonomy: true;
    sqliteCodesFatal: true;
    persistenceErrorFatal: true;
    ambiguousFailClosed: true;
    lookupFailureFatal: true;
    fatalDoesNotWaitThreeCycles: true;
  };
  lock: {
    fileName: string;
    exclusiveCreate: true;
    staleDeadPidCleanup: true;
    malformedFailClosed: true;
    unknownIdentityFailClosed: true;
    releaseOnlyIfOwned: true;
    processInstanceIdentity: true;
    processStartedAtMsFromTimeOrigin: true;
    pidReuseDifferentStartIsStale: true;
    samePidSameStartIsDuplicate: true;
    foreignLivePidFailClosed: true;
    sameProcessDuplicateDoesNotRelease: true;
    posixMode0600BestEffort: true;
  };
  health: {
    host: string;
    defaultPort: number;
    neverAllInterfaces: true;
    healthzAlive200: true;
    readyzBeforeFirstCycle503: true;
    readyzAfterSuccess200: true;
    readyzAfterFailure503: true;
    readyzShuttingDown503: true;
    methods: readonly ['GET', 'HEAD'];
    noCors: true;
    bindFailureFatal: true;
    runtimeErrorFatal: true;
    noHeadlessWithoutHealth: true;
    postLockBindFailureReleasesOwnedLock: true;
  };
  logging: {
    jsonLines: true;
    allowlistedFieldsOnly: true;
    redactSecrets: true;
    noEnvDump: true;
    noAbsolutePaths: true;
    noRawErrorObjects: true;
    fullUrlRedaction: true;
    redactedUrlToken: typeof PROD20_REDACTED_URL_TOKEN;
  };
  docker: {
    multiStage: true;
    nonRoot: true;
    readOnlyRoot: true;
    capDropAll: true;
    noNewPrivileges: true;
    init: true;
    loopbackHealthBind: true;
    forceTradingEnabledFalse: true;
    forceLiveBroadcastEnabledFalse: true;
    noDockerSocket: true;
    noHostNetwork: true;
    noPrivileged: true;
    dockerHealthExposure: 'container_loopback_only_not_host_published';
    applicationHealthHost: '127.0.0.1';
    dockerHealthcheckUsesContainerLoopback: true;
    dockerPublishesHealthPort: false;
  };
};

export type CanonicalProductionDefinitionOverrides = Partial<CanonicalProductionDefinition>;

export function canonicalProductionDefinition(
  overrides: CanonicalProductionDefinitionOverrides = {},
): CanonicalProductionDefinition {
  return {
    specVersion: overrides.specVersion ?? PROD20_SPEC_VERSION,
    specName: overrides.specName ?? PROD20_SPEC_NAME,
    checkpoint: overrides.checkpoint ?? PROD20_CHECKPOINT,
    schema: {
      version: REQUIRED_SCHEMA_VERSION,
      migration010: 'ABSENT',
      forbiddenMigrationPrefix: FORBIDDEN_MIGRATION_010_PREFIX,
      ...overrides.schema,
    },
    upstreamFingerprints: {
      s07: FROZEN_S07_DEFINITION_FINGERPRINT,
      b08: FROZEN_B08_DEFINITION_FINGERPRINT,
      p09: FROZEN_P09_DEFINITION_FINGERPRINT,
      pm10: FROZEN_PM10_DEFINITION_FINGERPRINT,
      x11: FROZEN_X11_DEFINITION_FINGERPRINT,
      a12: FROZEN_A12_DEFINITION_FINGERPRINT,
      r125: FROZEN_R125_DEFINITION_FINGERPRINT,
      d13: FROZEN_D13_DEFINITION_FINGERPRINT,
      e14: FROZEN_E14_DEFINITION_FINGERPRINT,
      w15: FROZEN_W15_DEFINITION_FINGERPRINT,
      l16: FROZEN_L16_DEFINITION_FINGERPRINT,
      o17: FROZEN_O17_DEFINITION_FINGERPRINT,
      cost17: FROZEN_COST17_DEFINITION_FINGERPRINT,
      wi18: FROZEN_WI18_DEFINITION_FINGERPRINT,
      ml19: FROZEN_ML19_DEFINITION_FINGERPRINT,
      ml19FeatureFingerprint: FROZEN_ML19_FEATURE_FINGERPRINT,
      ...overrides.upstreamFingerprints,
    },
    capability: {
      paperOnly: true,
      dataCollection: true,
      automaticLiveTrading: false,
      manualCp16Live: 'SEPARATE',
      mlProductionInput: false,
      walletIntelligenceProductionInput: false,
      noSigner: true,
      noPrivateKey: true,
      noMnemonic: true,
      noTransactionBuilding: true,
      noJupiterExecution: true,
      noSendTransaction: true,
      noJito: true,
      noLivePreviewAutomation: true,
      noLiveExecuteAutomation: true,
      noImportLive: true,
      noImportWallet: true,
      noImportExecution: true,
      ...overrides.capability,
    },
    liveGates: {
      refuseTradingEnabledTrue: true,
      refuseLiveBroadcastEnabledTrue: true,
      failClosedBeforeNetwork: true,
      failClosedBeforeDbWrite: true,
      ...overrides.liveGates,
    },
    scheduler: {
      kind: 'fixed_delay',
      defaultIntervalMs: DEFAULT_PROD20_INTERVAL_MS,
      minIntervalMs: PROD20_INTERVAL_MS_MIN,
      maxIntervalMs: PROD20_INTERVAL_MS_MAX,
      noFixedRate: true,
      noCatchUp: true,
      noJitter: true,
      noMathRandom: true,
      ...overrides.scheduler,
    },
    watchlist: {
      maxUniqueMints: PROD20_MAX_WATCHLIST,
      ordering: 'stable_code_point_sort',
      requireWhenPaperEnabled: true,
      noTokenSymbols: true,
      noTokenNames: true,
      explicitOperatorOnly: true,
      ...overrides.watchlist,
    },
    cycle: {
      serialExecution: true,
      collectorBeforePaper: true,
      oneOperationPerMint: true,
      openPositionSnapshotRule: 'exit_only_if_open_at_mint_start__position_only_if_closed_at_mint_start',
      noSameCycleCloseReopen: true,
      noPromiseAllWritableTasks: true,
      ...overrides.cycle,
    },
    failure: {
      maxConsecutiveFailedCycles: PROD20_MAX_CONSECUTIVE_FAILED_CYCLES,
      successResetsCounter: true,
      collectorFailureContinuesPaperIfDbHealthy: true,
      integrityConfigLockAreFatal: true,
      recoverableVsFatalTaxonomy: true,
      sqliteCodesFatal: true,
      persistenceErrorFatal: true,
      ambiguousFailClosed: true,
      lookupFailureFatal: true,
      fatalDoesNotWaitThreeCycles: true,
      ...overrides.failure,
    },
    lock: {
      fileName: PROD20_LOCK_FILE_NAME,
      exclusiveCreate: true,
      staleDeadPidCleanup: true,
      malformedFailClosed: true,
      unknownIdentityFailClosed: true,
      releaseOnlyIfOwned: true,
      processInstanceIdentity: true,
      processStartedAtMsFromTimeOrigin: true,
      pidReuseDifferentStartIsStale: true,
      samePidSameStartIsDuplicate: true,
      foreignLivePidFailClosed: true,
      sameProcessDuplicateDoesNotRelease: true,
      posixMode0600BestEffort: true,
      ...overrides.lock,
    },
    health: {
      host: PROD20_HEALTH_HOST,
      defaultPort: DEFAULT_PROD20_HEALTH_PORT,
      neverAllInterfaces: true,
      healthzAlive200: true,
      readyzBeforeFirstCycle503: true,
      readyzAfterSuccess200: true,
      readyzAfterFailure503: true,
      readyzShuttingDown503: true,
      methods: ['GET', 'HEAD'],
      noCors: true,
      bindFailureFatal: true,
      runtimeErrorFatal: true,
      noHeadlessWithoutHealth: true,
      postLockBindFailureReleasesOwnedLock: true,
      ...overrides.health,
    },
    logging: {
      jsonLines: true,
      allowlistedFieldsOnly: true,
      redactSecrets: true,
      noEnvDump: true,
      noAbsolutePaths: true,
      noRawErrorObjects: true,
      fullUrlRedaction: true,
      redactedUrlToken: PROD20_REDACTED_URL_TOKEN,
      ...overrides.logging,
    },
    docker: {
      multiStage: true,
      nonRoot: true,
      readOnlyRoot: true,
      capDropAll: true,
      noNewPrivileges: true,
      init: true,
      loopbackHealthBind: true,
      forceTradingEnabledFalse: true,
      forceLiveBroadcastEnabledFalse: true,
      noDockerSocket: true,
      noHostNetwork: true,
      noPrivileged: true,
      dockerHealthExposure: 'container_loopback_only_not_host_published',
      applicationHealthHost: '127.0.0.1',
      dockerHealthcheckUsesContainerLoopback: true,
      dockerPublishesHealthPort: false,
      ...overrides.docker,
    },
  };
}

export function mutateCanonicalProductionDefinition(
  mutate: (definition: CanonicalProductionDefinition) => void,
): CanonicalProductionDefinition {
  const definition = structuredClone(canonicalProductionDefinition());
  mutate(definition);
  return definition;
}
