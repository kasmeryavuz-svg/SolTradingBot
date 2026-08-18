import { describe, expect, it } from 'vitest';
import {
  assertExactLiveConfirmation,
  liveConfirmationPhrase,
  promptLiveConfirmation,
} from '../src/live/confirmation.js';
import { LiveError } from '../src/live/errors.js';
import { createFakeTerminal } from './wallet-fixtures.js';

const PHRASE = liveConfirmationPhrase('abcd1234ffff', '1000000');

describe('live confirmation', () => {
  it('builds LIVE SEND <short-id> <amountRaw>', () => {
    expect(PHRASE).toBe('LIVE SEND abcd1234 1000000');
  });

  it('accepts the exact phrase and rejects trailing characters', () => {
    expect(() => {
      assertExactLiveConfirmation(PHRASE, PHRASE);
    }).not.toThrow();
    expect(() => {
      assertExactLiveConfirmation(`${PHRASE} `, PHRASE);
    }).toThrow(LiveError);
    expect(() => {
      assertExactLiveConfirmation('wrong', PHRASE);
    }).toThrow(LiveError);
    expect(() => {
      assertExactLiveConfirmation(PHRASE.toLowerCase(), PHRASE);
    }).toThrow(LiveError);
    expect(() => {
      assertExactLiveConfirmation(` ${PHRASE}`, PHRASE);
    }).toThrow(LiveError);
    expect(() => {
      assertExactLiveConfirmation('LIVE SEND abcd1234 01', PHRASE);
    }).toThrow(LiveError);
  });

  it('accepts a correct TTY phrase', async () => {
    const terminal = createFakeTerminal();
    const pending = promptLiveConfirmation(PHRASE, terminal.adapter);
    await Promise.resolve();
    terminal.push(PHRASE);
    terminal.push('\r');
    await expect(pending).resolves.toBeUndefined();
  });

  it('rejects a wrong TTY phrase, Ctrl+C, EOF, piped stdin, and huge paste', async () => {
    const wrong = createFakeTerminal();
    const wrongPending = promptLiveConfirmation(PHRASE, wrong.adapter);
    await Promise.resolve();
    wrong.push('NOPE');
    wrong.push('\r');
    await expect(wrongPending).rejects.toThrow(/did not match/);

    const cancel = createFakeTerminal();
    const cancelPending = promptLiveConfirmation(PHRASE, cancel.adapter);
    await Promise.resolve();
    cancel.push(Uint8Array.of(0x03));
    await expect(cancelPending).rejects.toThrow(/cancelled/);

    const eof = createFakeTerminal();
    const eofPending = promptLiveConfirmation(PHRASE, eof.adapter);
    await Promise.resolve();
    eof.push(Uint8Array.of(0x04));
    await expect(eofPending).rejects.toThrow(/cancelled/);

    const piped = createFakeTerminal({ isTTY: false });
    await expect(promptLiveConfirmation(PHRASE, piped.adapter)).rejects.toThrow(/TTY/);

    const huge = createFakeTerminal();
    const hugePending = promptLiveConfirmation(PHRASE, huge.adapter);
    await Promise.resolve();
    huge.push('A'.repeat(200));
    await expect(hugePending).rejects.toThrow(/maximum length/);
  });
});
