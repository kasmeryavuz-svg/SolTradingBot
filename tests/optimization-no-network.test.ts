import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatOptimizationCatalogLines, formatOptimizationStatusLines } from '../src/optimization/format.js';

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

describe('optimization has no network or live surface', () => {
  it('does not import wallet, live broadcaster, Jupiter client, Jito, or sendTransaction', () => {
    const files = collectTransitiveSources(join(process.cwd(), 'src/optimization'));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const normalized = file.replaceAll('\\', '/');
      expect(normalized, file).not.toMatch(/\/src\/wallet\//);
      expect(normalized, file).not.toMatch(/\/src\/live\//);
      expect(normalized, file).not.toMatch(/\/src\/execution\/jupiter/);
      expect(normalized, file).not.toMatch(/\/src\/execution\/rpc/);
    }
    for (const file of listTs(join(process.cwd(), 'src/optimization'))) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/\bfetch\s*\(/);
      expect(text, file).not.toMatch(/\bsendTransaction\s*\(/);
      expect(text, file).not.toMatch(/createJupiter|jupiter-client|JUPITER_/);
      expect(text, file).not.toMatch(/jito\.wtf|sendBundle/);
      expect(text, file).not.toMatch(/dexscreener\.com/);
    }
  });

  it('does not advertise live, send, or auto-promote commands', () => {
    const packageJson = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    expect(packageJson).not.toMatch(/optimization:live/);
    expect(packageJson).not.toMatch(/optimization:auto/);
    expect(packageJson).not.toMatch(/optimization:watch/);
    expect(packageJson).not.toMatch(/optimization:deploy/);
    expect(packageJson).not.toMatch(/optimization:send/);
    expect(packageJson).not.toMatch(/optimization:paper-promote/);
    const text = `${formatOptimizationStatusLines().join('\n')}\n${formatOptimizationCatalogLines().join('\n')}`;
    expect(text).not.toMatch(/PROFITABLE|EDGE PROVEN|READY FOR LIVE|GUARANTEED|WINNING STRATEGY/);
    expect(text).toContain('Live integration: NONE');
    expect(text).toContain('STABLE ORDER — NOT RANKED — NO PERFORMANCE');
  });
});
