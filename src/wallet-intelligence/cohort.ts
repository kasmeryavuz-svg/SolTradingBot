import { ANALYZED_WALLET_CAP } from './constants.js';
import { observedTop20TotalRaw } from './holders.js';
import { fractionBps, medianNumber, observedTop20ShareBps } from './numbers.js';
import type { AggregatedOwner, CohortSummary, HolderObservation, WalletProfile } from './types.js';

export function summarizeCohort(input: {
  holders: readonly HolderObservation[];
  owners: readonly AggregatedOwner[];
  profiles: readonly WalletProfile[];
}): CohortSummary {
  const uniqueOwners = new Set(
    input.holders
      .map((holder) => holder.ownerAddress)
      .filter((address): address is string => address !== null),
  );
  const systemWalletCandidatesObserved = input.owners.filter(
    (owner) => owner.ownerKind === 'SYSTEM_OWNED_NON_EXECUTABLE',
  ).length;
  const programOrExecutableOwnersObserved = input.owners.filter(
    (owner) => owner.ownerKind === 'PROGRAM_OWNED_OR_EXECUTABLE',
  ).length;
  const unknownOwnersObserved = input.owners.filter(
    (owner) => owner.ownerKind === 'UNKNOWN' || owner.ownerKind === 'ACCOUNT_MISSING',
  ).length;
  const totalRaw = observedTop20TotalRaw(input.holders);
  const programRaw = sumOwnerKindRaw(input.holders, 'PROGRAM_OWNED_OR_EXECUTABLE');
  const unknownRaw =
    sumOwnerKindRaw(input.holders, 'UNKNOWN') + sumOwnerKindRaw(input.holders, 'ACCOUNT_MISSING');
  const analyzedWalletCount = input.profiles.length;
  const observedFresh7dCount = countAge(input.profiles, 'OBSERVED_FRESH_7D');
  const observedYoung30dCount = countAge(input.profiles, 'OBSERVED_YOUNG_30D');
  return {
    topTokenAccountsObserved: input.holders.length,
    uniqueOwnersObserved: uniqueOwners.size,
    systemWalletCandidatesObserved,
    programOrExecutableOwnersObserved,
    unknownOwnersObserved,
    analyzedWalletCount,
    historyCensoredWalletCount: input.profiles.filter((profile) => profile.historyCensored).length,
    observedFresh7dCount,
    observedYoung30dCount,
    observedEstablished30dPlusCount: countAge(input.profiles, 'OBSERVED_ESTABLISHED_30D_PLUS'),
    observedAgeUnknownCount: countAge(input.profiles, 'UNKNOWN'),
    observedFresh7dFractionBps: fractionBps(observedFresh7dCount, analyzedWalletCount),
    observedYoung30dFractionBps: fractionBps(observedYoung30dCount, analyzedWalletCount),
    programOrExecutableObservedTop20BalanceBps: observedTop20ShareBps(programRaw, totalRaw),
    unknownObservedTop20BalanceBps: observedTop20ShareBps(unknownRaw, totalRaw),
    medianObservedHistoryTxCount30d: medianNumber(
      input.profiles.map((profile) => profile.historyTransactionsObserved),
    ),
    medianActiveDaysObserved30d: medianNumber(input.profiles.map((profile) => profile.activeDaysObserved30d)),
    medianUniqueMintsTouched30d: medianNumber(
      input.profiles.map((profile) => profile.uniqueMintsWithBalanceChange30d),
    ),
  };
}

export function assertAnalyzedWalletCap(count: number): void {
  if (count > ANALYZED_WALLET_CAP) {
    throw new Error(`Analyzed wallet count exceeded the frozen cap of ${String(ANALYZED_WALLET_CAP)}.`);
  }
}

function countAge(profiles: readonly WalletProfile[], age: WalletProfile['observedAgeClass']): number {
  return profiles.filter((profile) => profile.observedAgeClass === age).length;
}

function sumOwnerKindRaw(holders: readonly HolderObservation[], kind: HolderObservation['ownerKind']): bigint {
  return holders
    .filter((holder) => holder.ownerKind === kind)
    .reduce((sum, holder) => sum + BigInt(holder.amountRaw), 0n);
}
