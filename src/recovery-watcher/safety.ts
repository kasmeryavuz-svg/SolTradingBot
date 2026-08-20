import { createHash } from 'node:crypto';
import {
  hasPauseAuthority,
  isDefaultAccountStateFrozen,
  isMintCloseAuthority,
  isNonTransferable,
  isPausablePaused,
  isPermanentDelegateActive,
  isTransferFeeConfigured,
  isTransferHookActive,
} from '../risk/extensions.js';
import { isPlausibleSolanaMint } from '../utils/solana-mint.js';
import {
  RW0_HOLDER_MAX_PCT,
  RW0_LINKED_BUNDLE_MAX_PCT,
  RW0_SAFETY_SPEC_NAME,
  RW0_SAFETY_SPEC_VERSION,
} from './constants.js';
import { assertNotFuture, assertTimestampOrder } from './clock.js';
import { RecoveryWatcherError } from './errors.js';
import type {
  BundleSafetyPayload,
  CreatorSafetyPayload,
  HolderSafetyPayload,
  SafetyEvidencePayload,
  SafetyEvidenceRecord,
  SafetyGateKind,
  SafetyGateStatus,
  TokenRightsSafetyPayload,
} from './types.js';
import type { TokenExtensionObservation } from '../risk/types.js';

export const RW0_SAFETY_GATE_KINDS = ['token_rights', 'holder', 'bundle', 'creator'] as const;

export function canonicalRecoverySafetySpec() {
  return {
    specVersion: RW0_SAFETY_SPEC_VERSION,
    specName: RW0_SAFETY_SPEC_NAME,
    evidenceOnly: true,
    paperEligibleReachable: false,
    paperOpenReachable: false,
    decisionFromPersistedCanonicalEvidenceOnly: true,
    genericTransitionApiCannotProduceSafetyRejection: true,
    strictRuntimePayloadValidation: true,
    evidenceBinding: [
      'episode_id',
      'mint',
      'pinned_pair',
      'confirmation_observed_at',
      'confirmation_event_id',
      'signal_identity',
      'watcher_identity',
      'safety_identity',
    ],
    chronology: {
      confirmationAtOrBeforeObservedAt: true,
      observedAtAtOrBeforeCollectedAt: true,
      collectedAtAtOrBeforeDecisionAt: true,
      futureEvidenceRejected: true,
      backfillBeforeConfirmationRejected: true,
    },
    tokenRights: {
      cp05FactualExtensionParsersReused: true,
      dangerousOrIncompatibleCapability: 'FAIL',
      incompleteUnsupportedOrUnclassified: 'UNKNOWN',
      passRequiresCompleteAcceptableFacts: true,
    },
    holder: {
      maxPctInclusive: RW0_HOLDER_MAX_PCT,
      numerator: 'largest_nonexcluded_beneficial_owner_aggregate_raw',
      denominator: 'total_supply_minus_positively_identified_excluded_token_account_balances',
      accountAggregationKey: 'beneficial_owner',
      top20OnlyCanPass: false,
      exclusionsRequireKindSubjectSourceAndTimestamp: true,
      incompleteCoverageAtOrBelowThreshold: 'UNKNOWN',
      observedLowerBoundAboveThreshold: 'FAIL',
      hardGateComparison: 'exact_bigint_ratio',
      unavailableEconomics: 'null_supply_and_denominator',
    },
    bundle: {
      maxPctInclusive: RW0_LINKED_BUNDLE_MAX_PCT,
      numerator: 'sum_of_persisted_rule_members_raw',
      denominator: 'effective_circulating_supply',
      heuristicClusterIsOwnership: false,
      persistRuleMembersNumeratorDenominatorProvenanceConfidenceCompleteness: true,
      incompleteGraph: 'UNKNOWN',
      hardGateComparison: 'exact_bigint_ratio',
      unavailableEconomics: 'null_denominator',
    },
    creator: {
      missingTrustworthyIdentity: 'UNKNOWN',
      guessingForbidden: true,
      passRequiresTrustworthyIdentityCompleteControlledAccountGraphAndNoRetainedControl: true,
      retainedControlCapability: 'FAIL',
    },
    reducer: {
      anyFail: 'REJECTED_SAFETY',
      noFailAnyUnknown: 'REJECTED_SAFETY_UNKNOWN',
      allPassInEvidenceOnlySlice: 'REJECTED_SAFETY_UNKNOWN',
    },
  } as const;
}

export const RW0_SAFETY_SPEC_FINGERPRINT = createHash('sha256')
  .update(JSON.stringify(canonicalRecoverySafetySpec()), 'utf8')
  .digest('hex');

export function evaluateSafetyPayload(payload: SafetyEvidencePayload): {
  status: SafetyGateStatus;
  reason: string;
  percentage: number | null;
} {
  return evaluateCanonicalSafetyPayload(validateSafetyPayload(payload));
}

function evaluateCanonicalSafetyPayload(payload: SafetyEvidencePayload): {
  status: SafetyGateStatus;
  reason: string;
  percentage: number | null;
} {
  switch (payload.kind) {
    case 'token_rights':
      return evaluateTokenRights(payload);
    case 'holder':
      return evaluateHolder(payload);
    case 'bundle':
      return evaluateBundle(payload);
    case 'creator':
      return evaluateCreator(payload);
  }
}

export function safetyEvidenceId(input: Omit<SafetyEvidenceRecord, 'evidenceId'>): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalEvidenceIdentity(input)), 'utf8')
    .digest('hex');
}

export function canonicalizeSafetyEvidence(
  input: Omit<SafetyEvidenceRecord, 'evidenceId' | 'status' | 'reason'> & {
    evidenceId?: string;
    status?: SafetyGateStatus;
    reason?: string;
  },
  now: Date,
): SafetyEvidenceRecord {
  if (
    typeof input.kind !== 'string' ||
    !(RW0_SAFETY_GATE_KINDS as readonly string[]).includes(input.kind)
  ) {
    throw evidenceError('Unsupported safety evidence kind.');
  }
  const payload = validateSafetyPayload(input.payload);
  if (input.kind !== payload.kind) {
    throw evidenceError('Safety evidence outer kind must match payload kind.');
  }
  nonEmpty(input.episodeId, 'Safety evidence episodeId');
  nonEmpty(input.confirmationEventId, 'Safety evidence confirmationEventId');
  assertAddress(input.mint, 'Safety evidence mint');
  assertAddress(input.pairAddress, 'Safety evidence pair');
  assertNotFuture(input.observedAt, now, 'safety evidence observedAt');
  assertNotFuture(input.collectedAt, now, 'safety evidence collectedAt');
  assertTimestampOrder(
    input.confirmationObservedAt,
    input.observedAt,
    'Safety evidence cannot be observed before recovery confirmation.',
  );
  assertTimestampOrder(
    input.observedAt,
    input.collectedAt,
    'Safety evidence collectedAt must be at or after observedAt.',
  );
  if (payload.kind === 'holder') {
    for (const account of payload.accounts) {
      if (account.exclusion !== null) {
        assertNotFuture(account.exclusion.observedAt, now, 'holder exclusion observedAt');
        assertTimestampOrder(
          account.exclusion.observedAt,
          input.observedAt,
          'Holder exclusion provenance cannot postdate holder evidence.',
        );
      }
    }
  }
  const provider =
    input.provider === null ? null : nonEmpty(input.provider, 'Safety evidence provider');
  const provenance = nonEmpty(input.provenance, 'Safety evidence provenance');
  const evaluated = evaluateCanonicalSafetyPayload(payload);
  if (input.status !== undefined && input.status !== evaluated.status) {
    throw evidenceError('Caller-supplied safety status does not match the canonical evaluator.');
  }
  if (input.reason !== undefined && input.reason !== evaluated.reason) {
    throw evidenceError('Caller-supplied safety reason does not match the canonical evaluator.');
  }
  const withoutId: Omit<SafetyEvidenceRecord, 'evidenceId'> = {
    ...input,
    payload,
    provider,
    provenance,
    status: evaluated.status,
    reason: evaluated.reason,
  };
  const expectedId = safetyEvidenceId(withoutId);
  if (input.evidenceId !== undefined && input.evidenceId !== expectedId) {
    throw evidenceError('Safety evidence identity does not match its canonical payload.');
  }
  return { ...withoutId, evidenceId: expectedId };
}

function evaluateTokenRights(payload: TokenRightsSafetyPayload) {
  const dangerous: string[] = [];
  if (payload.mintAuthority !== null) dangerous.push('active mint authority');
  if (payload.freezeAuthority !== null) dangerous.push('active freeze authority');
  let unsupported = payload.tokenProgram === 'unsupported' || !payload.factsComplete;
  for (const extension of payload.extensions) {
    if (!extension.parsed || !extension.classified) unsupported = true;
    if (isPermanentDelegateActive(extension)) dangerous.push('active permanent delegate');
    if (isNonTransferable(extension)) dangerous.push('non-transferable token');
    if (isTransferHookActive(extension)) dangerous.push('active transfer hook');
    if (isDefaultAccountStateFrozen(extension)) dangerous.push('default account state frozen');
    if (isTransferFeeConfigured(extension)) dangerous.push('configured transfer fee');
    if (isMintCloseAuthority(extension) && extension.authority !== null)
      dangerous.push('active mint close authority');
    if (isPausablePaused(extension)) dangerous.push('paused token');
    if (hasPauseAuthority(extension)) dangerous.push('active pause authority');
  }
  if (dangerous.length > 0) return result('FAIL', [...new Set(dangerous)].sort().join(', '));
  if (unsupported)
    return result('UNKNOWN', 'token-right facts incomplete, unparsed, or unsupported');
  return result(
    'PASS',
    'complete token-right facts contain no dangerous or incompatible capability',
  );
}

function evaluateHolder(payload: HolderSafetyPayload) {
  if (payload.totalSupplyRaw === null || payload.denominatorRaw === null) {
    if (
      payload.totalSupplyRaw !== null ||
      payload.denominatorRaw !== null ||
      payload.supplyReconciled ||
      payload.ownerCoverageComplete ||
      payload.accounts.length !== 0
    ) {
      throw evidenceError(
        'Unavailable holder economics must use null supply/denominator, incomplete flags, and no measured accounts.',
      );
    }
    return result('UNKNOWN', 'holder supply and denominator are unavailable');
  }
  const totalSupply = rawAmount(payload.totalSupplyRaw, 'holder totalSupplyRaw');
  const denominator = positiveRawAmount(payload.denominatorRaw, 'holder denominatorRaw');
  const tokenAccounts = new Set<string>();
  let excluded = 0n;
  const owners = new Map<string, bigint>();
  for (const account of payload.accounts) {
    assertAddress(account.tokenAccount, 'Holder token account');
    assertAddress(account.owner, 'Holder owner');
    if (tokenAccounts.has(account.tokenAccount))
      throw evidenceError('Duplicate holder token account.');
    tokenAccounts.add(account.tokenAccount);
    const amount = rawAmount(account.amountRaw, 'holder account amountRaw');
    if (account.exclusion !== null) {
      assertAddress(account.exclusion.subjectAddress, 'Holder exclusion subject');
      if (
        account.exclusion.subjectAddress !== account.tokenAccount &&
        account.exclusion.subjectAddress !== account.owner
      ) {
        throw evidenceError(
          'Holder exclusion subject must identify the excluded token account or owner.',
        );
      }
      nonEmpty(account.exclusion.source, 'Holder exclusion source');
      excluded += amount;
      continue;
    }
    owners.set(account.owner, (owners.get(account.owner) ?? 0n) + amount);
  }
  if (excluded > totalSupply || denominator !== totalSupply - excluded) {
    throw evidenceError(
      'Holder denominator must equal total supply minus balances with explicit pool/vault/burn/program-controlled provenance.',
    );
  }
  const largest = [...owners.values()].reduce((max, amount) => (amount > max ? amount : max), 0n);
  const percentage = percentageOf(largest, denominator, 'holder');
  if (ratioExceedsPercent(largest, denominator, RW0_HOLDER_MAX_PCT)) {
    return result(
      'FAIL',
      `largest aggregated real holder is ${formatPct(percentage)}%`,
      percentage,
    );
  }
  if (!payload.supplyReconciled || !payload.ownerCoverageComplete || payload.sourceIsTop20Only) {
    return result(
      'UNKNOWN',
      'holder coverage or supply reconciliation is incomplete; top-20-only evidence cannot pass',
      percentage,
    );
  }
  return result('PASS', `largest aggregated real holder is ${formatPct(percentage)}%`, percentage);
}

function evaluateBundle(payload: BundleSafetyPayload) {
  nonEmpty(payload.rule, 'Bundle rule');
  if (payload.denominatorRaw === null) {
    if (payload.graphComplete || payload.membershipComplete || payload.members.length !== 0) {
      throw evidenceError(
        'Unavailable bundle economics must use a null denominator, incomplete flags, and no measured members.',
      );
    }
    return result('UNKNOWN', 'linked-wallet denominator and graph are unavailable');
  }
  const denominator = positiveRawAmount(payload.denominatorRaw, 'bundle denominatorRaw');
  const owners = new Set<string>();
  let numerator = 0n;
  for (const member of payload.members) {
    assertAddress(member.owner, 'Bundle member owner');
    if (owners.has(member.owner)) throw evidenceError('Duplicate bundle member owner.');
    owners.add(member.owner);
    nonEmpty(member.provenance, 'Bundle member provenance');
    numerator += rawAmount(member.amountRaw, 'bundle member amountRaw');
  }
  const percentage = percentageOf(numerator, denominator, 'bundle');
  if (!payload.graphComplete || !payload.membershipComplete) {
    return result('UNKNOWN', 'linked-wallet graph or cluster membership is incomplete', percentage);
  }
  if (ratioExceedsPercent(numerator, denominator, RW0_LINKED_BUNDLE_MAX_PCT)) {
    return result('FAIL', `complete linked cluster is ${formatPct(percentage)}%`, percentage);
  }
  return result('PASS', `complete linked cluster is ${formatPct(percentage)}%`, percentage);
}

function evaluateCreator(payload: CreatorSafetyPayload) {
  if (
    !payload.identityTrustworthy ||
    payload.creatorIdentity === null ||
    payload.identityProvenance === null
  ) {
    return result('UNKNOWN', 'trustworthy creator identity is missing');
  }
  assertAddress(payload.creatorIdentity, 'Creator identity');
  nonEmpty(payload.identityProvenance, 'Creator identity provenance');
  if (payload.retainedControlCapabilities.length > 0) {
    return result(
      'FAIL',
      'creator retains control capability: ' +
        payload.retainedControlCapabilities.slice().sort().join(', '),
    );
  }
  if (!payload.controlledAccountsComplete) {
    return result('UNKNOWN', 'creator-controlled account graph is incomplete');
  }
  if (payload.controlledBalanceRaw === null || payload.denominatorRaw === null) {
    return result('UNKNOWN', 'creator exposure denominator is incomplete');
  }
  const controlledBalance = rawAmount(
    payload.controlledBalanceRaw,
    'creator controlledBalanceRaw',
  );
  const denominator = positiveRawAmount(payload.denominatorRaw, 'creator denominatorRaw');
  const percentage = percentageOf(controlledBalance, denominator, 'creator');
  if (controlledBalance !== 0n) {
    return result(
      'UNKNOWN',
      `creator exposure is ${formatPct(percentage)}%; no exposure threshold is defined`,
      percentage,
    );
  }
  return result('PASS', 'trustworthy creator identity has complete zero-exposure evidence', 0);
}

function validateSafetyPayload(payload: unknown): SafetyEvidencePayload {
  const record = requireRecord(payload, 'Safety evidence payload');
  const kind = record['kind'];
  if (typeof kind !== 'string' || !(RW0_SAFETY_GATE_KINDS as readonly string[]).includes(kind)) {
    throw evidenceError('Safety evidence payload kind is unsupported.');
  }
  switch (kind) {
    case 'token_rights':
      return validateTokenRightsPayload(record);
    case 'holder':
      return validateHolderPayload(record);
    case 'bundle':
      return validateBundlePayload(record);
    case 'creator':
      return validateCreatorPayload(record);
  }
  throw evidenceError('Safety evidence payload kind is unsupported.');
}

function validateTokenRightsPayload(record: Record<string, unknown>): TokenRightsSafetyPayload {
  assertOnlyKeys(record, [
    'kind',
    'tokenProgram',
    'mintAuthority',
    'freezeAuthority',
    'extensions',
    'factsComplete',
  ], 'Token-rights payload');
  const tokenProgram = requireEnum(
    record['tokenProgram'],
    ['spl_token', 'token_2022', 'unsupported'] as const,
    'Token-rights tokenProgram',
  );
  const extensions = requireArray(record['extensions'], 'Token-rights extensions').map(
    validateTokenExtension,
  );
  return {
    kind: 'token_rights',
    tokenProgram,
    mintAuthority: requireNullableAddress(record['mintAuthority'], 'Token-rights mintAuthority'),
    freezeAuthority: requireNullableAddress(
      record['freezeAuthority'],
      'Token-rights freezeAuthority',
    ),
    extensions,
    factsComplete: requireBoolean(record['factsComplete'], 'Token-rights factsComplete'),
  };
}

function validateHolderPayload(record: Record<string, unknown>): HolderSafetyPayload {
  assertOnlyKeys(record, [
    'kind',
    'denominatorKind',
    'totalSupplyRaw',
    'denominatorRaw',
    'supplyReconciled',
    'ownerCoverageComplete',
    'sourceIsTop20Only',
    'accounts',
  ], 'Holder payload');
  const accounts = requireArray(record['accounts'], 'Holder accounts').map((value) => {
    const account = requireRecord(value, 'Holder account');
    assertOnlyKeys(
      account,
      ['tokenAccount', 'owner', 'amountRaw', 'exclusion'],
      'Holder account',
    );
    const exclusionValue = account['exclusion'];
    let exclusion: HolderSafetyPayload['accounts'][number]['exclusion'] = null;
    if (exclusionValue !== null) {
      const item = requireRecord(exclusionValue, 'Holder exclusion');
      assertOnlyKeys(
        item,
        ['kind', 'source', 'observedAt', 'subjectAddress'],
        'Holder exclusion',
      );
      exclusion = {
        kind: requireEnum(
          item['kind'],
          ['pool', 'vault', 'burn', 'program_controlled'] as const,
          'Holder exclusion kind',
        ),
        source: requireNonEmptyString(item['source'], 'Holder exclusion source'),
        observedAt: requireNonEmptyString(item['observedAt'], 'Holder exclusion observedAt'),
        subjectAddress: requireAddress(item['subjectAddress'], 'Holder exclusion subjectAddress'),
      };
    }
    return {
      tokenAccount: requireAddress(account['tokenAccount'], 'Holder tokenAccount'),
      owner: requireAddress(account['owner'], 'Holder owner'),
      amountRaw: requireRawAmount(account['amountRaw'], 'Holder amountRaw'),
      exclusion,
    };
  });
  return {
    kind: 'holder',
    denominatorKind: requireEnum(
      record['denominatorKind'],
      ['effective_circulating_supply'] as const,
      'Holder denominatorKind',
    ),
    totalSupplyRaw: requireNullableRawAmount(record['totalSupplyRaw'], 'Holder totalSupplyRaw'),
    denominatorRaw: requireNullableRawAmount(record['denominatorRaw'], 'Holder denominatorRaw'),
    supplyReconciled: requireBoolean(record['supplyReconciled'], 'Holder supplyReconciled'),
    ownerCoverageComplete: requireBoolean(
      record['ownerCoverageComplete'],
      'Holder ownerCoverageComplete',
    ),
    sourceIsTop20Only: requireBoolean(record['sourceIsTop20Only'], 'Holder sourceIsTop20Only'),
    accounts,
  };
}

function validateBundlePayload(record: Record<string, unknown>): BundleSafetyPayload {
  assertOnlyKeys(record, [
    'kind',
    'rule',
    'denominatorKind',
    'denominatorRaw',
    'graphComplete',
    'membershipComplete',
    'confidence',
    'members',
  ], 'Bundle payload');
  const members = requireArray(record['members'], 'Bundle members').map((value) => {
    const member = requireRecord(value, 'Bundle member');
    assertOnlyKeys(member, ['owner', 'amountRaw', 'provenance'], 'Bundle member');
    return {
      owner: requireAddress(member['owner'], 'Bundle member owner'),
      amountRaw: requireRawAmount(member['amountRaw'], 'Bundle member amountRaw'),
      provenance: requireNonEmptyString(member['provenance'], 'Bundle member provenance'),
    };
  });
  return {
    kind: 'bundle',
    rule: requireNonEmptyString(record['rule'], 'Bundle rule'),
    denominatorKind: requireEnum(
      record['denominatorKind'],
      ['effective_circulating_supply'] as const,
      'Bundle denominatorKind',
    ),
    denominatorRaw: requireNullableRawAmount(record['denominatorRaw'], 'Bundle denominatorRaw'),
    graphComplete: requireBoolean(record['graphComplete'], 'Bundle graphComplete'),
    membershipComplete: requireBoolean(
      record['membershipComplete'],
      'Bundle membershipComplete',
    ),
    confidence: requireEnum(
      record['confidence'],
      ['high', 'medium', 'low'] as const,
      'Bundle confidence',
    ),
    members,
  };
}

function validateCreatorPayload(record: Record<string, unknown>): CreatorSafetyPayload {
  assertOnlyKeys(record, [
    'kind',
    'creatorIdentity',
    'identityProvenance',
    'identityTrustworthy',
    'controlledAccountsComplete',
    'retainedControlCapabilities',
    'controlledBalanceRaw',
    'denominatorRaw',
  ], 'Creator payload');
  const retainedControlCapabilities = requireArray(
    record['retainedControlCapabilities'],
    'Creator retainedControlCapabilities',
  ).map((value) => requireNonEmptyString(value, 'Creator retained control capability'));
  return {
    kind: 'creator',
    creatorIdentity: requireNullableAddress(record['creatorIdentity'], 'Creator identity'),
    identityProvenance: requireNullableNonEmptyString(
      record['identityProvenance'],
      'Creator identityProvenance',
    ),
    identityTrustworthy: requireBoolean(
      record['identityTrustworthy'],
      'Creator identityTrustworthy',
    ),
    controlledAccountsComplete: requireBoolean(
      record['controlledAccountsComplete'],
      'Creator controlledAccountsComplete',
    ),
    retainedControlCapabilities,
    controlledBalanceRaw: requireNullableRawAmount(
      record['controlledBalanceRaw'],
      'Creator controlledBalanceRaw',
    ),
    denominatorRaw: requireNullableRawAmount(
      record['denominatorRaw'],
      'Creator denominatorRaw',
    ),
  };
}

function validateTokenExtension(value: unknown): TokenExtensionObservation {
  const extension = requireRecord(value, 'Token extension');
  assertOnlyKeys(extension, [
    'name',
    'rawName',
    'authority',
    'programId',
    'state',
    'transferFeeBasisPoints',
    'maximumFeeRaw',
    'olderTransferFeeBasisPoints',
    'newerTransferFeeBasisPoints',
    'olderMaximumFeeRaw',
    'newerMaximumFeeRaw',
    'parsed',
    'classified',
  ], 'Token extension');
  return {
    name: requireNonEmptyString(extension['name'], 'Token extension name'),
    rawName: requireNonEmptyString(extension['rawName'], 'Token extension rawName'),
    authority: requireNullableAddress(extension['authority'], 'Token extension authority'),
    programId: requireNullableAddress(extension['programId'], 'Token extension programId'),
    state: requireNullableNonEmptyString(extension['state'], 'Token extension state'),
    transferFeeBasisPoints: requireNullableBasisPoints(
      extension['transferFeeBasisPoints'],
      'Token extension transferFeeBasisPoints',
    ),
    maximumFeeRaw: requireNullableRawAmount(
      extension['maximumFeeRaw'],
      'Token extension maximumFeeRaw',
    ),
    olderTransferFeeBasisPoints: requireNullableBasisPoints(
      extension['olderTransferFeeBasisPoints'],
      'Token extension olderTransferFeeBasisPoints',
    ),
    newerTransferFeeBasisPoints: requireNullableBasisPoints(
      extension['newerTransferFeeBasisPoints'],
      'Token extension newerTransferFeeBasisPoints',
    ),
    olderMaximumFeeRaw: requireNullableRawAmount(
      extension['olderMaximumFeeRaw'],
      'Token extension olderMaximumFeeRaw',
    ),
    newerMaximumFeeRaw: requireNullableRawAmount(
      extension['newerMaximumFeeRaw'],
      'Token extension newerMaximumFeeRaw',
    ),
    parsed: requireBoolean(extension['parsed'], 'Token extension parsed'),
    classified: requireBoolean(extension['classified'], 'Token extension classified'),
  };
}

function canonicalEvidenceIdentity(input: Omit<SafetyEvidenceRecord, 'evidenceId'>): unknown {
  return {
    episodeId: input.episodeId,
    mint: input.mint,
    pairAddress: input.pairAddress,
    confirmationObservedAt: input.confirmationObservedAt,
    confirmationEventId: input.confirmationEventId,
    kind: input.kind,
    observedAt: input.observedAt,
    collectedAt: input.collectedAt,
    provider: input.provider,
    provenance: input.provenance,
    signalVersion: input.signalVersion,
    signalFingerprint: input.signalFingerprint,
    watcherSpecVersion: input.watcherSpecVersion,
    watcherSpecFingerprint: input.watcherSpecFingerprint,
    safetySpecVersion: input.safetySpecVersion,
    safetySpecFingerprint: input.safetySpecFingerprint,
    status: input.status,
    reason: input.reason,
    payload: input.payload,
  };
}

function result(status: SafetyGateStatus, reason: string, percentage: number | null = null) {
  return { status, reason, percentage };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw evidenceError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const allowed = new Set(keys);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    throw evidenceError(`${label} contains unsupported field ${unexpected}.`);
  }
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw evidenceError(`${label} must be an array.`);
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw evidenceError(`${label} must be boolean.`);
  return value;
}

function requireEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw evidenceError(`${label} is unsupported.`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw evidenceError(`${label} must be a string.`);
  return nonEmpty(value, label);
}

function requireNullableNonEmptyString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requireNonEmptyString(value, label);
}

function requireAddress(value: unknown, label: string): string {
  if (typeof value !== 'string') throw evidenceError(`${label} must be a string.`);
  assertAddress(value, label);
  return value;
}

function requireNullableAddress(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requireAddress(value, label);
}

function requireRawAmount(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw evidenceError(`${label} must be a canonical non-negative integer string.`);
  }
  rawAmount(value, label);
  return value;
}

function requireNullableRawAmount(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requireRawAmount(value, label);
}

function requireNullableBasisPoints(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10_000) {
    throw evidenceError(`${label} must be an integer within [0,10000] or null.`);
  }
  return value;
}

function rawAmount(value: string, label: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value))
    throw evidenceError(`${label} must be a canonical non-negative integer.`);
  return BigInt(value);
}

function positiveRawAmount(value: string, label: string): bigint {
  const amount = rawAmount(value, label);
  if (amount <= 0n) throw evidenceError(`${label} must be positive.`);
  return amount;
}

function percentageOf(numerator: bigint, denominator: bigint, label: string): number {
  if (numerator > denominator) throw evidenceError(`${label} numerator exceeds denominator.`);
  const scaled = Number((numerator * 1_000_000n) / denominator) / 10_000;
  if (!Number.isFinite(scaled) || scaled < 0 || scaled > 100) {
    throw evidenceError(`${label} percentage must be finite and within [0,100].`);
  }
  return scaled;
}

function ratioExceedsPercent(numerator: bigint, denominator: bigint, threshold: number): boolean {
  return numerator * 100n > denominator * BigInt(threshold);
}

function formatPct(value: number): string {
  return value.toFixed(4).replace(/\.?0+$/, '');
}

function assertAddress(value: string, label: string): void {
  if (!isPlausibleSolanaMint(value))
    throw evidenceError(`${label} must be a plausible Solana address.`);
}

function nonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw evidenceError(`${label} must be non-empty.`);
  return trimmed;
}

function evidenceError(message: string): RecoveryWatcherError {
  return new RecoveryWatcherError(message, { code: 'evidence_invalid' });
}

export function emptySafetyEvidenceCounts(): Record<
  SafetyGateKind,
  Record<SafetyGateStatus, number>
> {
  return {
    token_rights: { PASS: 0, FAIL: 0, UNKNOWN: 0 },
    holder: { PASS: 0, FAIL: 0, UNKNOWN: 0 },
    bundle: { PASS: 0, FAIL: 0, UNKNOWN: 0 },
    creator: { PASS: 0, FAIL: 0, UNKNOWN: 0 },
  };
}
