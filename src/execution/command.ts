import { loadConfig } from '../config/load-config.js';
import { readOptionalEnv } from '../utils/parse-env.js';
import type { AppConfig, EnvSource } from '../config/types.js';
import { assertTradingDisabled, TradingSafetyError } from '../core/safety.js';
import {
  EXECUTION_MISSING_PUBLIC_CONFIG_MESSAGE,
  EXECUTION_TRADING_ENABLED_REFUSAL,
  EXECUTION_UNSUPPORTED_NETWORK_MESSAGE,
} from './constants.js';
import { ExecutionError } from './errors.js';
import { createJupiterBuildClient } from './jupiter-client.js';
import { createExecutionRpc } from './rpc.js';
import {
  buildStatusReport,
  executeExecutionBuild,
  executeExecutionSimulate,
  requirePublicExecutionIntent,
} from './service.js';
import type { ExecutionBuildReport, ExecutionSimulateReport, ExecutionStatusReport } from './types.js';

export function readJupiterApiKey(source: EnvSource): string | undefined {
  return readOptionalEnv(source, 'JUPITER_API_KEY');
}

export function prepareExecutionCommand(source: EnvSource): AppConfig {
  const config = loadConfig(source);
  try {
    assertTradingDisabled(config);
  } catch (error: unknown) {
    if (error instanceof TradingSafetyError) {
      throw new ExecutionError(EXECUTION_TRADING_ENABLED_REFUSAL, {
        cause: error,
        code: 'trading_enabled',
      });
    }
    throw error;
  }
  return config;
}

export function assertNoExtraExecutionArguments(argv: readonly string[], command: string): void {
  const extras = argv.slice(2).filter((value) => value.trim() !== '');
  if (extras.length > 0) {
    throw new ExecutionError(`Unexpected extra arguments. Usage: npm run ${command}`);
  }
}

export function executeExecutionStatus(source: EnvSource): ExecutionStatusReport {
  const config = prepareExecutionCommand(source);
  return buildStatusReport(config);
}

export async function runExecutionBuild(source: EnvSource): Promise<ExecutionBuildReport> {
  const config = prepareExecutionCommand(source);
  assertMainnet(config);
  const intent = requirePublicExecutionIntent(config);
  const apiKey = readJupiterApiKey(source);
  const jupiter = createJupiterBuildClient({
    timeoutMs: config.execution.providerTimeoutMs,
    ...(apiKey === undefined ? {} : { apiKey }),
  });
  return executeExecutionBuild({ intent, jupiter });
}

export async function runExecutionSimulate(source: EnvSource): Promise<ExecutionSimulateReport> {
  const config = prepareExecutionCommand(source);
  assertMainnet(config);
  const intent = requirePublicExecutionIntent(config);
  const apiKey = readJupiterApiKey(source);
  const jupiter = createJupiterBuildClient({
    timeoutMs: config.execution.providerTimeoutMs,
    ...(apiKey === undefined ? {} : { apiKey }),
  });
  const rpc = createExecutionRpc(config.solana.rpcUrl, config.solana.rpcTimeoutMs);
  return executeExecutionSimulate({ intent, jupiter, rpc });
}

export function assertMainnet(config: AppConfig): void {
  if (config.solana.network !== 'mainnet-beta') {
    throw new ExecutionError(EXECUTION_UNSUPPORTED_NETWORK_MESSAGE, { code: 'unsupported_network' });
  }
}

export function assertPublicConfigPresent(config: AppConfig): void {
  try {
    requirePublicExecutionIntent(config);
  } catch (error: unknown) {
    if (error instanceof ExecutionError && error.code === 'missing_public_config') {
      throw new ExecutionError(EXECUTION_MISSING_PUBLIC_CONFIG_MESSAGE, { code: 'missing_public_config' });
    }
    throw error;
  }
}
