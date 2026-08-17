import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeExecutionBuild, executeExecutionSimulate } from '../src/execution/index.js';
import type { ExecutionRpc } from '../src/execution/types.js';
import { executionIntent, validJupiterBuild } from './execution-fixtures.js';

function executionSourceText(): string {
  const root = join(process.cwd(), 'src', 'execution');
  return readdirSync(root)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => readFileSync(join(root, name), 'utf8'))
    .join('\n');
}

describe('execution no-send / no-jito contract', () => {
  it('does not import or call broadcast APIs from production execution source', () => {
    const text = executionSourceText();
    expect(text).not.toMatch(/\bsendTransaction\b/);
    expect(text).not.toMatch(/\bsendRawTransaction\b/);
    expect(text).not.toMatch(/\bsendAndConfirmTransaction\b/);
    expect(text).not.toMatch(/\bsendAndConfirmTransactionFactory\b/);
    expect(text).not.toMatch(/\bsendBundle\b/);
    expect(text).not.toContain('/swap/v2/execute');
    expect(text).not.toContain('/swap/v2/order');
    expect(text).not.toContain('/submit');
    expect(text).not.toContain('jito.wtf');
    expect(text).not.toContain('child_process');
    expect(text).not.toMatch(/\beval\(/);
  });

  it('instrumented RPC send attempts fail the test path and are never invoked', async () => {
    let sendCalls = 0;
    const rpc: ExecutionRpc & { sendTransaction?: () => Promise<never> } = {
      getGenesisHash: () => Promise.resolve('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'),
      getBlockHeight: () => Promise.resolve(900n),
      simulateTransaction: () =>
        Promise.resolve({
          ok: true,
          unitsConsumed: 100_000n,
          errorSummary: null,
          logs: [],
          failureKind: 'none' as const,
        }),
      getFeeForMessage: () => Promise.resolve(5000n),
      sendTransaction: () => {
        sendCalls += 1;
        return Promise.reject(new Error('sendTransaction must not be called'));
      },
    };

    const report = await executeExecutionSimulate({
      intent: executionIntent(),
      jupiter: {
        build: () => Promise.resolve(validJupiterBuild()),
      },
      rpc,
    });
    expect(report.status).toBe('simulation_passed');
    expect(sendCalls).toBe(0);
    expect('sendTransaction' in rpc).toBe(true);
  });

  it('walks production imports from build.ts and simulate.ts without signing or send APIs', () => {
    const root = join(process.cwd(), 'src');
    const visited = new Set<string>();
    const queue = [join(root, 'execution', 'build.ts'), join(root, 'execution', 'simulate.ts')];
    const importPattern = /from ['"](\.[^'"]+)['"]/g;
    while (queue.length > 0) {
      const file = queue.pop();
      if (file === undefined || visited.has(file)) {
        continue;
      }
      visited.add(file);
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/\bsignTransaction\b/);
      expect(text, file).not.toMatch(/\bsignBytes\b/);
      expect(text, file).not.toMatch(/\bgenerateKeyPair\b/);
      expect(text, file).not.toMatch(/\bcreateKeyPairSignerFromBytes\b/);
      expect(text, file).not.toMatch(/\bsendTransaction\b/);
      expect(text, file).not.toMatch(/\bsendRawTransaction\b/);
      expect(text, file).not.toContain('jito.wtf');
      expect(text, file).not.toContain('validJupiterBuild');
      let match: RegExpExecArray | null;
      importPattern.lastIndex = 0;
      while ((match = importPattern.exec(text)) !== null) {
        const specifier = match[1];
        if (specifier === undefined) {
          continue;
        }
        const resolved = specifier.endsWith('.js')
          ? join(file, '..', specifier.replace(/\.js$/u, '.ts'))
          : join(file, '..', `${specifier}.ts`);
        if (resolved.startsWith(root)) {
          queue.push(resolved);
        }
      }
    }
    expect(visited.size).toBeGreaterThan(5);
  });

  it('records only api.jup.ag for build and never a Jito host', async () => {
    const hosts: string[] = [];
    await executeExecutionBuild({
      intent: executionIntent(),
      jupiter: {
        build: () => {
          hosts.push('api.jup.ag');
          return Promise.resolve(validJupiterBuild());
        },
      },
    });
    expect(hosts).toEqual(['api.jup.ag']);
    expect(hosts.some((host) => host.includes('jito'))).toBe(false);
  });
});
