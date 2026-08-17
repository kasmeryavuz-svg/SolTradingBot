import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FORBIDDEN_ENV_SECRET_NAMES } from '../src/wallet/constants.js';
import {
  assertNoExtraWalletArguments,
  executeWalletSignTest,
  executeWalletStatus,
} from '../src/wallet/index.js';
import { formatWalletStatusLines } from '../src/wallet/format.js';
import { formatWalletError, sanitizeWalletText } from '../src/wallet/sanitize.js';
import { loadTestWalletFixture } from './wallet-fixtures.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  vi.restoreAllMocks();
});

describe('wallet security', () => {
  it('rejects secret-like CLI arguments', () => {
    expect(() => {
      assertNoExtraWalletArguments(['node', 'wallet:verify', '--secret', 'xxx'], 'wallet:verify');
    }).toThrow(/Unexpected extra arguments/);
    expect(() => {
      assertNoExtraWalletArguments(['node', 'wallet:sign-test', 'secret'], 'wallet:sign-test');
    }).toThrow(/Unexpected extra arguments/);
  });

  it('ignores env secret names as signer sources', () => {
    const env: Record<string, string> = {
      TRADING_ENABLED: 'false',
    };
    for (const name of FORBIDDEN_ENV_SECRET_NAMES) {
      env[name] = 'TEST_SECRET_SHOULD_BE_IGNORED';
    }
    const text = formatWalletStatusLines(executeWalletStatus(env)).join('\n');
    expect(text).toContain('Env private key: NOT SUPPORTED');
    expect(text).not.toContain('TEST_SECRET_SHOULD_BE_IGNORED');
    expect(executeWalletStatus(env).configuredTakerPublicKey).toBeNull();
  });

  it('does not search nearby wallet files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'w15-secret-'));
    tempDirs.push(dir);
    for (const name of ['id.json', 'wallet.json', 'secret.json', '.env.wallet']) {
      writeFileSync(join(dir, name), JSON.stringify({ secret: 'FAKE_FILE_SECRET' }), 'utf8');
    }
    const report = executeWalletStatus({ TRADING_ENABLED: 'false' });
    expect(JSON.stringify(report)).not.toContain('FAKE_FILE_SECRET');
  });

  it('never prints the fixture secret through console spies', async () => {
    const fixture = await loadTestWalletFixture();
    const output: string[] = [];
    const capture = (value: unknown) => {
      output.push(String(value));
    };
    vi.spyOn(console, 'log').mockImplementation(capture);
    vi.spyOn(console, 'error').mockImplementation(capture);
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });

    const proof = await executeWalletSignTest(
      {
        TRADING_ENABLED: 'false',
        EXECUTION_TAKER_PUBKEY: fixture.address,
      },
      { promptSecret: () => Promise.resolve(fixture.secretBase58) },
    );
    const dumped = output.join('\n');
    expect(dumped).not.toContain(fixture.secretBase58);
    expect(dumped).not.toContain(fixture.secretBase58.slice(0, 16));
    expect(JSON.stringify(proof)).not.toContain(fixture.secretBase58);
  });

  it('redacts secrets from error text including large substrings', async () => {
    const fixture = await loadTestWalletFixture();
    const leaked = `failed ${fixture.secretBase58} mid=${fixture.secretBase58.slice(4, 20)}`;
    const sanitized = sanitizeWalletText(leaked, [fixture.secretBase58]);
    expect(sanitized).not.toContain(fixture.secretBase58);
    expect(sanitized).not.toContain(fixture.secretBase58.slice(4, 20));
    expect(formatWalletError(new Error(leaked), [fixture.secretBase58])).not.toContain(fixture.secretBase58);
  });
});
