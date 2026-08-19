import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';

const FORBIDDEN_SPECIFIER = /(?:^|\/)(?:live|wallet|production|execution)(?:\/|$)/;
const FORBIDDEN_PRIMITIVES =
  /\b(?:sendRawTransaction|sendAndConfirm(?:Transaction)?|signAndSend(?:Transaction)?|fromSecretKey)\b|live:execute/;
const FORBIDDEN_CHILD_PROCESS = /\b(?:child_process|node:child_process)\b|\b(?:spawn|execFile|fork)\s*\(/;

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function collectImportGraph(root: string): string[] {
  const seen = new Set<string>();
  const queue = readdirSync(root, { recursive: true })
    .filter((name): name is string => typeof name === 'string' && name.endsWith('.ts'))
    .map((name) => join(root, name));
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) {
      continue;
    }
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    const specifiers = [
      ...text.matchAll(/from ['"]([^'"]+)['"]/g),
      ...text.matchAll(/import\s*\(\s*['"]([^'"]+)['"]/g),
      ...text.matchAll(/require\s*\(\s*['"]([^'"]+)['"]/g),
    ];
    for (const match of specifiers) {
      const specifier = match[1];
      if (specifier === undefined || !specifier.startsWith('.')) {
        continue;
      }
      const resolved = specifier.endsWith('.js')
        ? `${normalize(join(dirname(file), specifier.slice(0, -3)))}.ts`
        : `${normalize(join(dirname(file), specifier))}.ts`;
      if (existsSync(resolved)) {
        queue.push(resolved);
      }
    }
  }
  return [...seen].map((file) => file.replaceAll('\\', '/'));
}

describe('recovery watcher isolation', () => {
  it('does not import live, wallet, production runtime, or execution', () => {
    const graph = collectImportGraph(join(process.cwd(), 'src/recovery-watcher'));
    expect(graph.some((file) => file.includes('/src/live/'))).toBe(false);
    expect(graph.some((file) => file.includes('/src/wallet/'))).toBe(false);
    expect(graph.some((file) => file.includes('/src/production/'))).toBe(false);
    expect(graph.some((file) => file.includes('/src/execution/'))).toBe(false);
    expect(graph.length).toBeGreaterThan(10);
  });

  it('fails closed on dynamic import, require, forbidden path strings, and live primitives', () => {
    const root = join(process.cwd(), 'src/recovery-watcher');
    const files = collectImportGraph(root);
    for (const file of files) {
      const stripped = stripComments(readFileSync(file, 'utf8'));
      const specifiers = [
        ...stripped.matchAll(/from ['"]([^'"]+)['"]/g),
        ...stripped.matchAll(/import\s*\(\s*['"]([^'"]+)['"]/g),
        ...stripped.matchAll(/require\s*\(\s*['"]([^'"]+)['"]/g),
      ].map((match) => match[1] ?? '');
      expect(specifiers.some((specifier) => FORBIDDEN_SPECIFIER.test(specifier.replaceAll('\\', '/')))).toBe(false);
      expect(stripped).not.toMatch(/import\s*\(/);
      expect(stripped).not.toMatch(/\brequire\s*\(/);
      expect(stripped).not.toMatch(FORBIDDEN_PRIMITIVES);
      expect(stripped).not.toMatch(FORBIDDEN_CHILD_PROCESS);
      expect(stripped).not.toMatch(/src\/(?:live|wallet|production|execution)\//);
    }
  });

  it('has no signer, transaction, or broadcast capability', () => {
    const graph = collectImportGraph(join(process.cwd(), 'src/recovery-watcher'));
    const text = graph.map((file) => stripComments(readFileSync(file, 'utf8'))).join('\n');
    expect(text).not.toMatch(/sendTransaction/);
    expect(text).not.toMatch(/signTransaction/);
    expect(text).not.toMatch(/signAndSend/);
    expect(text).not.toMatch(/\bJito\b/);
    expect(text).not.toMatch(/broadcastTransaction/);
    expect(text).not.toMatch(/fromSecretKey\(/);
  });
});
