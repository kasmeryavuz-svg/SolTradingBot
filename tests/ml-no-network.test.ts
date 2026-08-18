import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatMlFeatureLines, formatMlStatusLines } from '../src/ml/format.js';

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

describe('ml has no network or live surface', () => {
  it('does not import wallet, live, execution, or wallet-intelligence provider', () => {
    const files = collectTransitiveSources(join(process.cwd(), 'src/ml'));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const normalized = file.replaceAll('\\', '/');
      expect(normalized, file).not.toMatch(/\/src\/wallet\//);
      expect(normalized, file).not.toMatch(/\/src\/live\//);
      expect(normalized, file).not.toMatch(/\/src\/execution\//);
      expect(normalized, file).not.toMatch(/\/src\/wallet-intelligence\/provider\.ts$/);
      expect(normalized, file).not.toMatch(/\/src\/config\/load-config\.ts$/);
    }
    for (const file of listTs(join(process.cwd(), 'src/ml'))) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/\bfetch\s*\(/);
      expect(text, file).not.toMatch(/\bsendTransaction\s*\(/);
      expect(text, file).not.toMatch(/createJupiter|jupiter-client|JUPITER_/);
      expect(text, file).not.toMatch(/jito\.wtf|sendBundle/);
      expect(text, file).not.toMatch(/helius-rpc/);
    }
  });

  it('does not advertise live or auto-trading commands', () => {
    const packageJson = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    expect(packageJson).not.toMatch(/ml:live/);
    expect(packageJson).not.toMatch(/ml:trade/);
    expect(packageJson).not.toMatch(/ml:deploy/);
    expect(packageJson).not.toMatch(/ml:auto/);
    expect(packageJson).not.toMatch(/ml:optimize/);
    expect(packageJson).not.toMatch(/ml:hyperopt/);
    expect(packageJson).not.toMatch(/ml:paper-enable/);
    const text = `${formatMlStatusLines().join('\n')}\n${formatMlFeatureLines().join('\n')}`;
    expect(text).not.toMatch(/PROFITABLE|LIVE_READY|AUTO_ENABLE|WINNING STRATEGY/);
    expect(text).toContain('Live integration: NONE');
    expect(text).toContain('Wallet intelligence used: NO');
  });
});
