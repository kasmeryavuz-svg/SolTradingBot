import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';

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
    for (const match of text.matchAll(/from ['"](\.\.?\/[^'"]+)['"]/g)) {
      const specifier = match[1];
      if (specifier === undefined) {
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

describe('production import graph', () => {
  it('does not reach live, wallet, or execution source', () => {
    const graph = collectImportGraph(join(process.cwd(), 'src/production'));
    expect(graph.some((file) => file.includes('/src/live/'))).toBe(false);
    expect(graph.some((file) => file.includes('/src/wallet/'))).toBe(false);
    expect(graph.some((file) => file.includes('/src/execution/'))).toBe(false);
    expect(graph.length).toBeGreaterThan(10);
  });

  it('does not contain sendTransaction, signTransaction, Jupiter, or Jito', () => {
    const graph = collectImportGraph(join(process.cwd(), 'src/production'));
    const text = graph.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(text).not.toMatch(/sendTransaction/);
    expect(text).not.toMatch(/signTransaction/);
    expect(text).not.toMatch(/\bJupiter\b/);
    expect(text).not.toMatch(/\bJito\b/);
    expect(text).not.toMatch(/Math\.random\s*\(/);
    expect(text).not.toMatch(/child_process|execSync|spawn\(/);
  });
});
