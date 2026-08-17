import {
  DASHBOARD_ALLOWED_METHODS,
  DASHBOARD_API_ROUTES,
  DASHBOARD_AUTO_REFRESH_MS,
  DASHBOARD_BIND_HOST,
  DASHBOARD_CHECKPOINT,
  DASHBOARD_MARKET_LIMIT,
  DASHBOARD_RUNTIME_CLOSED_TRADE_LIMIT,
  DASHBOARD_SPEC_NAME,
  DASHBOARD_SPEC_VERSION,
  DASHBOARD_STATIC_ROUTES,
  FROZEN_A12_V1_DEFINITION_FINGERPRINT,
  FROZEN_B08_V1_DEFINITION_FINGERPRINT,
  FROZEN_P09_V1_DEFINITION_FINGERPRINT,
  FROZEN_PM10_V1_DEFINITION_FINGERPRINT,
  FROZEN_R125_V1_DEFINITION_FINGERPRINT,
  FROZEN_S07_V1_DEFINITION_FINGERPRINT,
  FROZEN_X11_V1_DEFINITION_FINGERPRINT,
  REQUIRED_SCHEMA_VERSION,
} from './constants.js';

export type CanonicalDashboardDefinition = {
  dashboardSpecVersion: string;
  dashboardSpecName: string;
  checkpoint: string;
  hostPolicy: {
    bindHost: '127.0.0.1';
    bindAllInterfaces: false;
    ipv6Any: false;
    hostEnvironmentOverride: false;
    acceptedHostHeaders: readonly ['127.0.0.1:<port>', 'localhost:<port>'];
    rejectUnexpectedHost: true;
  };
  httpPolicy: {
    allowedMethods: readonly ['GET', 'HEAD'];
    rejectedMethods: readonly ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE'];
    corsEnabled: false;
    accessControlAllowOriginWildcard: false;
    sameOriginBrowserApiOnly: true;
    genericRpcRoute: false;
    commandExecutionRoute: false;
    websocketCommandChannel: false;
    eval: false;
    childProcess: false;
  };
  networkPolicy: {
    dashboardDataServiceExternalHttp: false;
    solanaRpc: false;
    dexScreener: false;
    jupiter: false;
    jito: false;
    helius: false;
    birdeye: false;
    dexTools: false;
    coinGecko: false;
    thirdPartyHttpApi: false;
    solanaHealthCheckInsideDashboardRequests: false;
    externalBrowserAssets: false;
    cdn: false;
  };
  configExposure: {
    sanitizedOnly: true;
    solanaRpcUrl: false;
    processEnvDump: false;
    privateKeys: false;
    stackTraces: false;
    absoluteUserHomePaths: false;
    allowed: readonly [
      'nodeEnv',
      'solanaNetwork',
      'databaseEnabled',
      'databaseFilenameBasename',
      'discoveryEnabled',
      'configuredMarketTokenCount',
      'checkpoint',
      'dashboardSpecVersion',
    ];
  };
  databasePolicy: {
    readOnly: true;
    pragmaQueryOnly: true;
    initialize: false;
    createMissingFile: false;
    recordFunctions: false;
    migration008: false;
    requiredSchemaVersion: number;
    missingFile: 'start_and_show_unavailable';
    schemaBelowRequired: 'incompatible_no_mutate';
  };
  sectionContract: readonly [
    'meta',
    'safety',
    'configuration',
    'database',
    'coverage',
    'market',
    'runtimePaper',
    'performance',
    'research',
    'dataQuality',
  ];
  routeContract: {
    api: readonly string[];
    static: readonly string[];
    methods: readonly string[];
  };
  upstreamReuse: {
    performance: 'a12_executePerformanceReport';
    research: 'r125_executeResearchCompare';
    requiredS07Fingerprint: string;
    requiredB08Fingerprint: string;
    requiredP09Fingerprint: string;
    requiredPm10Fingerprint: string;
    requiredX11Fingerprint: string;
    requiredA12Fingerprint: string;
    requiredR125Fingerprint: string;
    dashboardWideAtomicSemanticSnapshot: false;
    sectionsRebuiltIndependentlyReadOnly: true;
  };
  mutations: {
    buy: false;
    sell: false;
    openPosition: false;
    closePosition: false;
    paperStep: false;
    positionStep: false;
    exitStep: false;
    startCollectors: false;
    changeStrategyThresholds: false;
    changeConfiguration: false;
    enableTrading: false;
    wallets: false;
    sendTransactions: false;
  };
  tradingControls: {
    present: false;
    tradingCapability: 'DISABLED';
    walletCapability: 'NOT_IMPLEMENTED';
    executionCapability: 'NOT_IMPLEMENTED';
  };
  securityHeaders: {
    contentSecurityPolicy: string;
    xContentTypeOptions: 'nosniff';
    referrerPolicy: 'no-referrer';
    xFrameOptions: 'DENY';
    cacheControl: 'no-store';
    permissionsPolicy: string;
  };
  errorResponseBehavior: {
    noStackTrace: true;
    noSql: true;
    noAbsolutePath: true;
    noSecrets: true;
    optionalSectionFailureIsolated: true;
    finiteJsonNumbersRequired: true;
  };
  refreshBehavior: {
    manualRefreshIsReadOnly: true;
    autoRefreshMs: number;
    autoRefreshReloadsDashboardJsonOnly: true;
    liveMarketClaim: false;
    wording: 'latest_stored_observation';
    staleResponseSuppression: 'abort_previous_or_monotonic_sequence';
    singleAutoRefreshTimer: true;
    manualRefreshDoesNotCreateTimer: true;
  };
  queryParameterPolicy: {
    unexpectedQueryParameters: 'reject_400';
    noHiddenResearchCherryPick: true;
  };
  requestTargetPolicy: {
    rejectAbsoluteForm: true;
    usePathAfterHostValidationOnly: true;
    noRedirectToRequestHost: true;
  };
  hostHeaderPolicy: {
    exactParseEquality: true;
    ipv4LoopbackWithPort: true;
    localhostCaseInsensitiveWithPort: true;
    rejectMissingPort: true;
    rejectTrailingDotLocalhost: true;
    rejectIpv6Loopback: true;
    rejectDuplicatedHostArray: true;
  };
  staticAssetPolicy: {
    allowlistOnly: true;
    noFilesystemPathFromUrl: true;
  };
  databaseHealthPolicy: {
    integrityCheckOnlyOnDatabaseHealthRoute: true;
    dashboardSnapshotSkipsUpstreamIntegrityPragmas: true;
  };
  tradingEnabledRefusal: {
    refuseStart: true;
    listenerNeverOpens: true;
    presentation: 'checkpoint_13_read_only';
  };
  displayLimits: {
    recentMarkets: number;
    recentRuntimeClosedTrades: number;
    openPositions: 'all_current_open';
    limitsDoNotChangeA12: true;
    limitsDoNotChangeR125: true;
  };
  researchPresentation: {
    candidateOrder: 'canonical_candidateId_registry_order';
    sortByPnl: false;
    sortByReturn: false;
    sortByWinRate: false;
    sortByProfitFactor: false;
    sortByCompletedCount: false;
    ranking: false;
    winnerBadge: false;
    bestStrategy: false;
    recommendedStrategy: false;
  };
};

export const DASHBOARD_CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

export const DASHBOARD_PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=()';

export function canonicalDashboardDefinition(): CanonicalDashboardDefinition {
  return {
    dashboardSpecVersion: DASHBOARD_SPEC_VERSION,
    dashboardSpecName: DASHBOARD_SPEC_NAME,
    checkpoint: DASHBOARD_CHECKPOINT,
    hostPolicy: {
      bindHost: DASHBOARD_BIND_HOST,
      bindAllInterfaces: false,
      ipv6Any: false,
      hostEnvironmentOverride: false,
      acceptedHostHeaders: ['127.0.0.1:<port>', 'localhost:<port>'],
      rejectUnexpectedHost: true,
    },
    httpPolicy: {
      allowedMethods: DASHBOARD_ALLOWED_METHODS,
      rejectedMethods: ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE'],
      corsEnabled: false,
      accessControlAllowOriginWildcard: false,
      sameOriginBrowserApiOnly: true,
      genericRpcRoute: false,
      commandExecutionRoute: false,
      websocketCommandChannel: false,
      eval: false,
      childProcess: false,
    },
    networkPolicy: {
      dashboardDataServiceExternalHttp: false,
      solanaRpc: false,
      dexScreener: false,
      jupiter: false,
      jito: false,
      helius: false,
      birdeye: false,
      dexTools: false,
      coinGecko: false,
      thirdPartyHttpApi: false,
      solanaHealthCheckInsideDashboardRequests: false,
      externalBrowserAssets: false,
      cdn: false,
    },
    configExposure: {
      sanitizedOnly: true,
      solanaRpcUrl: false,
      processEnvDump: false,
      privateKeys: false,
      stackTraces: false,
      absoluteUserHomePaths: false,
      allowed: [
        'nodeEnv',
        'solanaNetwork',
        'databaseEnabled',
        'databaseFilenameBasename',
        'discoveryEnabled',
        'configuredMarketTokenCount',
        'checkpoint',
        'dashboardSpecVersion',
      ],
    },
    databasePolicy: {
      readOnly: true,
      pragmaQueryOnly: true,
      initialize: false,
      createMissingFile: false,
      recordFunctions: false,
      migration008: false,
      requiredSchemaVersion: REQUIRED_SCHEMA_VERSION,
      missingFile: 'start_and_show_unavailable',
      schemaBelowRequired: 'incompatible_no_mutate',
    },
    sectionContract: [
      'meta',
      'safety',
      'configuration',
      'database',
      'coverage',
      'market',
      'runtimePaper',
      'performance',
      'research',
      'dataQuality',
    ],
    routeContract: {
      api: [...DASHBOARD_API_ROUTES],
      static: [...DASHBOARD_STATIC_ROUTES],
      methods: [...DASHBOARD_ALLOWED_METHODS],
    },
    upstreamReuse: {
      performance: 'a12_executePerformanceReport',
      research: 'r125_executeResearchCompare',
      requiredS07Fingerprint: FROZEN_S07_V1_DEFINITION_FINGERPRINT,
      requiredB08Fingerprint: FROZEN_B08_V1_DEFINITION_FINGERPRINT,
      requiredP09Fingerprint: FROZEN_P09_V1_DEFINITION_FINGERPRINT,
      requiredPm10Fingerprint: FROZEN_PM10_V1_DEFINITION_FINGERPRINT,
      requiredX11Fingerprint: FROZEN_X11_V1_DEFINITION_FINGERPRINT,
      requiredA12Fingerprint: FROZEN_A12_V1_DEFINITION_FINGERPRINT,
      requiredR125Fingerprint: FROZEN_R125_V1_DEFINITION_FINGERPRINT,
      dashboardWideAtomicSemanticSnapshot: false,
      sectionsRebuiltIndependentlyReadOnly: true,
    },
    mutations: {
      buy: false,
      sell: false,
      openPosition: false,
      closePosition: false,
      paperStep: false,
      positionStep: false,
      exitStep: false,
      startCollectors: false,
      changeStrategyThresholds: false,
      changeConfiguration: false,
      enableTrading: false,
      wallets: false,
      sendTransactions: false,
    },
    tradingControls: {
      present: false,
      tradingCapability: 'DISABLED',
      walletCapability: 'NOT_IMPLEMENTED',
      executionCapability: 'NOT_IMPLEMENTED',
    },
    securityHeaders: {
      contentSecurityPolicy: DASHBOARD_CONTENT_SECURITY_POLICY,
      xContentTypeOptions: 'nosniff',
      referrerPolicy: 'no-referrer',
      xFrameOptions: 'DENY',
      cacheControl: 'no-store',
      permissionsPolicy: DASHBOARD_PERMISSIONS_POLICY,
    },
    errorResponseBehavior: {
      noStackTrace: true,
      noSql: true,
      noAbsolutePath: true,
      noSecrets: true,
      optionalSectionFailureIsolated: true,
      finiteJsonNumbersRequired: true,
    },
    refreshBehavior: {
      manualRefreshIsReadOnly: true,
      autoRefreshMs: DASHBOARD_AUTO_REFRESH_MS,
      autoRefreshReloadsDashboardJsonOnly: true,
      liveMarketClaim: false,
      wording: 'latest_stored_observation',
      staleResponseSuppression: 'abort_previous_or_monotonic_sequence',
      singleAutoRefreshTimer: true,
      manualRefreshDoesNotCreateTimer: true,
    },
    queryParameterPolicy: {
      unexpectedQueryParameters: 'reject_400',
      noHiddenResearchCherryPick: true,
    },
    requestTargetPolicy: {
      rejectAbsoluteForm: true,
      usePathAfterHostValidationOnly: true,
      noRedirectToRequestHost: true,
    },
    hostHeaderPolicy: {
      exactParseEquality: true,
      ipv4LoopbackWithPort: true,
      localhostCaseInsensitiveWithPort: true,
      rejectMissingPort: true,
      rejectTrailingDotLocalhost: true,
      rejectIpv6Loopback: true,
      rejectDuplicatedHostArray: true,
    },
    staticAssetPolicy: {
      allowlistOnly: true,
      noFilesystemPathFromUrl: true,
    },
    databaseHealthPolicy: {
      integrityCheckOnlyOnDatabaseHealthRoute: true,
      dashboardSnapshotSkipsUpstreamIntegrityPragmas: true,
    },
    tradingEnabledRefusal: {
      refuseStart: true,
      listenerNeverOpens: true,
      presentation: 'checkpoint_13_read_only',
    },
    displayLimits: {
      recentMarkets: DASHBOARD_MARKET_LIMIT,
      recentRuntimeClosedTrades: DASHBOARD_RUNTIME_CLOSED_TRADE_LIMIT,
      openPositions: 'all_current_open',
      limitsDoNotChangeA12: true,
      limitsDoNotChangeR125: true,
    },
    researchPresentation: {
      candidateOrder: 'canonical_candidateId_registry_order',
      sortByPnl: false,
      sortByReturn: false,
      sortByWinRate: false,
      sortByProfitFactor: false,
      sortByCompletedCount: false,
      ranking: false,
      winnerBadge: false,
      bestStrategy: false,
      recommendedStrategy: false,
    },
  };
}

export function mutateCanonicalDashboardDefinition(
  mutate: (definition: CanonicalDashboardDefinition) => void,
): CanonicalDashboardDefinition {
  const definition = structuredClone(canonicalDashboardDefinition());
  mutate(definition);
  return definition;
}
