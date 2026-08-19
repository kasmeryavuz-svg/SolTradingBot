import { isCanonicalAmountRaw, isCanonicalSolanaAddress } from '../execution/intent.js';
import {
  ConfigError,
  parseIntegerInInclusiveRange,
  readOptionalEnv,
} from '../utils/parse-env.js';
import {
  DEFAULT_EXECUTION_PROVIDER_TIMEOUT_MS,
  EXECUTION_PROVIDER_TIMEOUT_MS_MIN,
  EXECUTION_PROVIDER_TIMEOUT_MS_MAX,
} from './defaults.js';
import { loadCoreConfig } from './load-core-config.js';
import type { AppConfig, EnvSource } from './types.js';

export function loadConfig(source: EnvSource): AppConfig {
  return {
    ...loadCoreConfig(source),
    execution: loadExecutionConfig(source),
    walletIntelligence: loadWalletIntelligenceConfig(source),
  };
}

function loadExecutionConfig(source: EnvSource): AppConfig['execution'] {
  return {
    takerPublicKey: parseOptionalCanonicalAddress(
      readOptionalEnv(source, 'EXECUTION_TAKER_PUBKEY'),
      'EXECUTION_TAKER_PUBKEY',
    ),
    inputMint: parseOptionalCanonicalAddress(
      readOptionalEnv(source, 'EXECUTION_INPUT_MINT'),
      'EXECUTION_INPUT_MINT',
    ),
    outputMint: parseOptionalCanonicalAddress(
      readOptionalEnv(source, 'EXECUTION_OUTPUT_MINT'),
      'EXECUTION_OUTPUT_MINT',
    ),
    amountRaw: parseOptionalCanonicalAmountRaw(
      readOptionalEnv(source, 'EXECUTION_AMOUNT_RAW'),
      'EXECUTION_AMOUNT_RAW',
    ),
    providerTimeoutMs: parseIntegerInInclusiveRange(
      readOptionalEnv(source, 'EXECUTION_PROVIDER_TIMEOUT_MS'),
      DEFAULT_EXECUTION_PROVIDER_TIMEOUT_MS,
      'EXECUTION_PROVIDER_TIMEOUT_MS',
      EXECUTION_PROVIDER_TIMEOUT_MS_MIN,
      EXECUTION_PROVIDER_TIMEOUT_MS_MAX,
    ),
    jupiterApiKeyConfigured: readOptionalEnv(source, 'JUPITER_API_KEY') !== undefined,
  };
}

function loadWalletIntelligenceConfig(source: EnvSource): AppConfig['walletIntelligence'] {
  return {
    heliusApiKey: readOptionalEnv(source, 'HELIUS_API_KEY') ?? null,
  };
}

function parseOptionalCanonicalAddress(raw: string | undefined, name: string): string | null {
  if (raw === undefined) {
    return null;
  }
  if (!isCanonicalSolanaAddress(raw)) {
    throw new ConfigError(`Invalid ${name}. Expected a valid Solana address.`);
  }
  return raw;
}

function parseOptionalCanonicalAmountRaw(raw: string | undefined, name: string): string | null {
  if (raw === undefined) {
    return null;
  }
  if (!isCanonicalAmountRaw(raw)) {
    throw new ConfigError(
      `Invalid ${name}. Expected a canonical positive decimal integer string in native token units.`,
    );
  }
  return raw;
}
