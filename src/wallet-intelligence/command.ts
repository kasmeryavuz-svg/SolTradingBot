import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { MEMORY_DATABASE_PATH } from '../config/defaults.js';
import { loadConfig } from '../config/load-config.js';
import type { AppConfig, EnvSource } from '../config/types.js';
import { resolveDatabasePath } from '../persistence/path.js';
import { openSqliteDatabase } from '../persistence/sqlite/database.js';
import { currentSchemaVersion } from '../persistence/sqlite/migrations.js';
import { REQUIRED_SCHEMA_VERSION } from './constants.js';
import { WalletIntelligenceError } from './errors.js';
import { validateCanonicalMintInput } from './mint.js';
import { createHeliusWalletIntelligenceProvider } from './provider.js';
import { secretsFromApiKey } from './sanitize.js';
import type { WalletIntelligenceProvider } from './types.js';

export function prepareWalletIntelligenceStatusCommand(source: EnvSource): AppConfig {
  return loadConfig(source);
}

export function prepareWalletIntelligenceNetworkCommand(source: EnvSource): AppConfig {
  const config = loadConfig(source);
  if (config.solana.network !== 'mainnet-beta') {
    throw new WalletIntelligenceError(
      'Wallet intelligence production network commands are mainnet-only. Set SOLANA_NETWORK=mainnet-beta.',
      { code: 'unsupported_network' },
    );
  }
  if (config.walletIntelligence.heliusApiKey === null) {
    throw new WalletIntelligenceError(
      'HELIUS_API_KEY is required for wallet-intelligence network commands. Put the key in .env, not in a URL.',
      { code: 'missing_helius_api_key' },
    );
  }
  return config;
}

export function prepareWalletIntelligenceScanCommand(source: EnvSource): AppConfig {
  const config = prepareWalletIntelligenceNetworkCommand(source);
  if (!config.database.enabled) {
    throw new WalletIntelligenceError(
      'Persistence is disabled. Set DATABASE_ENABLED=true to run wallet-intel:scan.',
      { code: 'database_unavailable' },
    );
  }
  return config;
}

export function prepareWalletIntelligenceReadCommand(source: EnvSource): AppConfig {
  const config = loadConfig(source);
  if (!config.database.enabled) {
    throw new WalletIntelligenceError(
      'Persistence is disabled. Set DATABASE_ENABLED=true to read wallet-intelligence scans.',
      { code: 'database_unavailable' },
    );
  }
  return config;
}

export function requireWalletIntelligenceMintArgument(argv: readonly string[], command: string): string {
  const extras = argv.slice(2).filter((value) => value.trim() !== '');
  if (extras.length !== 1 || extras[0] === undefined) {
    throw new WalletIntelligenceError(`Usage: npm run ${command} -- <TOKEN_MINT>`, { code: 'invalid_mint' });
  }
  return validateCanonicalMintInput(extras[0]);
}

export function assertNoExtraWalletIntelligenceArguments(argv: readonly string[], command: string): void {
  const extras = argv.slice(2).filter((value) => value.trim() !== '');
  if (extras.length > 0) {
    throw new WalletIntelligenceError(`Unexpected extra arguments. Usage: npm run ${command}.`, {
      code: 'wallet_intelligence_failed',
    });
  }
}

export function createConfiguredWalletIntelligenceProvider(
  config: AppConfig,
  provider?: WalletIntelligenceProvider,
): WalletIntelligenceProvider {
  if (provider !== undefined) {
    return provider;
  }
  const apiKey = config.walletIntelligence.heliusApiKey;
  if (apiKey === null) {
    throw new WalletIntelligenceError('HELIUS_API_KEY is required for wallet-intelligence network commands.', {
      code: 'missing_helius_api_key',
    });
  }
  return createHeliusWalletIntelligenceProvider({ apiKey });
}

export function configuredSecrets(config: AppConfig): string[] {
  return secretsFromApiKey(config.walletIntelligence.heliusApiKey);
}

export function openWalletIntelligenceDatabase(config: AppConfig, mode: 'read' | 'write'): DatabaseSync {
  const location = resolveDatabasePath(config.database.path);
  if (location !== MEMORY_DATABASE_PATH && !existsSync(location)) {
    throw new WalletIntelligenceError(
      'Wallet intelligence database file was not found. Run npm run db:init first.',
      { code: 'database_unavailable' },
    );
  }
  if (mode === 'read') {
    const database = new DatabaseSync(location, {
      timeout: config.database.busyTimeoutMs,
      enableForeignKeyConstraints: true,
      readOnly: location !== MEMORY_DATABASE_PATH,
    });
    database.exec('PRAGMA foreign_keys = ON');
    if (location !== MEMORY_DATABASE_PATH) {
      database.exec('PRAGMA query_only = ON');
    }
    assertSchema9(database);
    return database;
  }
  const database = openSqliteDatabase(config.database);
  assertSchema9(database);
  return database;
}

function assertSchema9(database: DatabaseSync): void {
  if (currentSchemaVersion(database) !== REQUIRED_SCHEMA_VERSION) {
    database.close();
    throw new WalletIntelligenceError(
      `Wallet intelligence requires schema ${String(REQUIRED_SCHEMA_VERSION)}. Run npm run db:init.`,
      { code: 'schema_mismatch' },
    );
  }
}
