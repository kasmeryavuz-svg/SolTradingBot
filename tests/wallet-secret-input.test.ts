import { describe, expect, it } from 'vitest';
import { WALLET_SECRET_MAX_CHARS } from '../src/wallet/constants.js';
import { WalletError } from '../src/wallet/errors.js';
import { promptHiddenSecret } from '../src/wallet/secret-input.js';
import { createFakeTerminal, feedHiddenSecret, loadTestWalletFixture } from './wallet-fixtures.js';

describe('hidden TTY secret input', () => {
  it('reads a secret without echoing it when stdin is a TTY', async () => {
    const fixture = await loadTestWalletFixture();
    const terminal = createFakeTerminal();
    const pending = promptHiddenSecret(terminal.adapter);
    await feedHiddenSecret(terminal, fixture.secretBase58);
    await expect(pending).resolves.toBe(fixture.secretBase58);
    expect(terminal.writes.join('')).toContain('Enter trading-wallet secret:');
    expect(terminal.writes.join('')).toContain('[hidden]');
    expect(terminal.writes.join('')).not.toContain(fixture.secretBase58);
    expect(terminal.rawMode).toBe(false);
    expect(terminal.rawModeHistory).toEqual([true, false]);
  });

  it('handles backspace before enter', async () => {
    const terminal = createFakeTerminal();
    const pending = promptHiddenSecret(terminal.adapter);
    await Promise.resolve();
    terminal.push('abX');
    terminal.push('\x7f');
    terminal.push('c');
    terminal.push('\r');
    await expect(pending).resolves.toBe('abc');
    expect(terminal.rawMode).toBe(false);
  });

  it('cancels on Ctrl+C and restores raw mode', async () => {
    const fixture = await loadTestWalletFixture();
    const terminal = createFakeTerminal();
    const pending = promptHiddenSecret(terminal.adapter);
    await Promise.resolve();
    terminal.push(fixture.secretBase58.slice(0, 8));
    terminal.push('\x03');
    await expect(pending).rejects.toBeInstanceOf(WalletError);
    await expect(pending).rejects.toMatchObject({ code: 'secret_input_cancelled' });
    expect(terminal.rawMode).toBe(false);
    expect(terminal.writes.join('')).not.toContain(fixture.secretBase58.slice(0, 8));
  });

  it('cancels on Ctrl+D / EOF and restores raw mode', async () => {
    const terminal = createFakeTerminal();
    const pending = promptHiddenSecret(terminal.adapter);
    await Promise.resolve();
    terminal.push('\x04');
    await expect(pending).rejects.toMatchObject({ code: 'secret_input_cancelled' });
    expect(terminal.rawMode).toBe(false);
  });

  it('aborts at max length, clears the mutable buffer, and restores raw mode', async () => {
    const terminal = createFakeTerminal();
    const pending = promptHiddenSecret(terminal.adapter);
    await Promise.resolve();
    terminal.push('1'.repeat(WALLET_SECRET_MAX_CHARS + 1));
    await expect(pending).rejects.toMatchObject({ code: 'secret_input_too_long' });
    expect(terminal.rawMode).toBe(false);
  });

  it('refuses non-TTY stdin before reading', async () => {
    const terminal = createFakeTerminal({ isTTY: false });
    await expect(promptHiddenSecret(terminal.adapter)).rejects.toMatchObject({
      code: 'interactive_tty_required',
    });
    expect(terminal.rawModeHistory).toEqual([]);
    expect(terminal.writes).toEqual([]);
  });

  it('restores raw mode when a read error occurs', async () => {
    const terminal = createFakeTerminal();
    const pending = promptHiddenSecret(terminal.adapter);
    await Promise.resolve();
    terminal.push({ not: 'a chunk' });
    await expect(pending).rejects.toBeInstanceOf(WalletError);
    expect(terminal.rawMode).toBe(false);
    expect(terminal.rawModeHistory).toEqual([true, false]);
  });

  it('restores the previous raw and pause state, including when raw started true', async () => {
    const terminal = createFakeTerminal({ initialRaw: true, initialPaused: false });
    const pending = promptHiddenSecret(terminal.adapter);
    await Promise.resolve();
    terminal.push('abc\r');
    await expect(pending).resolves.toBe('abc');
    expect(terminal.rawMode).toBe(true);
    expect(terminal.paused).toBe(false);
    expect(terminal.adapter.dataListenerCount).toBe(0);
  });

  it('treats CR, LF, and CRLF as enter and does not keep those bytes', async () => {
    for (const enter of ['\r', '\n', '\r\n']) {
      const terminal = createFakeTerminal();
      const pending = promptHiddenSecret(terminal.adapter);
      await Promise.resolve();
      terminal.push(`ab${enter}TRAILING`);
      await expect(pending).resolves.toBe('ab');
    }
  });

  it('handles 0x08 and 0x7f backspace and ignores trailing attacker bytes after enter', async () => {
    const terminal = createFakeTerminal();
    const pending = promptHiddenSecret(terminal.adapter);
    await Promise.resolve();
    terminal.push(Buffer.from([0x61, 0x08, 0x62, 0x0d, 0x63]));
    await expect(pending).resolves.toBe('b');
    expect(terminal.writes.join('')).not.toContain('b');
  });

  it('stops at the 88-character cap on a single pasted chunk', async () => {
    const terminal = createFakeTerminal();
    const pending = promptHiddenSecret(terminal.adapter);
    await Promise.resolve();
    terminal.push(`${'1'.repeat(WALLET_SECRET_MAX_CHARS + 20)}\r`);
    await expect(pending).rejects.toMatchObject({ code: 'secret_input_too_long' });
    expect(terminal.adapter.dataListenerCount).toBe(0);
    expect(terminal.rawMode).toBe(false);
  });

  it('writes the prompt only when an output TTY exists and never echoes the secret', async () => {
    const redirected = createFakeTerminal({ isTTY: true, stdoutIsTTY: false, stderrIsTTY: false });
    await expect(promptHiddenSecret(redirected.adapter)).rejects.toMatchObject({
      code: 'interactive_tty_required',
    });
    const stderrOnly = createFakeTerminal({ isTTY: true, stdoutIsTTY: false, stderrIsTTY: true });
    const pending = promptHiddenSecret(stderrOnly.adapter);
    await feedHiddenSecret(stderrOnly, 'abc');
    await expect(pending).resolves.toBe('abc');
    expect(stderrOnly.writes.join('')).toContain('[hidden]');
    expect(stderrOnly.writes.join('')).not.toContain('abc');
  });

  it('returns the data-listener count to baseline after success, cancel, and failure', async () => {
    const terminal = createFakeTerminal();
    expect(terminal.adapter.dataListenerCount).toBe(0);
    const success = promptHiddenSecret(terminal.adapter);
    await feedHiddenSecret(terminal, 'ok');
    await success;
    expect(terminal.adapter.dataListenerCount).toBe(0);
    const cancel = promptHiddenSecret(terminal.adapter);
    await Promise.resolve();
    terminal.push('\x03');
    await expect(cancel).rejects.toMatchObject({ code: 'secret_input_cancelled' });
    expect(terminal.adapter.dataListenerCount).toBe(0);
    const fail = promptHiddenSecret(terminal.adapter);
    await Promise.resolve();
    terminal.push('1'.repeat(WALLET_SECRET_MAX_CHARS + 1));
    await expect(fail).rejects.toMatchObject({ code: 'secret_input_too_long' });
    expect(terminal.adapter.dataListenerCount).toBe(0);
  });
});
