import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalWalletDefinition, executeWalletSignPreflight } from '../src/wallet/index.js';
import type { ExecutionRpc } from '../src/execution/types.js';
import { loadTestWalletFixture, passingExecutionRpc, walletExecutionIntent, walletJupiterBuild } from './wallet-fixtures.js';

function walletSourceText(): string {
  const root = join(process.cwd(), 'src', 'wallet');
  return readdirSync(root)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => readFileSync(join(root, name), 'utf8'))
    .join('\n');
}

describe('wallet no-send / no-jito contract', () => {
  it('does not import or call broadcast APIs from production wallet source', () => {
    const text = walletSourceText();
    const broadcast = canonicalWalletDefinition().broadcast;
    expect(broadcast.sendTransaction).toBe(false);
    expect(broadcast.sendRawTransaction).toBe(false);
    expect(broadcast.sendAndConfirmTransaction).toBe(false);
    expect(broadcast.sendAndConfirmTransactionFactory).toBe(false);
    expect(broadcast.jupiterExecute).toBe(false);
    expect(broadcast.jupiterSubmit).toBe(false);
    expect(broadcast.jito).toBe(false);
    expect(broadcast.sendBundle).toBe(false);
    expect(text).not.toMatch(/\bimport\b[^\n]*\bsendTransaction\b/);
    expect(text).not.toMatch(/\bsendTransaction\s*\(/);
    expect(text).not.toMatch(/\bsendRawTransaction\s*\(/);
    expect(text).not.toMatch(/\bsendAndConfirmTransaction\s*\(/);
    expect(text).not.toMatch(/\bsendAndConfirmTransactionFactory\s*\(/);
    expect(text).not.toMatch(/\bsignAndSendTransactionWithSigners\b/);
    expect(text).not.toMatch(/\bsendBundle\s*\(/);
    expect(text).not.toContain('/swap/v2/execute');
    expect(text).not.toContain('/submit');
    expect(text).not.toContain('jito.wtf');
    expect(text).not.toContain('child_process');
    expect(text).not.toMatch(/\beval\(/);
  });

  it('never invokes an injected RPC send method', async () => {
    const fixture = await loadTestWalletFixture();
    let sendCalls = 0;
    const rpc: ExecutionRpc & { sendTransaction?: () => Promise<never> } = {
      ...passingExecutionRpc(),
      sendTransaction: () => {
        sendCalls += 1;
        return Promise.reject(new Error('sendTransaction must not be called'));
      },
    };
    await executeWalletSignPreflight({
      intent: walletExecutionIntent(fixture.address),
      jupiter: { build: () => Promise.resolve(walletJupiterBuild(fixture.address)) },
      rpc,
      promptSecret: () => Promise.resolve(fixture.secretBase58),
    });
    expect(sendCalls).toBe(0);
  });
});
