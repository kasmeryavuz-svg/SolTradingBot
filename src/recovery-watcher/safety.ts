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

export const RW0_SAFETY_GATE_KINDS = ['token_rights', 'holder', 'bundle', 'creator'] as const;

export function canonicalRecoverySafetySpec() {
  return {
    specVersion: RW0_SAFETY_SPEC_VERSION,
    specName: RW0_SAFETY_SPEC_NAME,
    evidenceOnly: true,
    paperEligibleReachable: false,
    paperOpenReachable: false,
    decisionFromPersistedCanonicalEvidenceOnly: true,
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
    },
    bundle: {
      maxPctInclusive: RW0_LINKED_BUNDLE_MAX_PCT,
      numerator: 'sum_of_persisted_rule_members_raw',
      denominator: 'effective_circulating_supply',
      heuristicClusterIsOwnership: false,
      persistRuleMembersNumeratorDenominatorProvenanceConfidenceCompleteness: true,
      incompleteGraph: 'UNKNOWN',
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
  if (!(RW0_SAFETY_GATE_KINDS as readonly string[]).includes(input.kind)) {
    throw evidenceError('Unsupported safety evidence kind.');
  }
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
  if (input.payload.kind === 'holder') {
    for (const account of input.payload.accounts) {
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
  const evaluated = evaluateSafetyPayload(input.payload);
  if (input.status !== undefined && input.status !== evaluated.status) {
    throw evidenceError('Caller-supplied safety status does not match the canonical evaluator.');
  }
  if (input.reason !== undefined && input.reason !== evaluated.reason) {
    throw evidenceError('Caller-supplied safety reason does not match the canonical evaluator.');
  }
  const withoutId: Omit<SafetyEvidenceRecord, 'evidenceId'> = {
    ...input,
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
  if (payload.tokenProgram === 'unsupported') {
    return result('UNKNOWN', 'unsupported token program');
  }
  const dangerous: string[] = [];
  if (payload.mintAuthority !== null) dangerous.push('active mint authority');
  if (payload.freezeAuthority !== null) dangerous.push('active freeze authority');
  let unsupported = !payload.factsComplete;
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
  if (percentage > RW0_HOLDER_MAX_PCT) {
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
  if (percentage > RW0_LINKED_BUNDLE_MAX_PCT) {
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
  const percentage = percentageOf(
    rawAmount(payload.controlledBalanceRaw, 'creator controlledBalanceRaw'),
    positiveRawAmount(payload.denominatorRaw, 'creator denominatorRaw'),
    'creator',
  );
  if (percentage !== 0) {
    return result(
      'UNKNOWN',
      `creator exposure is ${formatPct(percentage)}%; no exposure threshold is defined`,
      percentage,
    );
  }
  return result('PASS', 'trustworthy creator identity has complete zero-exposure evidence', 0);
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
