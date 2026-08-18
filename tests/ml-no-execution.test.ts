import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readTree(root: string): string {
  return readdirSync(root, { recursive: true })
    .filter((name): name is string => typeof name === 'string' && name.endsWith('.ts'))
    .map((name) => readFileSync(join(root, name), 'utf8'))
    .join('\n');
}

describe('ml has no execution graph', () => {
  it('does not call live:execute, sign, or send from src/ml', () => {
    const ml = readTree(join(process.cwd(), 'src/ml'));
    expect(ml).not.toMatch(/live:execute|executeLiveBroadcast|signTransaction|sendTransaction/);
    expect(ml).not.toMatch(/PROMOTE TO LIVE|AUTO ENABLE|ml:send|copy trade/i);
    expect(ml).not.toMatch(/edit s07|STRATEGY_VERSION = 's07/);
  });
});
