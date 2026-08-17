import { WALLET_SECRET_MAX_CHARS } from './constants.js';
import { WalletError } from './errors.js';
import { zeroizeBytes } from './zeroize.js';

export type TerminalAdapter = {
  readonly stdinIsTTY: boolean;
  readonly stdoutIsTTY: boolean;
  readonly stderrIsTTY: boolean;
  readonly isRaw: boolean;
  readonly isPaused: boolean;
  readonly dataListenerCount: number;
  setRawMode(enabled: boolean): void;
  write(text: string): void;
  resume(): void;
  pause(): void;
  onData(listener: (chunk: string | Uint8Array) => void): () => void;
};

export const SECRET_PROMPT_LINES = ['Enter trading-wallet secret:', '[hidden]'] as const;

export function createProcessTerminalAdapter(): TerminalAdapter {
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
    get dataListenerCount() {
      return process.stdin.listenerCount('data');
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

export function assertInteractiveTty(adapter: TerminalAdapter): void {
  if (!adapter.stdinIsTTY) {
    throw new WalletError(
      'Checkpoint 15 requires an interactive TTY for hidden secret input. Piped or redirected stdin is refused.',
      { code: 'interactive_tty_required' },
    );
  }
  if (!adapter.stdoutIsTTY && !adapter.stderrIsTTY) {
    throw new WalletError(
      'Checkpoint 15 requires an interactive terminal for hidden secret input.',
      { code: 'interactive_tty_required' },
    );
  }
}

/**
 * Read a secret with no echo. Restores the previous raw-mode and pause state
 * in `finally`, including after Ctrl+C / EOF / max-length abort.
 *
 * In raw mode, Ctrl+C is byte 0x03 (data), not an automatic SIGINT.
 *
 * The JavaScript string that leaves this function cannot be reliably overwritten.
 * Callers must keep it local, never log it, never attach it to an Error, and
 * drop the reference as soon as decoding completes.
 */
export async function promptHiddenSecret(
  adapter: TerminalAdapter = createProcessTerminalAdapter(),
): Promise<string> {
  assertInteractiveTty(adapter);

  const buffer = new Uint8Array(WALLET_SECRET_MAX_CHARS);
  let length = 0;
  const previousRaw = adapter.isRaw;
  const previousPaused = adapter.isPaused;
  let rawChanged = false;
  let unsubscribe: (() => void) | undefined;

  try {
    adapter.setRawMode(true);
    rawChanged = true;
    adapter.resume();
    writePrompt(adapter);

    const secret = await new Promise<string>((resolve, reject) => {
      unsubscribe = adapter.onData((chunk) => {
        try {
          for (const code of chunkCodes(chunk)) {
            if (code === 0x03 || code === 0x04) {
              reject(new WalletError('Secret input was cancelled.', { code: 'secret_input_cancelled' }));
              return;
            }
            if (code === 0x0d || code === 0x0a) {
              resolve(bytesToAscii(buffer, length));
              return;
            }
            if (code === 0x7f || code === 0x08) {
              if (length > 0) {
                length -= 1;
                buffer[length] = 0;
              }
              continue;
            }
            if (code === 0x1b || code < 0x20 || code > 0x7e) {
              continue;
            }
            if (length >= WALLET_SECRET_MAX_CHARS) {
              reject(
                new WalletError('Secret input exceeds the w15_v1 maximum length.', {
                  code: 'secret_input_too_long',
                }),
              );
              return;
            }
            buffer[length] = code;
            length += 1;
          }
        } catch (error: unknown) {
          reject(error instanceof Error ? error : new WalletError('Unexpected terminal input.', { cause: error }));
        }
      });
    });
    return secret;
  } finally {
    unsubscribe?.();
    zeroizeBytes(buffer);
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

function writePrompt(adapter: TerminalAdapter): void {
  if (!adapter.stderrIsTTY && !adapter.stdoutIsTTY) {
    throw new WalletError(
      'Checkpoint 15 requires an interactive terminal for hidden secret input.',
      { code: 'interactive_tty_required' },
    );
  }
  adapter.write(`${SECRET_PROMPT_LINES[0]}\n${SECRET_PROMPT_LINES[1]}\n`);
}

function chunkCodes(chunk: string | Uint8Array): Iterable<number> {
  if (typeof chunk === 'string') {
    return stringCodes(chunk);
  }
  if (chunk instanceof Uint8Array) {
    return chunk;
  }
  throw new WalletError('Unexpected terminal input.', { code: 'wallet_operation_failed' });
}

function* stringCodes(value: string): Iterable<number> {
  for (const character of value) {
    yield character.charCodeAt(0);
  }
}

function bytesToAscii(buffer: Uint8Array, length: number): string {
  const copy = Buffer.from(buffer.subarray(0, length));
  try {
    return copy.toString('latin1');
  } finally {
    copy.fill(0);
  }
}
