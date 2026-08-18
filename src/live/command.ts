import type { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../config/load-config.js';
import type { AppConfig, EnvSource } from '../config/types.js';
import { createJupiterBuildClient } from '../execution/jupiter-client.js';
import { createExecutionRpc } from '../execution/rpc.js';
import { ExecutionError } from '../execution/errors.js';
import { requirePublicExecutionIntent } from '../execution/service.js';
import { applyMigrations, openSqliteDatabase } from '../persistence/sqlite/index.js';
import { readOptionalEnv } from '../utils/parse-env.js';
import { createProcessTerminalAdapter, promptHiddenSecret } from '../wallet/secret-input.js';
import { LIVE_DATABASE_DISABLED_MESSAGE } from './constants.js';
import { LiveError } from './errors.js';
import { executeLiveBroadcast } from './execute.js';
import {
  assertLiveExecuteGates,
  assertMainnetLiveNetwork,
  assertNoConfirmationBypassEnv,
  assertNoExtraLiveArguments,
} from './gates.js';
import { executeLiveHistory } from './history.js';
import { createLiveAttemptStore, type LiveAttemptStore } from './persistence.js';
import { executeLivePreview } from './preview.js';
import { executeLiveReconcile } from './reconcile.js';
import { createLiveRpc } from './rpc.js';
import { buildLiveStatusReport } from './service.js';
import type { LiveHistoryEntry, LivePreviewReport, LiveReceiptReport, LiveStatusReport } from './types.js';

export function executeLiveStatus(source: EnvSource): LiveStatusReport {
  return buildLiveStatusReport(loadConfig(source));
}

export function runLiveStatus(source: EnvSource, argv: readonly string[]): LiveStatusReport {
  assertNoExtraLiveArguments(argv, 'live:status');
  return executeLiveStatus(source);
}

export async function runLivePreview(source: EnvSource, argv: readonly string[]): Promise<LivePreviewReport> {
  assertNoExtraLiveArguments(argv, 'live:preview');
  const config = loadConfig(source);
  assertMainnetLiveNetwork(config);
  const intent = mapIntent(config);
  const { store, close } = tryOpenLiveStore(config);
  try {
    return await executeLivePreview({
      intent,
      jupiter: createJupiter(source, config),
      executionRpc: createExecutionRpc(config.solana.rpcUrl, config.solana.rpcTimeoutMs),
      liveRpc: createLiveRpc(config.solana.rpcUrl, config.solana.rpcTimeoutMs),
      store,
      network: config.solana.network,
    });
  } finally {
    close();
  }
}

export async function runLiveExecute(source: EnvSource, argv: readonly string[]): Promise<LiveReceiptReport> {
  assertNoExtraLiveArguments(argv, 'live:execute');
  assertNoConfirmationBypassEnv(source);
  const config = loadConfig(source);
  assertLiveExecuteGates(config);
  assertMainnetLiveNetwork(config);
  const intent = mapIntent(config);
  const opened = requireLiveStore(config);
  try {
    return await executeLiveBroadcast({
      intent,
      jupiter: createJupiter(source, config),
      executionRpc: createExecutionRpc(config.solana.rpcUrl, config.solana.rpcTimeoutMs),
      liveRpc: createLiveRpc(config.solana.rpcUrl, config.solana.rpcTimeoutMs),
      store: opened.store,
      promptSecret: () => promptHiddenSecret(createProcessTerminalAdapter()),
    });
  } finally {
    opened.close();
  }
}

export function runLiveHistory(source: EnvSource, argv: readonly string[]): LiveHistoryEntry[] {
  assertNoExtraLiveArguments(argv, 'live:history');
  const config = loadConfig(source);
  const opened = requireLiveStore(config);
  try {
    return executeLiveHistory(opened.store);
  } finally {
    opened.close();
  }
}

export async function runLiveReconcile(source: EnvSource, argv: readonly string[]): Promise<LiveReceiptReport> {
  assertNoExtraLiveArguments(argv, 'live:reconcile');
  const config = loadConfig(source);
  assertMainnetLiveNetwork(config);
  const opened = requireLiveStore(config);
  try {
    return await executeLiveReconcile({
      store: opened.store,
      liveRpc: createLiveRpc(config.solana.rpcUrl, config.solana.rpcTimeoutMs),
    });
  } finally {
    opened.close();
  }
}

function mapIntent(config: AppConfig) {
  try {
    return requirePublicExecutionIntent(config);
  } catch (error: unknown) {
    if (error instanceof ExecutionError && error.code === 'missing_public_config') {
      throw new LiveError(
        'l16_v1 requires EXECUTION_TAKER_PUBKEY, EXECUTION_INPUT_MINT, EXECUTION_OUTPUT_MINT, and EXECUTION_AMOUNT_RAW.',
        { cause: error, code: 'missing_public_config' },
      );
    }
    throw error;
  }
}

function createJupiter(source: EnvSource, config: AppConfig) {
  const apiKey = readOptionalEnv(source, 'JUPITER_API_KEY');
  return createJupiterBuildClient({
    timeoutMs: config.execution.providerTimeoutMs,
    ...(apiKey === undefined ? {} : { apiKey }),
  });
}

function requireLiveStore(config: AppConfig): { store: LiveAttemptStore; close: () => void } {
  if (!config.database.enabled) {
    throw new LiveError(LIVE_DATABASE_DISABLED_MESSAGE, { code: 'database_disabled' });
  }
  const database = openSqliteDatabase(config.database);
  applyMigrations(database);
  return {
    store: createLiveAttemptStore(database),
    close() {
      closeDatabase(database);
    },
  };
}

function tryOpenLiveStore(config: AppConfig): { store: LiveAttemptStore | null; close: () => void } {
  if (!config.database.enabled) {
    return {
      store: null,
      close() {
        return undefined;
      },
    };
  }
  return requireLiveStore(config);
}

function closeDatabase(database: DatabaseSync): void {
  database.close();
}
