import {
  LIVE_CANDIDATE_SHORT_ID_CHARS,
  LIVE_CONFIRMATION_MAX_CHARS,
  LIVE_CONFIRMATION_PREFIX,
} from './constants.js';
import { LiveError } from './errors.js';

export type LiveTerminalAdapter = {
  readonly stdinIsTTY: boolean;
  readonly stdoutIsTTY: boolean;
  readonly stderrIsTTY: boolean;
  readonly isRaw: boolean;
  readonly isPaused: boolean;
  setRawMode(enabled: boolean): void;
  write(text: string): void;
  resume(): void;
  pause(): void;
  onData(listener: (chunk: string | Uint8Array) => void): () => void;
};

export function candidateShortId(executionCandidateFingerprint: string): string {
  return executionCandidateFingerprint.slice(0, LIVE_CANDIDATE_SHORT_ID_CHARS);
}

export function liveConfirmationPhrase(executionCandidateFingerprint: string, amountRaw: string): string {
  return `${LIVE_CONFIRMATION_PREFIX} ${candidateShortId(executionCandidateFingerprint)} ${amountRaw}`;
}

export function createProcessLiveTerminalAdapter(): LiveTerminalAdapter {
  return {
    get stdinIsTTY() {
      return process.stdin.isTTY;
    },
    get stdoutIsTTY() {
      return process.stdout.isTTY;
    },
    get stderrIsTTY() {
      return process.stderr.isTTY;
    },
    get isRaw() {
      return process.stdin.isRaw;
    },
    get isPaused() {
      return process.stdin.isPaused();
    },
    setRawMode(enabled: boolean) {
      if (typeof process.stdin.setRawMode === 'function') {
        process.stdin.setRawMode(enabled);
      }
    },
    write(text: string) {
      if (process.stderr.isTTY) {
        process.stderr.write(text);
        return;
      }
      if (process.stdout.isTTY) {
        process.stdout.write(text);
      }
    },
    resume() {
      process.stdin.resume();
    },
    pause() {
      process.stdin.pause();
    },
    onData(listener) {
      process.stdin.on('data', listener);
      return () => {
        process.stdin.off('data', listener);
      };
    },
  };
}

export function assertLiveConfirmationTty(adapter: LiveTerminalAdapter): void {
  if (!adapter.stdinIsTTY) {
    throw new LiveError(
      'l16_v1 requires an interactive TTY for LIVE SEND confirmation. Piped or redirected stdin is refused.',
      { code: 'interactive_tty_required' },
    );
  }
  if (!adapter.stdoutIsTTY && !adapter.stderrIsTTY) {
    throw new LiveError('l16_v1 requires an interactive terminal for LIVE SEND confirmation.', {
      code: 'interactive_tty_required',
    });
  }
}

export function assertExactLiveConfirmation(actual: string, expected: string): void {
  if (actual === expected) {
    return;
  }
  throw new LiveError('LIVE SEND confirmation phrase did not match. No reservation, secret, sign, or send.', {
    code: 'confirmation_mismatch',
  });
}

export async function promptLiveConfirmation(
  expectedPhrase: string,
  adapter: LiveTerminalAdapter = createProcessLiveTerminalAdapter(),
): Promise<void> {
  assertLiveConfirmationTty(adapter);
  const previousRaw = adapter.isRaw;
  const previousPaused = adapter.isPaused;
  let rawChanged = false;
  let unsubscribe: (() => void) | undefined;
  const codes: number[] = [];

  try {
    adapter.setRawMode(true);
    rawChanged = true;
    adapter.resume();
    adapter.write(`Type exactly:\n${expectedPhrase}\n`);

    const typed = await new Promise<string>((resolve, reject) => {
      unsubscribe = adapter.onData((chunk) => {
        try {
          for (const code of chunkCodes(chunk)) {
            if (code === 0x03 || code === 0x04) {
              reject(
                new LiveError('LIVE SEND confirmation was cancelled. No reservation, secret, sign, or send.', {
                  code: 'confirmation_cancelled',
                }),
              );
              return;
            }
            if (code === 0x0d || code === 0x0a) {
              resolve(Buffer.from(codes).toString('latin1'));
              return;
            }
            if (code === 0x7f || code === 0x08) {
              if (codes.length > 0) {
                codes.pop();
                adapter.write('\b \b');
              }
              continue;
            }
            if (code === 0x1b || code < 0x20 || code > 0x7e) {
              continue;
            }
            if (codes.length >= LIVE_CONFIRMATION_MAX_CHARS) {
              reject(
                new LiveError('LIVE SEND confirmation input exceeds the l16 maximum length.', {
                  code: 'confirmation_mismatch',
                }),
              );
              return;
            }
            codes.push(code);
            adapter.write(String.fromCharCode(code));
          }
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new LiveError('Unexpected terminal input.'));
        }
      });
    });
    adapter.write('\n');
    assertExactLiveConfirmation(typed, expectedPhrase);
  } finally {
    unsubscribe?.();
    if (rawChanged) {
      adapter.setRawMode(previousRaw);
    }
    if (previousPaused) {
      adapter.pause();
    } else {
      adapter.resume();
    }
  }
}

function chunkCodes(chunk: string | Uint8Array): Iterable<number> {
  if (typeof chunk === 'string') {
    return stringCodes(chunk);
  }
  if (chunk instanceof Uint8Array) {
    return chunk;
  }
  throw new LiveError('Unexpected terminal input.');
}

function* stringCodes(value: string): Iterable<number> {
  for (const character of value) {
    yield character.charCodeAt(0);
  }
}
