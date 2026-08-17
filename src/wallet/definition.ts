import { SOLANA_MAINNET_GENESIS_HASH } from '../execution/constants.js';
import {
  WALLET_BACKEND,
  WALLET_CHALLENGE_DOMAIN,
  WALLET_CHALLENGE_PURPOSE,
  WALLET_CHECKPOINT,
  WALLET_SECRET_DECODED_BYTES,
  WALLET_SECRET_ENCODING,
  WALLET_SECRET_MAX_CHARS,
  WALLET_SECRET_SOURCE,
  WALLET_SIGNING_PURPOSES,
  WALLET_SPEC_NAME,
  WALLET_SPEC_VERSION,
} from './constants.js';

export type CanonicalWalletDefinition = {
  walletSpecVersion: string;
  walletSpecName: string;
  checkpoint: string;
  backend: {
    kind: 'interactive_memory';
    replaceableAbstraction: true;
    keychainKmsHsm: 'documented_future_backend_only';
    remoteSigner: false;
    browserWallet: false;
    unattendedProduction: false;
    rawKeypairNotABusinessDependency: true;
  };
  secretSource: {
    kind: 'hidden_tty';
    ttyRequired: true;
    envPrivateKey: false;
    secretFile: false;
    mnemonic: false;
    seedPhrase: false;
    clipboard: false;
    argv: false;
    pipedStdin: false;
    redirectedStdin: false;
    filesystemDiscovery: false;
    solanaCliDefaultIdJson: false;
  };
  secretFormat: {
    encoding: 'base58';
    decodedByteLength: 64;
    acceptMnemonic: false;
    acceptJsonIntegerArray: false;
    accept32ByteSeed: false;
    acceptHex: false;
    acceptBase64: false;
    acceptCommaList: false;
    acceptFilePath: false;
    acceptEnvironmentVariable: false;
    maxInputChars: 88;
    normalizeMalformed: false;
    canonicalBase58Roundtrip: true;
    publicHalfMustMatchDerivedPrivate: true;
  };
  secretLifetime: {
    persistence: false;
    sqlite: false;
    env: false;
    file: false;
    globalCache: false;
    appConfig: false;
    scopedCallbackOnly: true;
    bestEffortByteZeroization: true;
    javascriptStringUnzeroizable: true;
    noRawSecretLogging: true;
    javascriptStringLocalOnly: true;
  };
  addressPolicy: {
    signerMustEqualConfiguredTaker: true;
    silentTakerRewrite: false;
    rebuildForUnexpectedWallet: false;
  };
  signingPurposes: readonly [
    'w15_self_test_challenge',
    'exact_e14_final_preflight_candidate',
  ];
  genericSigningOracle: false;
  publicBarrel: {
    genericSignerExport: false;
    decodeExport: false;
    rawSecretBufferExport: false;
    signArbitraryBytesExport: false;
    withInteractiveSignerExport: false;
  };
  tty: {
    restorePreviousRawState: true;
    restorePreviousPauseState: true;
    removeDataListener: true;
    ctrlCIsRawData: true;
    enterStopsChunkImmediately: true;
    writeOnlyToTtyOutput: true;
  };
  selfTest: {
    domainSeparated: true;
    domain: 'SolTradingBot';
    version: 'w15_v1';
    purpose: 'signer-self-test';
    arbitraryStdin: false;
    signMessageCommand: false;
  };
  preflightSigning: {
    requireSimulationPassed: true;
    exactCandidateBinding: true;
    blockhashRecheckBeforePrompt: true;
    blockhashRecheckBeforeSign: true;
    mainnetGenesisRequired: true;
    expectedMainnetGenesisHash: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
    noRebuildAfterUnlock: true;
    noFreshBlockhashAfterSimulation: true;
    noJupiterRefetchAfterUnlock: true;
    compiledRequiredSignerCount: 1;
    compiledRequiredSignerIsSignerAddress: true;
    feePayerIsSignerAddress: true;
    localSignatureVerification: true;
    reuseExactE14FinalCompiledTransaction: true;
    exactFinalMessageByteEquality: true;
    noRecompileAfterSimulation: true;
    postPromptNetwork: 'getBlockHeight_only';
    populatedRequiredSignatureCount: 1;
  };
  broadcast: {
    sendTransaction: false;
    sendRawTransaction: false;
    sendAndConfirmTransaction: false;
    sendAndConfirmTransactionFactory: false;
    jupiterExecute: false;
    jupiterSubmit: false;
    jito: false;
    sendBundle: false;
  };
  signedArtifact: {
    publicReturn: false;
    persist: false;
    print: false;
    commandApi: false;
    fingerprintOnly: true;
  };
  tradingEnabled: {
    mustRemainFalse: true;
    trueDoesNotEnableSigning: true;
    trueDoesNotEnableBroadcast: true;
  };
  dashboard: {
    frozenD13: true;
    unsigned: true;
    actionless: true;
    noWalletEndpoint: true;
    noUnlockButton: true;
    noSignButton: true;
    noSendButton: true;
    noConnectWallet: true;
  };
  automation: {
    automaticSigning: false;
    watcher: false;
    strategyBridge: false;
    paperSignalSigning: false;
    npmRunDevPrompt: false;
    npmRunDevSign: false;
    databaseWrites: false;
  };
  persistence: {
    schemaVersion: 7;
    migration008: false;
    walletsTable: false;
    walletKeysTable: false;
    signedTransactionsTable: false;
  };
  proofContract: {
    publicOnly: true;
    rawSecret: false;
    rawSignedWire: false;
    rawSignatureBytes: false;
    privateKey: false;
  };
  errorPolicy: {
    sanitization: true;
    secretSanitization: true;
    noSecretOnError: true;
  };
  identities: {
    noRandomIds: true;
    noTimestampInFingerprint: true;
    noSecretInFingerprint: true;
    noTtyAdapterInFingerprint: true;
    noMachineUsername: true;
    noFilePath: true;
    noApiKey: true;
    noRpcUrl: true;
  };
};

export function canonicalWalletDefinition(): CanonicalWalletDefinition {
  return {
    walletSpecVersion: WALLET_SPEC_VERSION,
    walletSpecName: WALLET_SPEC_NAME,
    checkpoint: WALLET_CHECKPOINT,
    backend: {
      kind: WALLET_BACKEND,
      replaceableAbstraction: true,
      keychainKmsHsm: 'documented_future_backend_only',
      remoteSigner: false,
      browserWallet: false,
      unattendedProduction: false,
      rawKeypairNotABusinessDependency: true,
    },
    secretSource: {
      kind: WALLET_SECRET_SOURCE,
      ttyRequired: true,
      envPrivateKey: false,
      secretFile: false,
      mnemonic: false,
      seedPhrase: false,
      clipboard: false,
      argv: false,
      pipedStdin: false,
      redirectedStdin: false,
      filesystemDiscovery: false,
      solanaCliDefaultIdJson: false,
    },
    secretFormat: {
      encoding: WALLET_SECRET_ENCODING,
      decodedByteLength: WALLET_SECRET_DECODED_BYTES,
      acceptMnemonic: false,
      acceptJsonIntegerArray: false,
      accept32ByteSeed: false,
      acceptHex: false,
      acceptBase64: false,
      acceptCommaList: false,
      acceptFilePath: false,
      acceptEnvironmentVariable: false,
      maxInputChars: WALLET_SECRET_MAX_CHARS,
      normalizeMalformed: false,
      canonicalBase58Roundtrip: true,
      publicHalfMustMatchDerivedPrivate: true,
    },
    secretLifetime: {
      persistence: false,
      sqlite: false,
      env: false,
      file: false,
      globalCache: false,
      appConfig: false,
      scopedCallbackOnly: true,
      bestEffortByteZeroization: true,
      javascriptStringUnzeroizable: true,
      noRawSecretLogging: true,
      javascriptStringLocalOnly: true,
    },
    addressPolicy: {
      signerMustEqualConfiguredTaker: true,
      silentTakerRewrite: false,
      rebuildForUnexpectedWallet: false,
    },
    signingPurposes: [...WALLET_SIGNING_PURPOSES],
    genericSigningOracle: false,
    publicBarrel: {
      genericSignerExport: false,
      decodeExport: false,
      rawSecretBufferExport: false,
      signArbitraryBytesExport: false,
      withInteractiveSignerExport: false,
    },
    tty: {
      restorePreviousRawState: true,
      restorePreviousPauseState: true,
      removeDataListener: true,
      ctrlCIsRawData: true,
      enterStopsChunkImmediately: true,
      writeOnlyToTtyOutput: true,
    },
    selfTest: {
      domainSeparated: true,
      domain: WALLET_CHALLENGE_DOMAIN,
      version: WALLET_SPEC_VERSION,
      purpose: WALLET_CHALLENGE_PURPOSE,
      arbitraryStdin: false,
      signMessageCommand: false,
    },
    preflightSigning: {
      requireSimulationPassed: true,
      exactCandidateBinding: true,
      blockhashRecheckBeforePrompt: true,
      blockhashRecheckBeforeSign: true,
      mainnetGenesisRequired: true,
      expectedMainnetGenesisHash: SOLANA_MAINNET_GENESIS_HASH,
      noRebuildAfterUnlock: true,
      noFreshBlockhashAfterSimulation: true,
      noJupiterRefetchAfterUnlock: true,
      compiledRequiredSignerCount: 1,
      compiledRequiredSignerIsSignerAddress: true,
      feePayerIsSignerAddress: true,
      localSignatureVerification: true,
      reuseExactE14FinalCompiledTransaction: true,
      exactFinalMessageByteEquality: true,
      noRecompileAfterSimulation: true,
      postPromptNetwork: 'getBlockHeight_only',
      populatedRequiredSignatureCount: 1,
    },
    broadcast: {
      sendTransaction: false,
      sendRawTransaction: false,
      sendAndConfirmTransaction: false,
      sendAndConfirmTransactionFactory: false,
      jupiterExecute: false,
      jupiterSubmit: false,
      jito: false,
      sendBundle: false,
    },
    signedArtifact: {
      publicReturn: false,
      persist: false,
      print: false,
      commandApi: false,
      fingerprintOnly: true,
    },
    tradingEnabled: {
      mustRemainFalse: true,
      trueDoesNotEnableSigning: true,
      trueDoesNotEnableBroadcast: true,
    },
    dashboard: {
      frozenD13: true,
      unsigned: true,
      actionless: true,
      noWalletEndpoint: true,
      noUnlockButton: true,
      noSignButton: true,
      noSendButton: true,
      noConnectWallet: true,
    },
    automation: {
      automaticSigning: false,
      watcher: false,
      strategyBridge: false,
      paperSignalSigning: false,
      npmRunDevPrompt: false,
      npmRunDevSign: false,
      databaseWrites: false,
    },
    persistence: {
      schemaVersion: 7,
      migration008: false,
      walletsTable: false,
      walletKeysTable: false,
      signedTransactionsTable: false,
    },
    proofContract: {
      publicOnly: true,
      rawSecret: false,
      rawSignedWire: false,
      rawSignatureBytes: false,
      privateKey: false,
    },
    errorPolicy: {
      sanitization: true,
      secretSanitization: true,
      noSecretOnError: true,
    },
    identities: {
      noRandomIds: true,
      noTimestampInFingerprint: true,
      noSecretInFingerprint: true,
      noTtyAdapterInFingerprint: true,
      noMachineUsername: true,
      noFilePath: true,
      noApiKey: true,
      noRpcUrl: true,
    },
  };
}

export function mutateCanonicalWalletDefinition(
  mutate: (definition: CanonicalWalletDefinition) => void,
): CanonicalWalletDefinition {
  const definition = structuredClone(canonicalWalletDefinition());
  mutate(definition);
  return definition;
}
