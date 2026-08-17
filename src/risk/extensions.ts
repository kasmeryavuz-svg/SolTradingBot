import { isPlausibleSolanaMint } from '../utils/solana-mint.js';
import { SYSTEM_PROGRAM_ID } from './constants.js';
import { isRecord, parseBasisPoints, parseRawAmount } from './numbers.js';
import type { TokenExtensionObservation } from './types.js';

const EXTENSION_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  permanentdelegate: 'PermanentDelegate',
  nontransferable: 'NonTransferable',
  transferhook: 'TransferHook',
  defaultaccountstate: 'DefaultAccountState',
  transferfeeconfig: 'TransferFeeConfig',
  mintcloseauthority: 'MintCloseAuthority',
  pausable: 'Pausable',
  pausableconfig: 'Pausable',
};

const CLASSIFIED_KEYS = new Set(Object.keys(EXTENSION_DISPLAY_NAMES));

export function parseTokenExtensions(value: unknown): TokenExtensionObservation[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return [
      {
        name: 'malformed_extensions',
        rawName: 'malformed_extensions',
        authority: null,
        programId: null,
        state: null,
        transferFeeBasisPoints: null,
        maximumFeeRaw: null,
        olderTransferFeeBasisPoints: null,
        newerTransferFeeBasisPoints: null,
        olderMaximumFeeRaw: null,
        newerMaximumFeeRaw: null,
        parsed: false,
        classified: false,
      },
    ];
  }

  return value.map((item, index) => parseOneExtension(item, index));
}

export function isPermanentDelegateActive(extension: TokenExtensionObservation): boolean {
  return normalizeKey(extension.rawName) === 'permanentdelegate' && isActiveAddress(extension.authority);
}

export function isNonTransferable(extension: TokenExtensionObservation): boolean {
  return normalizeKey(extension.rawName) === 'nontransferable' && extension.parsed;
}

export function isTransferHookActive(extension: TokenExtensionObservation): boolean {
  return normalizeKey(extension.rawName) === 'transferhook' && isActiveProgramId(extension.programId);
}

export function isDefaultAccountStateFrozen(extension: TokenExtensionObservation): boolean {
  return (
    normalizeKey(extension.rawName) === 'defaultaccountstate' &&
    extension.state !== null &&
    extension.state.toLowerCase() === 'frozen'
  );
}

export function isTransferFeeConfigured(extension: TokenExtensionObservation): boolean {
  if (normalizeKey(extension.rawName) !== 'transferfeeconfig' || !extension.parsed) {
    return false;
  }

  return (
    isNonZeroFee(extension.olderTransferFeeBasisPoints, extension.olderMaximumFeeRaw) ||
    isNonZeroFee(extension.newerTransferFeeBasisPoints, extension.newerMaximumFeeRaw) ||
    isNonZeroFee(extension.transferFeeBasisPoints, extension.maximumFeeRaw)
  );
}

export function isMintCloseAuthority(extension: TokenExtensionObservation): boolean {
  return normalizeKey(extension.rawName) === 'mintcloseauthority' && extension.parsed;
}

export function isPausableExtension(extension: TokenExtensionObservation): boolean {
  const key = normalizeKey(extension.rawName);
  return (key === 'pausable' || key === 'pausableconfig') && extension.parsed;
}

export function isPausablePaused(extension: TokenExtensionObservation): boolean {
  return isPausableExtension(extension) && extension.state === 'paused';
}

export function hasPauseAuthority(extension: TokenExtensionObservation): boolean {
  return isPausableExtension(extension) && isActiveAddress(extension.authority);
}

function parseOneExtension(item: unknown, index: number): TokenExtensionObservation {
  if (!isRecord(item)) {
    return unparsedExtension(`extension_${String(index)}`, `extension_${String(index)}`);
  }

  const rawName = readExtensionName(item, index);
  const key = normalizeKey(rawName);
  const state = isRecord(item['state']) ? item['state'] : item;
  const classified = CLASSIFIED_KEYS.has(key);

  if (key === 'permanentdelegate') {
    return {
      ...baseObservation(rawName, classified),
      authority: readOptionalAddress(state['delegate'] ?? item['delegate']),
      parsed: true,
    };
  }

  if (key === 'nontransferable') {
    return {
      ...baseObservation(rawName, classified),
      parsed: true,
    };
  }

  if (key === 'transferhook') {
    return {
      ...baseObservation(rawName, classified),
      authority: readOptionalAddress(state['authority'] ?? item['authority']),
      programId: readOptionalAddress(state['programId'] ?? item['programId']),
      parsed: true,
    };
  }

  if (key === 'defaultaccountstate') {
    const accountState = readOptionalState(state['accountState'] ?? item['accountState']);
    return {
      ...baseObservation(rawName, classified),
      state: accountState,
      parsed: accountState !== null,
    };
  }

  if (key === 'transferfeeconfig') {
    return parseTransferFeeConfig(rawName, state);
  }

  if (key === 'mintcloseauthority') {
    return {
      ...baseObservation(rawName, classified),
      authority: readOptionalAddress(state['closeAuthority'] ?? item['closeAuthority']),
      parsed: true,
    };
  }

  if (key === 'pausable' || key === 'pausableconfig') {
    return parsePausable(rawName, state);
  }

  return {
    ...baseObservation(rawName, false),
    authority: readOptionalAddress(state['authority'] ?? item['authority']),
    programId: readOptionalAddress(state['programId'] ?? item['programId']),
    state: readOptionalState(state['state'] ?? item['accountState']),
    parsed: false,
  };
}

function parseTransferFeeConfig(rawName: string, state: Record<string, unknown>): TokenExtensionObservation {
  const older = parseFeeSchedule(state['olderTransferFee']);
  const newer = parseFeeSchedule(state['newerTransferFee']);
  const parsed = older.parsed || newer.parsed;
  const configuredBps = firstNonZeroBps(older.basisPoints, newer.basisPoints) ?? older.basisPoints ?? newer.basisPoints;
  const configuredMax = firstNonZeroRaw(older.maximumFeeRaw, newer.maximumFeeRaw) ?? older.maximumFeeRaw ?? newer.maximumFeeRaw;

  return {
    ...baseObservation(rawName, true),
    authority: readOptionalAddress(state['transferFeeConfigAuthority']),
    transferFeeBasisPoints: configuredBps,
    maximumFeeRaw: configuredMax,
    olderTransferFeeBasisPoints: older.basisPoints,
    newerTransferFeeBasisPoints: newer.basisPoints,
    olderMaximumFeeRaw: older.maximumFeeRaw,
    newerMaximumFeeRaw: newer.maximumFeeRaw,
    state: formatFeeSchedules(older, newer),
    parsed,
  };
}

function parseFeeSchedule(value: unknown): {
  basisPoints: number | null;
  maximumFeeRaw: string | null;
  parsed: boolean;
} {
  if (!isRecord(value)) {
    return { basisPoints: null, maximumFeeRaw: null, parsed: false };
  }

  try {
    const basisPoints =
      value['transferFeeBasisPoints'] === undefined
        ? null
        : parseBasisPoints(value['transferFeeBasisPoints'], 'transferFeeBasisPoints');
    const maximumFeeRaw =
      value['maximumFee'] === undefined ? null : parseRawAmount(value['maximumFee'], 'maximumFee');
    return {
      basisPoints,
      maximumFeeRaw,
      parsed: basisPoints !== null || maximumFeeRaw !== null,
    };
  } catch {
    return { basisPoints: null, maximumFeeRaw: null, parsed: false };
  }
}

function formatFeeSchedules(
  older: { basisPoints: number | null; maximumFeeRaw: string | null; parsed: boolean },
  newer: { basisPoints: number | null; maximumFeeRaw: string | null; parsed: boolean },
): string | null {
  const parts: string[] = [];
  if (older.parsed) {
    parts.push(
      `older_bps=${older.basisPoints === null ? 'n/a' : String(older.basisPoints)};older_max=${older.maximumFeeRaw ?? 'n/a'}`,
    );
  }
  if (newer.parsed) {
    parts.push(
      `newer_bps=${newer.basisPoints === null ? 'n/a' : String(newer.basisPoints)};newer_max=${newer.maximumFeeRaw ?? 'n/a'}`,
    );
  }
  return parts.length === 0 ? null : parts.join('|');
}

function firstNonZeroBps(left: number | null, right: number | null): number | null {
  if (left !== null && left > 0) {
    return left;
  }
  if (right !== null && right > 0) {
    return right;
  }
  return null;
}

function firstNonZeroRaw(left: string | null, right: string | null): string | null {
  if (left !== null && left !== '0') {
    return left;
  }
  if (right !== null && right !== '0') {
    return right;
  }
  return null;
}

function isNonZeroFee(basisPoints: number | null, maximumFeeRaw: string | null): boolean {
  return (basisPoints !== null && basisPoints > 0) || (maximumFeeRaw !== null && maximumFeeRaw !== '0');
}

function parsePausable(rawName: string, state: Record<string, unknown>): TokenExtensionObservation {
  const paused = state['paused'];
  if (typeof paused !== 'boolean') {
    return {
      ...baseObservation(rawName, false),
      authority: readOptionalAddress(state['authority']),
      parsed: false,
    };
  }

  return {
    ...baseObservation(rawName, true),
    authority: readOptionalAddress(state['authority']),
    state: paused ? 'paused' : 'unpaused',
    parsed: true,
  };
}

function baseObservation(rawName: string, classified: boolean): TokenExtensionObservation {
  return {
    name: displayName(rawName),
    rawName,
    authority: null,
    programId: null,
    state: null,
    transferFeeBasisPoints: null,
    maximumFeeRaw: null,
    olderTransferFeeBasisPoints: null,
    newerTransferFeeBasisPoints: null,
    olderMaximumFeeRaw: null,
    newerMaximumFeeRaw: null,
    parsed: false,
    classified,
  };
}

function unparsedExtension(name: string, rawName: string): TokenExtensionObservation {
  return {
    ...baseObservation(rawName, false),
    name,
  };
}

function readExtensionName(item: Record<string, unknown>, index: number): string {
  const value = item['extension'] ?? item['name'];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : `extension_${String(index)}`;
}

function displayName(rawName: string): string {
  return EXTENSION_DISPLAY_NAMES[normalizeKey(rawName)] ?? rawName;
}

function normalizeKey(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function readOptionalAddress(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const trimmed = value.trim();
  return isPlausibleSolanaMint(trimmed) ? trimmed : null;
}

function readOptionalState(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function isActiveAddress(value: string | null): boolean {
  return value !== null && isPlausibleSolanaMint(value);
}

function isActiveProgramId(value: string | null): boolean {
  return isActiveAddress(value) && value !== SYSTEM_PROGRAM_ID;
}
