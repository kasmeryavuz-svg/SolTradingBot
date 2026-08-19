import { PersistenceError } from '../persistence/types.js';
import { ProductionError } from './errors.js';
import { sanitizeProductionErrorMessage } from './sanitizer.js';

export const RECOVERABLE_OPERATION_FAILURE = 'RECOVERABLE_OPERATION_FAILURE' as const;
export const FATAL_PRODUCTION_FAILURE = 'FATAL_PRODUCTION_FAILURE' as const;

export type ProductionFailureKind =
  | typeof RECOVERABLE_OPERATION_FAILURE
  | typeof FATAL_PRODUCTION_FAILURE;

/**
 * Classifier semantics (prod20_v1):
 *
 * FATAL_PRODUCTION_FAILURE when any error in the cause chain is:
 * - PersistenceError (persistence layer / SQLite wrapper)
 * - ProductionError that is fatal (default) except recoverable_operation
 * - node:sqlite / SQLite result codes listed below
 * - an error whose code/name is explicitly a SQLite database failure
 * - any remaining unclassified error (ambiguous provider-vs-DB → fail closed)
 *
 * RECOVERABLE_OPERATION_FAILURE only when the entire chain is a known
 * provider/network failure or an explicit ProductionError({ fatal: false })
 * with code recoverable_operation.
 *
 * Message text is never the sole classifier. Known SQLite codes are
 * recognized from `code` / `errcode` properties, not prose.
 */
export const FATAL_SQLITE_RESULT_CODES = [
  'SQLITE_CORRUPT',
  'SQLITE_NOTADB',
  'SQLITE_IOERR',
  'SQLITE_FULL',
  'SQLITE_READONLY',
  'SQLITE_CANTOPEN',
  'SQLITE_BUSY',
  'SQLITE_LOCKED',
] as const;

export const FATAL_SQLITE_ERRNOS = new Set([5, 6, 8, 10, 11, 13, 14, 26]);

const RECOVERABLE_NETWORK_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'ABORT_ERR',
]);

const RECOVERABLE_NETWORK_NAMES = new Set(['AbortError', 'FetchError', 'TimeoutError', 'ProviderError']);

export function classifyProductionFailure(error: unknown): ProductionFailureKind {
  const chain = flattenErrorChain(error);
  if (chain.some(isFatalDatabaseNode)) {
    return FATAL_PRODUCTION_FAILURE;
  }
  if (chain.length > 0 && chain.every(isRecoverableProviderNode)) {
    return RECOVERABLE_OPERATION_FAILURE;
  }
  return FATAL_PRODUCTION_FAILURE;
}

export function isFatalProductionFailure(error: unknown): boolean {
  return classifyProductionFailure(error) === FATAL_PRODUCTION_FAILURE;
}

export function toFatalProductionError(error: unknown): ProductionError {
  if (error instanceof ProductionError && error.fatal) {
    return error;
  }
  return new ProductionError('database_integrity', sanitizeProductionErrorMessage(error), {
    fatal: true,
    cause: error,
  });
}

export function createRecoverableProviderFailure(message: string, code = 'ETIMEDOUT'): Error {
  const error = new Error(message);
  error.name = 'ProviderError';
  Object.assign(error, { code });
  return error;
}

export function createSqliteDatabaseFailure(code: (typeof FATAL_SQLITE_RESULT_CODES)[number]): Error {
  const error = new Error('sqlite database failure');
  error.name = 'SqliteError';
  Object.assign(error, { code, errcode: sqliteErrNo(code) });
  return error;
}

function isFatalDatabaseNode(error: unknown): boolean {
  if (error instanceof PersistenceError) {
    return true;
  }
  if (error instanceof ProductionError) {
    return (
      error.fatal &&
      (error.code === 'database_integrity' ||
        error.code === 'lock_failure' ||
        error.code === 'health_bind' ||
        error.code === 'health_server' ||
        error.code === 'fatal_startup')
    );
  }
  return hasFatalSqliteCode(error);
}

function isRecoverableProviderNode(error: unknown): boolean {
  if (error instanceof ProductionError) {
    return !error.fatal || error.code === 'recoverable_operation';
  }
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const record = error as { name?: unknown; code?: unknown };
  if (typeof record.name === 'string' && RECOVERABLE_NETWORK_NAMES.has(record.name)) {
    return true;
  }
  return typeof record.code === 'string' && RECOVERABLE_NETWORK_CODES.has(record.code);
}

function hasFatalSqliteCode(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const record = error as { code?: unknown; errcode?: unknown; name?: unknown };
  if (typeof record.code === 'string') {
    const normalized = record.code.toUpperCase();
    if (normalized === 'ERR_SQLITE_ERROR') {
      return true;
    }
    if ((FATAL_SQLITE_RESULT_CODES as readonly string[]).includes(normalized)) {
      return true;
    }
  }
  if (typeof record.errcode === 'number' && FATAL_SQLITE_ERRNOS.has(record.errcode)) {
    return true;
  }
  return record.name === 'SqliteError';
}

function flattenErrorChain(error: unknown): unknown[] {
  const seen = new Set<unknown>();
  const chain: unknown[] = [];
  let current: unknown = error;
  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    if (typeof current === 'object' && 'cause' in current) {
      current = (current as { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  return chain;
}

function sqliteErrNo(code: (typeof FATAL_SQLITE_RESULT_CODES)[number]): number {
  switch (code) {
    case 'SQLITE_BUSY':
      return 5;
    case 'SQLITE_LOCKED':
      return 6;
    case 'SQLITE_READONLY':
      return 8;
    case 'SQLITE_IOERR':
      return 10;
    case 'SQLITE_CORRUPT':
      return 11;
    case 'SQLITE_FULL':
      return 13;
    case 'SQLITE_CANTOPEN':
      return 14;
    case 'SQLITE_NOTADB':
      return 26;
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}
