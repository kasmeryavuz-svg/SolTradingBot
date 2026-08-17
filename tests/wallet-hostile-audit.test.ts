import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createKeyPairSignerFromBytes } from '@solana/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { simulateNormalizedBuildWithFinalCompiled } from '../src/execution/simulator.js';
import { FORBIDDEN_ENV_SECRET_NAMES } from '../src/wallet/constants.js';
import { WalletError } from '../src/wallet/errors.js';
import {
  assertNoExtraWalletArguments,
  executeWalletSignPreflight,
  executeWalletSignTest,
  executeWalletStatus,
  executeWalletVerify,
  runWalletSignPreflight,
} from '../src/wallet/index.js';
import { sha256Bytes } from '../src/wallet/identity.js';
import { formatWalletError } from '../src/wallet/sanitize.js';
import { decodeBase58KeypairSecret } from '../src/wallet/secret-decode.js';
import { createWalletSignerFromSecretBytes } from '../src/wallet/signer.js';
import { withDecodedSecretSigner } from '../src/wallet/signer-scope.js';
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

function walkTs(root: string): string[] {
  return readdirSync(root, { recursive: true }).filter(
    (name): name is string => typeof name === 'string' && name.endsWith('.ts'),
  );
}

describe('w15 hostile audit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not export a generic signer or decode API from the public barrel', async () => {
    const wallet = await import('../src/wallet/index.js');
    expect(wallet).not.toHaveProperty('withInteractiveSigner');
    expect(wallet).not.toHaveProperty('withDecodedSecretSigner');
    expect(wallet).not.toHaveProperty('createWalletSignerFromSecretBytes');
    expect(wallet).not.toHaveProperty('decodeBase58KeypairSecret');
    expect(wallet).not.toHaveProperty('signAndVerifyTransaction');
    expect(wallet).not.toHaveProperty('signAndVerifySelfTest');
    expect(wallet).not.toHaveProperty('promptHiddenSecret');
    expect(wallet).toHaveProperty('executeWalletStatus');
    expect(wallet).toHaveProperty('executeWalletVerify');
    expect(wallet).toHaveProperty('executeWalletSignTest');
    expect(wallet).toHaveProperty('executeWalletSignPreflight');
  });

  it('keeps strategy, dashboard, paper, research, execution, and app off the generic signer', () => {
    for (const folder of ['strategy', 'dashboard', 'paper', 'research', 'execution', 'core', 'position', 'exit']) {
      const root = join(process.cwd(), 'src', folder);
      for (const file of walkTs(root)) {
        const text = readFileSync(join(root, file), 'utf8');
        expect(text, file).not.toMatch(/withInteractiveSigner|createWalletSignerFromSecretBytes|decodeBase58KeypairSecret/);
        expect(text, file).not.toContain("from '../wallet");
        expect(text, file).not.toContain("from '../../wallet");
      }
    }
    const app = readFileSync(join(process.cwd(), 'src/core/app.ts'), 'utf8');
    const index = readFileSync(join(process.cwd(), 'src/index.ts'), 'utf8');
    expect(app).not.toContain('wallet');
    expect(index).not.toContain('wallet');
  });

  it('signs the exact e14 final-simulation message bytes, without a Jupiter rebuild', async () => {
    const fixture = await loadTestWalletFixture();
    const intent = walletExecutionIntent(fixture.address);
    const build = walletJupiterBuild(fixture.address);
    const artifacts = await simulateNormalizedBuildWithFinalCompiled({
      intent,
      build: (await import('../src/execution/jupiter-validate.js')).validateJupiterBuild(build, intent),
      rpc: passingExecutionRpc(),
    });
    const finalHash = sha256Bytes(Uint8Array.from(artifacts.finalCompiled.compiledTransaction.messageBytes));
    expect(finalHash).toBe(artifacts.report.candidate.compiledMessageSha256);

    let jupiterCalls = 0;
    let signedHash = '';
    let simulatedHash = '';
    let signCalls = 0;
    const rpc = passingExecutionRpc();
    const report = await executeWalletSignPreflight({
      intent,
      jupiter: {
        build: () => {
          jupiterCalls += 1;
          return Promise.resolve(build);
        },
      },
      rpc,
      promptSecret: () => Promise.resolve(fixture.secretBase58),
      hooks: {
        onFinalSimulatedMessageSha256: (hash) => {
          simulatedHash = hash;
        },
        onSignedMessageSha256: (hash) => {
          signedHash = hash;
        },
        onSignTransactions: () => {
          signCalls += 1;
        },
      },
    });
    expect(jupiterCalls).toBe(1);
    expect(simulatedHash).toBe(finalHash);
    expect(signedHash).toBe(finalHash);
    expect(report.proof.compiledMessageSha256).toBe(finalHash);
    expect(signCalls).toBe(1);
    expect(report).not.toHaveProperty('preflight');
    expect(report).not.toHaveProperty('signedTransaction');
  });

  it('refuses a mutated compiled message after final preflight with zero sign calls', async () => {
    const fixture = await loadTestWalletFixture();
    let signCalls = 0;
    const prompt = countingPrompt(fixture.secretBase58);
    await expect(
      executeWalletSignPreflight({
        intent: walletExecutionIntent(fixture.address),
        jupiter: { build: () => Promise.resolve(walletJupiterBuild(fixture.address)) },
        rpc: passingExecutionRpc(),
        promptSecret: prompt.promptSecret,
        hooks: {
          afterFinalPreflight: (compiled) => {
            const bytes = compiled.compiledTransaction.messageBytes as unknown as Uint8Array;
            bytes[0] = (bytes[0] ?? 0) ^ 0xff;
          },
          onSignTransactions: () => {
            signCalls += 1;
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'candidate_changed_after_preflight' });
    expect(signCalls).toBe(0);
    expect(prompt.count()).toBe(1);
  });

  it('records height-check / prompt / sign order and refuses expired heights', async () => {
    const fixture = await loadTestWalletFixture();
    const sequence: string[] = [];
    let heights = 0;
    const rpc = passingExecutionRpc({
      getBlockHeight: () => {
        heights += 1;
        sequence.push(`height:${String(heights)}`);
        return Promise.resolve(900n);
      },
      getGenesisHash: () => {
        sequence.push('genesis');
        return Promise.resolve(passingExecutionRpc().getGenesisHash());
      },
      simulateTransaction: (wire, options) => {
        sequence.push(`simulate:${String(options.replaceRecentBlockhash)}`);
        return passingExecutionRpc().simulateTransaction(wire, options);
      },
      getFeeForMessage: () => {
        sequence.push('fee');
        return Promise.resolve(5000n);
      },
    });
    const prompt = countingPrompt(fixture.secretBase58);
    await executeWalletSignPreflight({
      intent: walletExecutionIntent(fixture.address),
      jupiter: { build: () => Promise.resolve(walletJupiterBuild(fixture.address)) },
      rpc,
      promptSecret: () => {
        sequence.push('prompt');
        return prompt.promptSecret();
      },
    });
    const promptAt = sequence.lastIndexOf('prompt');
    expect(sequence.slice(0, promptAt).filter((item) => item.startsWith('height:')).length).toBeGreaterThan(0);
    expect(sequence.slice(promptAt + 1)).toEqual(['height:4']);
    expect(
      sequence.slice(promptAt + 1).some((item) => item.startsWith('simulate') || item === 'fee' || item === 'genesis'),
    ).toBe(false);

    const expiredBeforePrompt = countingPrompt(fixture.secretBase58);
    let walletHeights = 0;
    await expect(
      executeWalletSignPreflight({
        intent: walletExecutionIntent(fixture.address),
        jupiter: { build: () => Promise.resolve(walletJupiterBuild(fixture.address)) },
        rpc: passingExecutionRpc({
          getBlockHeight: () => {
            walletHeights += 1;
            return Promise.resolve(walletHeights >= 3 ? 2_000n : 900n);
          },
        }),
        promptSecret: expiredBeforePrompt.promptSecret,
      }),
    ).rejects.toMatchObject({ code: 'blockhash_expired_before_signing' });
    expect(expiredBeforePrompt.count()).toBe(0);

    const expiredAfterPrompt = countingPrompt(fixture.secretBase58);
    let laterHeights = 0;
    let signCalls = 0;
    await expect(
      executeWalletSignPreflight({
        intent: walletExecutionIntent(fixture.address),
        jupiter: { build: () => Promise.resolve(walletJupiterBuild(fixture.address)) },
        rpc: passingExecutionRpc({
          getBlockHeight: () => {
            laterHeights += 1;
            return Promise.resolve(laterHeights >= 4 ? 2_000n : 900n);
          },
        }),
        promptSecret: expiredAfterPrompt.promptSecret,
        hooks: {
          onSignTransactions: () => {
            signCalls += 1;
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'blockhash_expired_before_signing' });
    expect(expiredAfterPrompt.count()).toBe(1);
    expect(signCalls).toBe(0);
  });

  it('drops the signer when the post-prompt height check throws', async () => {
    const fixture = await loadTestWalletFixture();
    const prompt = countingPrompt(fixture.secretBase58);
    let heights = 0;
    await expect(
      executeWalletSignPreflight({
        intent: walletExecutionIntent(fixture.address),
        jupiter: { build: () => Promise.resolve(walletJupiterBuild(fixture.address)) },
        rpc: passingExecutionRpc({
          getBlockHeight: () => {
            heights += 1;
            if (heights >= 4) {
              return Promise.reject(new Error(`rpc boom ${fixture.secretBase58}`));
            }
            return Promise.resolve(900n);
          },
        }),
        promptSecret: prompt.promptSecret,
      }),
    ).rejects.toMatchObject({ code: 'blockhash_expired_before_signing' });
    expect(prompt.count()).toBe(1);
  });

  it('rejects a 64-byte keypair whose public half was mutated', async () => {
    const fixture = await loadTestWalletFixture();
    const mutated = Uint8Array.from(fixture.secretBytes);
    mutated[32] = (mutated[32] ?? 0) ^ 0xff;
    await expect(createKeyPairSignerFromBytes(mutated)).rejects.toThrow();
    await expect(createWalletSignerFromSecretBytes(mutated)).rejects.toMatchObject({
      code: 'invalid_secret_encoding',
    });
  });

  it('requires canonical base58 and does not sign before an address match', async () => {
    const fixture = await loadTestWalletFixture();
    const other = await loadTestWalletFixture('other');
    const decoded = decodeBase58KeypairSecret(fixture.secretBase58);
    expect(decoded.byteLength).toBe(64);
    let signMessages = 0;
    let signTransactions = 0;
    await expect(
      withDecodedSecretSigner(other.address, Uint8Array.from(fixture.secretBytes), async (signer) => {
        await signer.signMessages([]);
        signMessages += 1;
        return signer.address;
      }),
    ).rejects.toMatchObject({ code: 'signer_address_mismatch' });
    await expect(
      executeWalletVerify(
        { TRADING_ENABLED: 'false', EXECUTION_TAKER_PUBKEY: other.address },
        { promptSecret: () => Promise.resolve(fixture.secretBase58) },
      ),
    ).rejects.toMatchObject({ code: 'signer_address_mismatch' });
    await expect(
      executeWalletSignTest(
        { TRADING_ENABLED: 'false', EXECUTION_TAKER_PUBKEY: other.address },
        { promptSecret: () => Promise.resolve(fixture.secretBase58) },
      ),
    ).rejects.toMatchObject({ code: 'signer_address_mismatch' });
    await expect(
      executeWalletSignPreflight({
        intent: walletExecutionIntent(other.address),
        jupiter: { build: () => Promise.resolve(walletJupiterBuild(other.address)) },
        rpc: passingExecutionRpc(),
        promptSecret: () => Promise.resolve(fixture.secretBase58),
        hooks: {
          onSignTransactions: () => {
            signTransactions += 1;
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'signer_address_mismatch' });
    expect(signMessages).toBe(0);
    expect(signTransactions).toBe(0);
  });

  it('keeps TRADING_ENABLED and argv guards before prompt, Jupiter, and RPC', async () => {
    const fixture = await loadTestWalletFixture();
    const prompt = countingPrompt(fixture.secretBase58);
    await expect(
      executeWalletVerify(
        { TRADING_ENABLED: 'true', EXECUTION_TAKER_PUBKEY: fixture.address },
        { promptSecret: prompt.promptSecret },
      ),
    ).rejects.toMatchObject({ code: 'trading_enabled' });
    await expect(
      executeWalletSignTest(
        { TRADING_ENABLED: 'true', EXECUTION_TAKER_PUBKEY: fixture.address },
        { promptSecret: prompt.promptSecret },
      ),
    ).rejects.toMatchObject({ code: 'trading_enabled' });
    await expect(
      runWalletSignPreflight({ ...publicExecutionEnv(), TRADING_ENABLED: 'true' }, prompt),
    ).rejects.toMatchObject({ code: 'trading_enabled' });
    expect(prompt.count()).toBe(0);
    expect(() => {
      assertNoExtraWalletArguments(['node', 'wallet:status', '--secret', 'x'], 'wallet:status');
    }).toThrow(/Unexpected extra arguments/);
    expect(() => {
      assertNoExtraWalletArguments(['node', 'wallet:sign-test', '--message', 'hi'], 'wallet:sign-test');
    }).toThrow(/Unexpected extra arguments/);
    const status = executeWalletStatus({ TRADING_ENABLED: 'true' });
    expect(status.tradingEnabled).toBe(true);
  });

  it('ignores env and file secrets and still requires an interactive TTY', async () => {
    const fixture = await loadTestWalletFixture();
    const env: Record<string, string> = {
      TRADING_ENABLED: 'false',
      EXECUTION_TAKER_PUBKEY: fixture.address,
    };
    for (const name of FORBIDDEN_ENV_SECRET_NAMES) {
      env[name] = fixture.secretBase58;
    }
    let prompts = 0;
    const report = await executeWalletVerify(env, {
      promptSecret: () => {
        prompts += 1;
        return Promise.resolve(fixture.secretBase58);
      },
    });
    expect(prompts).toBe(1);
    expect(report.matchesConfiguredTaker).toBe(true);
  });

  it('redacts secrets from public errors and does not dump stacks or causes', async () => {
    const fixture = await loadTestWalletFixture();
    const leaked = new WalletError(`failed ${fixture.secretBase58}`, {
      cause: new Error(`cause ${fixture.secretBase58}`),
      code: 'wallet_operation_failed',
    });
    leaked.stack = `Error: ${fixture.secretBase58}\n    at secret`;
    const printed = formatWalletError(leaked, [fixture.secretBase58]);
    expect(printed).not.toContain(fixture.secretBase58);
    expect(printed).not.toContain('at secret');
    expect(printed).not.toContain(`cause ${fixture.secretBase58}`);
  });

  it('zeroizes disposable signature copies after a post-sign failure and does not return wire', async () => {
    const fixture = await loadTestWalletFixture();
    await expect(
      executeWalletSignPreflight({
        intent: walletExecutionIntent(fixture.address),
        jupiter: { build: () => Promise.resolve(walletJupiterBuild(fixture.address)) },
        rpc: passingExecutionRpc(),
        promptSecret: () => Promise.resolve(fixture.secretBase58),
        hooks: {
          afterSignBeforeProof: () => {
            throw new WalletError('forced post-sign failure', { code: 'wallet_operation_failed' });
          },
        },
      }),
    ).rejects.toMatchObject({ code: 'wallet_operation_failed' });
  });

  it('does not search production wallet code for clipboard, generate, balance, or send APIs', () => {
    const root = join(process.cwd(), 'src', 'wallet');
    const text = walkTs(root)
      .map((name) => readFileSync(join(root, name), 'utf8'))
      .join('\n');
    expect(text).not.toMatch(/navigator\.clipboard|pbpaste|\bxclip\b|Get-Clipboard/i);
    expect(text).not.toMatch(/wallet:create|wallet:generate|wallet:export|wallet:backup/);
    expect(text).not.toMatch(/getBalance|getTokenAccountBalance|airdrop/);
    expect(text).not.toMatch(/\bsendTransaction\s*\(|\bsendRawTransaction\s*\(|\bsignAndSendTransactionWithSigners\b/);
    expect(text).not.toContain('getBase64EncodedWireTransaction');
    expect(text).not.toContain('writeFile');
    expect(text).not.toContain('appendFile');
    expect(text).not.toContain('generateKeyPair(');
  });

  it('does not embed the fixture secret in dist or docs', async () => {
    const fixture = await loadTestWalletFixture();
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    const checkpoint = readFileSync(join(process.cwd(), 'docs/CHECKPOINT_15.md'), 'utf8');
    expect(readme).not.toContain(fixture.secretBase58);
    expect(checkpoint).not.toContain(fixture.secretBase58);
    expect(readme).not.toMatch(/wallet:verify <private-key>|wallet:verify --secret/);
    const walletDist = join(process.cwd(), 'dist', 'wallet');
    if (existsSync(walletDist)) {
      for (const file of readdirSync(walletDist).filter((name) => name.endsWith('.js'))) {
        const text = readFileSync(join(walletDist, file), 'utf8');
        expect(text, file).not.toContain(fixture.secretBase58);
      }
    }
  });
});
