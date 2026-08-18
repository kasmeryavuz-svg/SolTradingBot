import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';

function listTs(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .filter((name): name is string => typeof name === 'string' && name.endsWith('.ts'))
    .map((name) => join(dir, name));
}

function collectTransitiveSources(entryDir: string): string[] {
  const seen = new Set<string>();
  const queue = listTs(entryDir);
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file) || !existsSync(file)) {
      continue;
    }
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/from '(\.\.?\/[^']+)\.js'/g)) {
      const specifier = match[1];
      if (specifier === undefined) {
        continue;
      }
      const resolved = `${normalize(join(dirname(file), specifier))}.ts`;
      if (existsSync(resolved)) {
        queue.push(resolved);
      }
    }
  }
  return [...seen];
}

describe('wallet intelligence has no execution surface', () => {
  it('does not transitively import src/wallet, src/live, sendTransaction, Jupiter send, or Jito', () => {
    const files = collectTransitiveSources(join(process.cwd(), 'src/wallet-intelligence'));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const normalized = file.replaceAll('\\', '/');
      expect(normalized, file).not.toMatch(/\/src\/wallet\//);
      expect(normalized, file).not.toMatch(/\/src\/live\//);
    }
    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(source).not.toMatch(/sendTransaction\s*\(/);
    expect(source).not.toMatch(/signTransaction\s*\(/);
    expect(source).not.toMatch(/jito\.wtf|sendBundle/);
    expect(source).not.toContain('/swap/v2/execute');
    expect(source).not.toContain('/swap/v2/submit');
    expect(source).not.toContain('createWalletSignerFromSecretBytes');
    expect(source).not.toContain('live:execute');
  });

  it('does not add copy/trade/send/buy/follow commands', () => {
    const packageJson = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    expect(packageJson).toContain('wallet-intel:status');
    expect(packageJson).toContain('wallet-intel:holders');
    expect(packageJson).toContain('wallet-intel:inspect');
    expect(packageJson).toContain('wallet-intel:scan');
    expect(packageJson).toContain('wallet-intel:latest');
    expect(packageJson).toContain('wallet-intel:history');
    expect(packageJson).not.toMatch(/wallet-intel:copy/);
    expect(packageJson).not.toMatch(/wallet-intel:trade/);
    expect(packageJson).not.toMatch(/wallet-intel:send/);
    expect(packageJson).not.toMatch(/wallet-intel:buy/);
    expect(packageJson).not.toMatch(/wallet-intel:follow/);
    expect(packageJson).not.toMatch(/wallet-intel:watch/);
    expect(packageJson).not.toMatch(/wallet-intel:auto/);
    expect(packageJson).not.toMatch(/wallet-intel:front-run/);
  });
});
