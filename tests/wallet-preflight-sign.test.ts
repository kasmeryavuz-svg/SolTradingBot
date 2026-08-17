import { describe, expect, it } from 'vitest';
import { SOLANA_TESTNET_GENESIS_HASH } from '../src/execution/constants.js';
import { compileUnsignedCandidate, validateJupiterBuild } from '../src/execution/index.js';
import { WalletError } from '../src/wallet/errors.js';
import { executeWalletSignPreflight, runWalletSignPreflight } from '../src/wallet/index.js';
import {
  assertCandidateBindingUnchanged,
  captureCandidateBinding,
} from '../src/wallet/preflight-sign.js';
import { assertCompiledSignerSet, signAndVerifyTransaction, verifyMessageSignature } from '../src/wallet/verify.js';
import { publicExecutionEnv } from './execution-fixtures.js';
import {
  loadTestWalletFixture,
  passingExecutionRpc,
  walletExecutionIntent,
  walletJupiterBuild,
} from './wallet-fixtures.js';

function countingPrompt(secret: string): { promptSecret: () => Promise<string>; count: () => number } {
  let count = 0;
  return {
    count: () => count,
    promptSecret: () => {
      count += 1;
      return Promise.resolve(secret);
    },
  };
}

describe('wallet sign-preflight', () => {
  it('signs the exact simulation_passed candidate and returns only a public proof', async () => {
    const fixture = await loadTestWalletFixture();
    const prompt = countingPrompt(fixture.secretBase58);
    const report = await executeWalletSignPreflight({
      intent: walletExecutionIntent(fixture.address),
      jupiter: { build: () => Promise.resolve(walletJupiterBuild(fixture.address)) },
      rpc: passingExecutionRpc(),
      promptSecret: prompt.promptSecret,
    });
    expect(prompt.count()).toBe(1);
    expect(report.executionStatus).toBe('simulation_passed');
    expect(report.proof.signatureVerified).toBe(true);
    expect(report.proof.signerAddress).toBe(fixture.address);
    expect(report.proof.purpose).toBe('exact_e14_final_preflight_candidate');
    expect(JSON.stringify(report.proof)).not.toContain(fixture.secretBase58);
    expect(report.proof).not.toHaveProperty('signedTransaction');
    expect(report.proof).not.toHaveProperty('wireBytes');
    expect(report.proof).not.toHaveProperty('base64Wire');
    expect(report).not.toHaveProperty('signedTransaction');
  });

  it('does not prompt unless e14 status is simulation_passed', async () => {
    const fixture = await loadTestWalletFixture();
    const cases: Array<{ name: string; rpc?: ReturnType<typeof passingExecutionRpc>; jupiterFail?: boolean }> = [
      {
        name: 'cluster mismatch',
        rpc: passingExecutionRpc({
          getGenesisHash: () => Promise.resolve(SOLANA_TESTNET_GENESIS_HASH),
        }),
      },
      {
        name: 'simulation failed',
        rpc: passingExecutionRpc({
          simulateTransaction: () =>
            Promise.resolve({
              ok: false,
              unitsConsumed: 10n,
              errorSummary: 'fail',
              logs: [],
              failureKind: 'program_error',
            }),
        }),
      },
      {
        name: 'expired blockhash',
        rpc: passingExecutionRpc({
          getBlockHeight: () => Promise.resolve(2_000n),
        }),
      },
      {
        name: 'jupiter failure',
        jupiterFail: true,
      },
    ];

    for (const testCase of cases) {
      const prompt = countingPrompt(fixture.secretBase58);
      await expect(
        executeWalletSignPreflight({
          intent: walletExecutionIntent(fixture.address),
          jupiter: {
            build: () =>
              testCase.jupiterFail === true
                ? Promise.reject(new Error('jupiter down'))
                : Promise.resolve(walletJupiterBuild(fixture.address)),
          },
          rpc: testCase.rpc ?? passingExecutionRpc(),
          promptSecret: prompt.promptSecret,
        }),
      ).rejects.toBeInstanceOf(Error);
      expect(prompt.count(), testCase.name).toBe(0);
    }
  });

  it('does not prompt for trading-enabled, missing config, or extra args at the command layer', async () => {
    const fixture = await loadTestWalletFixture();
    const prompt = countingPrompt(fixture.secretBase58);
    await expect(
      runWalletSignPreflight({ ...publicExecutionEnv(), TRADING_ENABLED: 'true' }, prompt),
    ).rejects.toMatchObject({ code: 'trading_enabled' });
    await expect(
      runWalletSignPreflight(
        {
          TRADING_ENABLED: 'false',
          SOLANA_NETWORK: 'mainnet-beta',
        },
        prompt,
      ),
    ).rejects.toMatchObject({ code: 'wallet_config_missing' });
    await expect(
      runWalletSignPreflight(
        {
          ...publicExecutionEnv({ EXECUTION_TAKER_PUBKEY: fixture.address }),
          SOLANA_NETWORK: 'devnet',
        },
        prompt,
      ),
    ).rejects.toMatchObject({ code: 'preflight_not_passed' });
    expect(prompt.count()).toBe(0);
  });

  it('refuses when the candidate identity changes after preflight', async () => {
    const fixture = await loadTestWalletFixture();
    const intent = walletExecutionIntent(fixture.address);
    const build = validateJupiterBuild(walletJupiterBuild(fixture.address), intent);
    const compiled = compileUnsignedCandidate(build, {
      feePayer: fixture.address,
      computeUnitLimit: 120_000,
      includeComputeUnitPrice: true,
    });
    const report = {
      status: 'simulation_passed' as const,
      finalComputeUnitLimit: 120_000,
      executionDefinitionFingerprint: 'a'.repeat(64),
      executionIntentFingerprint: 'b'.repeat(64),
      jupiterBuildFingerprint: 'c'.repeat(64),
      executionCandidateFingerprint: 'd'.repeat(64),
      candidate: compiled.candidate,
      intent,
    };
    const bound = captureCandidateBinding(report as never, fixture.address);
    const mutated = {
      ...report,
      candidate: {
        ...compiled.candidate,
        compiledMessageSha256: 'e'.repeat(64),
      },
    };
    expect(() => {
      assertCandidateBindingUnchanged(
        bound,
        mutated as never,
        compiled.candidate.compiledMessageSha256,
        fixture.address,
      );
    }).toThrow(WalletError);
  });

  it('verifies only the exact signer and exact compiled message', async () => {
    const fixture = await loadTestWalletFixture();
    const other = await loadTestWalletFixture('other');
    const intent = walletExecutionIntent(fixture.address);
    const build = validateJupiterBuild(walletJupiterBuild(fixture.address), intent);
    const compiled = compileUnsignedCandidate(build, {
      feePayer: fixture.address,
      computeUnitLimit: 120_000,
      includeComputeUnitPrice: true,
    });
    const prompt = countingPrompt(fixture.secretBase58);
    const signed = await executeWalletSignPreflight({
      intent,
      jupiter: { build: () => Promise.resolve(walletJupiterBuild(fixture.address)) },
      rpc: passingExecutionRpc(),
      promptSecret: prompt.promptSecret,
    });
    expect(signed.proof.compiledMessageSha256).toBe(compiled.candidate.compiledMessageSha256);
    expect(signed.proof.signatureVerified).toBe(true);

    const otherBuild = validateJupiterBuild(walletJupiterBuild(other.address), walletExecutionIntent(other.address));
    const otherCompiled = compileUnsignedCandidate(otherBuild, {
      feePayer: other.address,
      computeUnitLimit: 120_000,
      includeComputeUnitPrice: true,
    });
    await expect(
      signAndVerifyTransaction({
        signer: {
          address: other.address as never,
          signMessages: () => Promise.resolve([]),
          signTransactions: () => Promise.resolve([{ [other.address]: new Uint8Array(64) }]),
        },
        transaction: otherCompiled.compiledTransaction,
        expectedAddress: fixture.address,
      }),
    ).rejects.toMatchObject({ code: 'compiled_signer_mismatch' });

    await expect(
      signAndVerifyTransaction({
        signer: {
          address: other.address as never,
          signMessages: () => Promise.resolve([]),
          signTransactions: () => Promise.resolve([{ [other.address]: new Uint8Array(64) }]),
        },
        transaction: compiled.compiledTransaction,
        expectedAddress: fixture.address,
      }),
    ).rejects.toMatchObject({ code: 'signature_verification_failed' });

    expect(() => {
      assertCompiledSignerSet(
        {
          ...compiled.compiledTransaction,
          signatures: {
            [fixture.address]: null,
            [other.address]: null,
          },
        },
        fixture.address,
      );
    }).toThrow(/compiled required-signer set/i);

    const changedMessage = Uint8Array.from(compiled.compiledTransaction.messageBytes);
    changedMessage[0] = (changedMessage[0] ?? 0) ^ 0xff;
    await expect(
      verifyMessageSignature({
        signerAddress: fixture.address,
        messageBytes: changedMessage,
        signatureBytes: new Uint8Array(64),
      }),
    ).rejects.toMatchObject({ code: 'signature_verification_failed' });
  });
});
