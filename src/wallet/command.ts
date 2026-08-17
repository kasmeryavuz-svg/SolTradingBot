import { loadConfig } from '../config/load-config.js';
import type { AppConfig, EnvSource } from '../config/types.js';
import { assertTradingDisabled, TradingSafetyError } from '../core/safety.js';
import { assertMainnet } from '../execution/command.js';
import { ExecutionError } from '../execution/errors.js';
import { createJupiterBuildClient } from '../execution/jupiter-client.js';
import { createExecutionRpc } from '../execution/rpc.js';
import { requirePublicExecutionIntent } from '../execution/service.js';
import { readOptionalEnv } from '../utils/parse-env.js';
import { createWalletSelfTestChallenge } from './challenge.js';
import { WALLET_SPEC_VERSION, WALLET_TRADING_ENABLED_REFUSAL } from './constants.js';
import { WalletError } from './errors.js';
import {
  WALLET_DEFINITION_FINGERPRINT,
  fingerprintSignature,
  fingerprintWalletSigner,
  fingerprintWalletSigningProof,
} from './identity.js';
import { executeWalletSignPreflight } from './preflight-sign.js';
import { createProcessTerminalAdapter, promptHiddenSecret } from './secret-input.js';
import { buildWalletStatusReport, buildWalletVerifyReport, requireConfiguredTaker } from './service.js';
import { withInteractiveSigner, type SecretPrompt } from './signer-scope.js';
import type {
  WalletPreflightSignReport,
  WalletSelfTestProof,
  WalletStatusReport,
  WalletVerifyReport,
} from './types.js';
import { signAndVerifySelfTest } from './verify.js';
import { zeroizeBytes } from './zeroize.js';

export function prepareWalletCommand(source: EnvSource): AppConfig {
  const config = loadConfig(source);
  try {
    assertTradingDisabled(config);
  } catch (error: unknown) {
    if (error instanceof TradingSafetyError) {
      throw new WalletError(WALLET_TRADING_ENABLED_REFUSAL, {
        cause: error,
        code: 'trading_enabled',
      });
    }
    throw error;
  }
  return config;
}

export function assertNoExtraWalletArguments(argv: readonly string[], command: string): void {
  const extras = argv.slice(2).filter((value) => value.trim() !== '');
  if (extras.length > 0) {
    throw new WalletError(`Unexpected extra arguments. Usage: npm run ${command}`, {
      code: 'unexpected_arguments',
    });
  }
}

export function executeWalletStatus(source: EnvSource): WalletStatusReport {
  return buildWalletStatusReport(loadConfig(source));
}

export async function executeWalletVerify(
  source: EnvSource,
  options: { promptSecret?: SecretPrompt } = {},
): Promise<WalletVerifyReport> {
  const config = prepareWalletCommand(source);
  const taker = requireConfiguredTaker(config);
  return withInteractiveSigner(taker, (signer) => Promise.resolve(buildWalletVerifyReport(signer, taker)), options);
}

export async function executeWalletSignTest(
  source: EnvSource,
  options: { promptSecret?: SecretPrompt } = {},
): Promise<WalletSelfTestProof> {
  const config = prepareWalletCommand(source);
  const taker = requireConfiguredTaker(config);
  return withInteractiveSigner(
    taker,
    async (signer) => {
      const challenge = createWalletSelfTestChallenge(signer.address);
      const signature = await signAndVerifySelfTest(signer, challenge.bytes);
      try {
        const unsignedProof = {
          walletSpecVersion: WALLET_SPEC_VERSION,
          walletDefinitionFingerprint: WALLET_DEFINITION_FINGERPRINT,
          signerAddress: signer.address,
          walletSignerFingerprint: fingerprintWalletSigner(signer.address),
          purpose: 'w15_self_test_challenge' as const,
          challengeFingerprint: challenge.fingerprint,
          signatureFingerprint: fingerprintSignature(signature),
          signatureVerified: true as const,
        };
        return {
          ...unsignedProof,
          walletSigningProofFingerprint: fingerprintWalletSigningProof(unsignedProof),
        };
      } finally {
        zeroizeBytes(signature);
      }
    },
    options,
  );
}

export async function runWalletSignPreflight(
  source: EnvSource,
  options: { promptSecret?: SecretPrompt } = {},
): Promise<WalletPreflightSignReport> {
  const config = prepareWalletCommand(source);
  try {
    assertMainnet(config);
  } catch (error: unknown) {
    if (error instanceof ExecutionError) {
      throw new WalletError(error.message, { cause: error, code: 'preflight_not_passed' });
    }
    throw error;
  }
  let intent: ReturnType<typeof requirePublicExecutionIntent>;
  try {
    intent = requirePublicExecutionIntent(config);
  } catch (error: unknown) {
    if (error instanceof ExecutionError && error.code === 'missing_public_config') {
      throw new WalletError(
        'Checkpoint 15 will not request a wallet secret before required public execution config is present.',
        { cause: error, code: 'wallet_config_missing' },
      );
    }
    throw error;
  }

  const apiKey = readOptionalEnv(source, 'JUPITER_API_KEY');
  const jupiter = createJupiterBuildClient({
    timeoutMs: config.execution.providerTimeoutMs,
    ...(apiKey === undefined ? {} : { apiKey }),
  });
  const rpc = createExecutionRpc(config.solana.rpcUrl, config.solana.rpcTimeoutMs);
  return executeWalletSignPreflight({
    intent,
    jupiter,
    rpc,
    promptSecret: options.promptSecret ?? defaultSecretPrompt,
  });
}

function defaultSecretPrompt(): Promise<string> {
  return promptHiddenSecret(createProcessTerminalAdapter());
}
