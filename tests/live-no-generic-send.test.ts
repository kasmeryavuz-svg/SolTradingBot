import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIVE_DEFINITION_FINGERPRINT } from '../src/live/index.js';

function listTs(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir), { recursive: true })
    .filter((name): name is string => typeof name === 'string' && name.endsWith('.ts'))
    .map((name) => join(process.cwd(), dir, name));
}

describe('live no generic send', () => {
  it('does not export a generic broadcast oracle', () => {
    const barrel = readFileSync(join(process.cwd(), 'src/live/index.ts'), 'utf8');
    expect(barrel).not.toContain('broadcastRaw');
    expect(barrel).not.toContain('createLiveRpc');
    expect(barrel).not.toContain('sendTransaction');
    expect(barrel).not.toContain('withInteractiveSigner');
    expect(barrel).not.toContain('signedWire');
    expect(LIVE_DEFINITION_FINGERPRINT).toBe(
      '57a6fc872f7e51f1e4b041ed5b93413efe0779dea61a88b9dc1b4ed9f05e395d',
    );
  });

  it('confines sendTransaction to src/live', () => {
    for (const file of listTs('src')) {
      const text = readFileSync(file, 'utf8');
      if (!file.includes(join('src', 'live')) && !file.includes('src\\live')) {
        expect(text, file).not.toMatch(/\.sendTransaction\(|rpc\.sendTransaction/);
      }
    }
    const live = listTs('src/live')
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(live).toContain('sendTransaction');
    expect(live).not.toMatch(/sendBundle\(/);
    expect(live).not.toContain('jito.wtf');
    expect(live).not.toContain('/swap/v2/execute');
    expect(live).not.toContain('/swap/v2/submit');
  });

  it('lets only src/live import the privileged signing bridge', () => {
    for (const dir of ['strategy', 'paper', 'research', 'dashboard', 'execution']) {
      for (const file of listTs(join('src', dir))) {
        const text = readFileSync(file, 'utf8');
        expect(text, file).not.toContain('signing-bridge');
        expect(text, file).not.toContain('signer-scope');
        expect(text, file).not.toContain('createWalletSignerFromSecretBytes');
      }
    }
    const live = listTs('src/live')
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(live).toContain('signing-bridge');
  });
});
