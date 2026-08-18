import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { loadConfig } from '../src/config/index.js';
import {
  LIVE_BROADCAST_RISK_STATUSES,
  LIVE_GET_TRANSACTION_COMMITMENT,
  LIVE_GET_TRANSACTION_ENCODING,
  LIVE_GET_TRANSACTION_MAX_SUPPORTED_VERSION,
  LIVE_MAX_RETRIES,
  LIVE_PREFLIGHT_COMMITMENT,
  LIVE_SEND_ENCODING,
  LIVE_SKIP_PREFLIGHT,
} from '../src/live/constants.js';
import { LIVE_ATTEMPT_STATUSES } from '../src/live/types.js';
import { assertExactLiveConfirmation, liveConfirmationPhrase, promptLiveConfirmation } from '../src/live/confirmation.js';
import { trackExpectedSignature } from '../src/live/confirmation-tracker.js';
import { executeLiveBroadcast } from '../src/live/execute.js';
import { LiveError } from '../src/live/errors.js';
import { assertLiveAmount, assertNoConfirmationBypassEnv, assertNoExtraLiveArguments } from '../src/live/gates.js';
import { signedWireSha256FromBase64 } from '../src/live/identity.js';
import { executeLiveHistory } from '../src/live/history.js';
import { utcDayKey, utcDayStartMs } from '../src/live/limits.js';
import { executeLivePreview } from '../src/live/preview.js';
import { executeLiveReconcile } from '../src/live/reconcile.js';
import { createLiveRpc, LIVE_SEND_TRANSACTION_CONFIG } from '../src/live/rpc.js';
import { existingAttemptMaySendAgain, isBroadcastRiskStatus, isReconcileEligibleStatus, mayHaveBeenSent } from '../src/live/state.js';
import { runLiveReconcile, runLiveStatus } from '../src/live/command.js';
import {
  createFakeLiveRpc,
  dummyCanonicalSignature,
  instantClock,
  liveExecutionRpc,
  liveJupiter,
  openFileLiveStore,
  openMemoryLiveStore,
  reserveLiveRow,
} from './live-fixtures.js';
import { createFakeTerminal, loadTestWalletFixture, walletExecutionIntent } from './wallet-fixtures.js';

const opened: Array<{ close: () => void; store?: ReturnType<typeof openMemoryLiveStore>['store'] }> = [];

afterEach(() => {
  while (opened.length > 0) {
    opened.pop()?.close();
  }
});

async function executeWith(
  overrides: {
    sendBehavior?: 'ok' | 'timeout' | 'mismatch' | 'reject' | 'hang' | 'malformed';
    hangStatus?: boolean;
    confirm?: (phrase: string) => Promise<void>;
    afterConfirmation?: Parameters<typeof executeLiveBroadcast>[0]['afterConfirmation'];
    afterRiskCommitted?: () => void;
    wrapStore?: (store: ReturnType<typeof openMemoryLiveStore>['store']) => void;
    heightBeforeSend?: bigint;
    amountRaw?: string;
    secret?: string;
    clock?: ReturnType<typeof instantClock>;
  } = {},
) {
  const fixture = await loadTestWalletFixture();
  const memory = openMemoryLiveStore();
  opened.push(memory);
  if (overrides.wrapStore !== undefined) {
    overrides.wrapStore(memory.store);
  }
  const liveRpc = createFakeLiveRpc({
    takerAddress: fixture.address,
    sendBehavior: overrides.sendBehavior ?? 'ok',
    ...(overrides.hangStatus === undefined ? {} : { hangStatus: overrides.hangStatus }),
    height: 900n,
    initialStatus:
      overrides.sendBehavior === 'hang'
        ? null
        : { slot: '123', err: null, confirmationStatus: 'confirmed' },
  });
  if (overrides.heightBeforeSend !== undefined) {
    const original = liveRpc.getBlockHeight.bind(liveRpc);
    let calls = 0;
    liveRpc.getBlockHeight = () => {
      calls += 1;
      if (calls > 1) {
        liveRpc.setHeight(overrides.heightBeforeSend ?? 900n);
      }
      return original();
    };
  }
  const counters = { secret: 0, sign: 0, send: 0 };
  const intent = {
    ...walletExecutionIntent(fixture.address),
    amountRaw: overrides.amountRaw ?? '1000000',
  };
  const report = await executeLiveBroadcast({
    intent,
    jupiter: liveJupiter(fixture.address),
    executionRpc: liveExecutionRpc(),
    liveRpc,
    store: memory.store,
    promptSecret: () => {
      counters.secret += 1;
      return Promise.resolve(overrides.secret ?? fixture.secretBase58);
    },
    promptConfirmation: overrides.confirm ?? (() => Promise.resolve()),
    clock: overrides.clock ?? instantClock(),
    onSign: () => {
      counters.sign += 1;
    },
    onSend: () => {
      counters.send += 1;
    },
    ...(overrides.afterConfirmation === undefined ? {} : { afterConfirmation: overrides.afterConfirmation }),
    ...(overrides.afterRiskCommitted === undefined ? {} : { afterRiskCommitted: overrides.afterRiskCommitted }),
  });
  return { report, liveRpc, counters, fixture, store: memory.store };
}

describe('live hostile audit', () => {
  it('A: persist failure before broadcast_submitting never sends', async () => {
    await expect(
      executeWith({
        wrapStore(store) {
          store.enterBroadcastSubmitting = () => {
            throw new LiveError('forced persist failure', { code: 'persist_failed_before_send' });
          };
        },
      }),
    ).rejects.toThrow(/persist|broadcast_submitting/);
    const crashA = opened.at(-1);
    if (crashA?.store === undefined) {
      throw new Error('expected store');
    }
    const row = crashA.store.listRecent(1)[0];
    expect(row?.status).toBe('signed');
    expect(row?.broadcastRiskAtMs).toBeNull();
  });

  it('B: crash after broadcast_submitting commit is maybe-sent and never resent', async () => {
    await expect(
      executeWith({
        afterRiskCommitted() {
          throw new Error('crash after risk commit');
        },
      }),
    ).rejects.toThrow(/crash after risk commit/);
    const memory = opened.at(-1);
    if (memory?.store === undefined) {
      throw new Error('expected store');
    }
    const row = memory.store.listRecent(1)[0];
    if (row === undefined) {
      throw new Error('expected live row');
    }
    expect(row.status).toBe('broadcast_submitting');
    expect(mayHaveBeenSent(row.status)).toBe(true);
    const liveRpc = createFakeLiveRpc({
      initialStatus: null,
      height: 900n,
    });
    const report = await executeLiveReconcile({
      store: memory.store,
      liveRpc,
      clock: instantClock(),
    });
    expect(liveRpc.sendCount).toBe(0);
    expect(report.sendCount).toBe(0);
    expect(report.status).not.toBe('signed');
  });

  it('C/D: hanging send times out as unknown and reconcile can confirm the expected txid', async () => {
    const started = Date.now();
    const { report, liveRpc, store } = await executeWith({ sendBehavior: 'hang' });
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(liveRpc.sendCount).toBe(1);
    expect(report.status === 'broadcast_outcome_unknown' || report.status === 'broadcast_pending').toBe(true);
    expect(report.expectedSignature).toBeTruthy();
    liveRpc.setStatus({ slot: '9', err: null, confirmationStatus: 'confirmed' });
    const reconciled = await executeLiveReconcile({
      store,
      liveRpc,
      clock: instantClock(),
    });
    expect(liveRpc.sendCount).toBe(1);
    expect(reconciled.sendCount).toBe(0);
    expect(reconciled.status === 'confirmed' || reconciled.status === 'confirmed_receipt_pending' || reconciled.status === 'finalized').toBe(true);
  }, 20_000);

  it('persist failure after send leaves broadcast_submitting recoverable by reconcile', async () => {
    const fixture = await loadTestWalletFixture();
    const memory = openMemoryLiveStore();
    opened.push(memory);
    const innerUpdate = memory.store.update.bind(memory.store);
    memory.store.update = (attemptId, patch) => {
      if (patch.status === 'broadcast_submitted') {
        throw new Error('forced db failure after send');
      }
      return innerUpdate(attemptId, patch);
    };
    const liveRpc = createFakeLiveRpc({
      takerAddress: fixture.address,
      initialStatus: { slot: '9', err: null, confirmationStatus: 'confirmed' },
    });
    await expect(
      executeLiveBroadcast({
        intent: walletExecutionIntent(fixture.address),
        jupiter: liveJupiter(fixture.address),
        executionRpc: liveExecutionRpc(),
        liveRpc,
        store: memory.store,
        promptSecret: () => Promise.resolve(fixture.secretBase58),
        promptConfirmation: () => Promise.resolve(),
        clock: instantClock(),
      }),
    ).rejects.toThrow(/forced db failure after send/);
    expect(liveRpc.sendCount).toBe(1);
    const row = memory.store.listRecent(1)[0];
    expect(row?.status).toBe('broadcast_submitting');
    expect(row?.expectedSignature).toBeTruthy();
    const reconciled = await executeLiveReconcile({
      store: memory.store,
      liveRpc,
      clock: instantClock(),
    });
    expect(liveRpc.sendCount).toBe(1);
    expect(reconciled.sendCount).toBe(0);
  });

  it('two concurrent different candidates share one remaining daily slot', async () => {
    const file = openFileLiveStore();
    opened.push(file);
    const noon = Date.parse('2026-08-18T12:00:00.000Z');
    file.store.reserve(
      reserveLiveRow({
        status: 'broadcast_submitted',
        amountRaw: '1000000',
        broadcastRiskAtMs: noon,
        executionCandidateFingerprint: '1'.repeat(64),
      }),
    );
    file.store.reserve(
      reserveLiveRow({
        status: 'signed',
        expectedSignature: dummyCanonicalSignature(4),
        signedWireSha256: 'a'.repeat(64),
        executionCandidateFingerprint: '2'.repeat(64),
      }),
    );
    const second = file.openSecond();
    opened.push(second);
    second.store.reserve(
      reserveLiveRow({
        status: 'signed',
        expectedSignature: dummyCanonicalSignature(5),
        signedWireSha256: 'b'.repeat(64),
        executionCandidateFingerprint: '3'.repeat(64),
      }),
    );
    const firstSigned = file.store.listRecent(3).find((row) => row.executionCandidateFingerprint === '2'.repeat(64));
    const secondSigned = second.store.listRecent(3).find((row) => row.executionCandidateFingerprint === '3'.repeat(64));
    if (firstSigned === undefined || secondSigned === undefined) {
      throw new Error('expected signed candidates');
    }
    const results = await Promise.allSettled([
      Promise.resolve().then(() => file.store.enterBroadcastSubmitting(firstSigned.attemptId, noon)),
      Promise.resolve().then(() => second.store.enterBroadcastSubmitting(secondSigned.attemptId, noon)),
    ]);
    const fulfilled = results.filter((item) => item.status === 'fulfilled');
    const rejected = results.filter((item) => item.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String((rejected[0] as PromiseRejectedResult).reason)).toMatch(/daily|UTC|attempt|limit/i);
    const usage = file.store.dailyUsage('GkwFnmMDvn3HGMpJpWBg8tgJxr3NxNvg3AXxvXVPbRGJ', noon);
    expect(usage.attemptCount).toBe(2);
    expect(usage.inputLamports).toBe(2_000_000n);
  });

  it('same candidate cannot be reserved twice across connections', async () => {
    const file = openFileLiveStore();
    opened.push(file);
    const second = file.openSecond();
    opened.push(second);
    const row = reserveLiveRow({ executionCandidateFingerprint: '9'.repeat(64) });
    const results = await Promise.allSettled([
      Promise.resolve().then(() => file.store.reserve(row)),
      Promise.resolve().then(() => second.store.reserve({ ...row, attemptId: 'c'.repeat(64) })),
    ]);
    const fulfilled = results.filter((item) => item.status === 'fulfilled');
    const rejected = results.filter((item) => item.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it('fresh UTC day allows two 1m risk entries and refuses the third', () => {
    const memory = openMemoryLiveStore();
    opened.push(memory);
    const store = memory.store;
    const day = Date.parse('2026-08-19T00:00:01.000Z');
    for (const digit of ['1', '2'] as const) {
      const reserved = store.reserve(
        reserveLiveRow({
          status: 'signed',
          expectedSignature: dummyCanonicalSignature(Number(digit)),
          signedWireSha256: digit.repeat(64),
          executionCandidateFingerprint: digit.repeat(64),
        }),
      );
      store.enterBroadcastSubmitting(reserved.attemptId, day);
    }
    const third = store.reserve(
      reserveLiveRow({
        status: 'signed',
        expectedSignature: dummyCanonicalSignature(8),
        signedWireSha256: '8'.repeat(64),
        executionCandidateFingerprint: '8'.repeat(64),
      }),
    );
    expect(() => store.enterBroadcastSubmitting(third.attemptId, day)).toThrow(LiveError);
    expect(store.dailyUsage(third.takerAddress, day).attemptCount).toBe(2);
  });

  it('captures exact sendTransaction JSON options including numeric maxRetries 0', async () => {
    const bodies: unknown[] = [];
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          bodies.push(JSON.parse(raw));
        } catch {
          bodies.push(raw);
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: dummyCanonicalSignature(7) }));
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected tcp address');
    }
    const wire = Buffer.alloc(65, 1).toString('base64');
    const rpc = createLiveRpc(`http://127.0.0.1:${String(address.port)}`, 1_000);
    try {
      await rpc.sendTransaction(wire);
    } catch {
      // Kit may reject the dummy returned signature; the request body is the proof.
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
    const send = bodies.find((body) => {
      return typeof body === 'object' && body !== null && (body as { method?: string }).method === 'sendTransaction';
    }) as { params?: [string, Record<string, unknown>] } | undefined;
    expect(send).toBeDefined();
    const config = send?.params?.[1] ?? {};
    expect(config['encoding']).toBe(LIVE_SEND_ENCODING);
    expect(config['skipPreflight']).toBe(LIVE_SKIP_PREFLIGHT);
    expect(config['preflightCommitment']).toBe(LIVE_PREFLIGHT_COMMITMENT);
    expect(config['maxRetries']).toBe(0);
    expect(typeof config['maxRetries']).toBe('number');
    expect(Object.prototype.hasOwnProperty.call(config, 'minContextSlot')).toBe(false);
    expect(LIVE_SEND_TRANSACTION_CONFIG.maxRetries).toBe(LIVE_MAX_RETRIES);
    const sentWire = send?.params?.[0];
    expect(typeof sentWire).toBe('string');
    expect(signedWireSha256FromBase64(String(sentWire))).toBe(signedWireSha256FromBase64(wire));
  });

  it('times out a hanging confirmation status poll inside the tracker wall', async () => {
    const rpc = createFakeLiveRpc({ hangStatus: true, height: 900n });
    const started = Date.now();
    const outcome = await trackExpectedSignature({
      rpc,
      expectedSignature: dummyCanonicalSignature(9),
      lastValidBlockHeight: 1000n,
      timeoutMs: 200,
      intervalMs: 20,
      requestTimeoutMs: 40,
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(outcome.status === 'broadcast_pending' || outcome.status === 'expired_unconfirmed').toBe(true);
  });

  it('refuses confirmation phrase variants exactly', () => {
    const phrase = liveConfirmationPhrase('abcd1234ffff', '1000000');
    expect(phrase).toBe('LIVE SEND abcd1234 1000000');
    const rejected = [
      phrase.toLowerCase(),
      ` ${phrase}`,
      `${phrase} `,
      `${phrase} extra`,
      'LIVE SEND abcd1234 01',
      'LIVE SEND abcd1234 +100',
      'LIVE SEND abcd1234 1e6',
      'LIVE SEND deadbeef 1000000',
      `${phrase}\nlive:execute`,
    ];
    for (const actual of rejected) {
      expect(() => {
        assertExactLiveConfirmation(actual, phrase);
      }).toThrow(LiveError);
    }
  });

  it('restores TTY listener count after confirmation', async () => {
    const phrase = liveConfirmationPhrase('abcd1234ffff', '1000000');
    const terminal = createFakeTerminal();
    expect(terminal.adapter.dataListenerCount).toBe(0);
    const pending = promptLiveConfirmation(phrase, terminal.adapter);
    await Promise.resolve();
    terminal.push(phrase);
    terminal.push('\r');
    await pending;
    expect(terminal.adapter.dataListenerCount).toBe(0);
    expect(terminal.rawMode).toBe(false);
  });

  it('does not prompt a secret when reservation or confirmation TOCTOU fails', async () => {
    const fixture = await loadTestWalletFixture();
    const memory = openMemoryLiveStore();
    opened.push(memory);
    const liveRpc = createFakeLiveRpc({ takerAddress: fixture.address });
    let secret = 0;
    await expect(
      executeLiveBroadcast({
        intent: walletExecutionIntent(fixture.address),
        jupiter: liveJupiter(fixture.address),
        executionRpc: liveExecutionRpc(),
        liveRpc,
        store: memory.store,
        promptSecret: () => {
          secret += 1;
          return Promise.resolve(fixture.secretBase58);
        },
        afterConfirmation(context) {
          (context.report as { executionCandidateFingerprint: string }).executionCandidateFingerprint = '0'.repeat(64);
        },
        promptConfirmation: () => Promise.resolve(),
      }),
    ).rejects.toThrow(/candidate_changed_after_confirmation|changed after/);
    expect(secret).toBe(0);
    expect(liveRpc.sendCount).toBe(0);
  });

  it('keeps final headroom failure before broadcast_submitting unsent', async () => {
    const { report, liveRpc, store } = await executeWith({ heightBeforeSend: 995n });
    expect(liveRpc.sendCount).toBe(0);
    expect(report.status).toBe('stale_before_send');
    expect(store.listRecent(1)[0]?.status).toBe('stale_before_send');
    expect(store.listRecent(1)[0]?.broadcastRiskAtMs).toBeNull();
  });

  it('rejects extra reconcile arguments and confirmation bypass env', () => {
    expect(() => {
      assertNoExtraLiveArguments(['node', 'reconcile.ts', 'SOME_SIGNATURE'], 'live:reconcile');
    }).toThrow(LiveError);
    expect(() => {
      assertNoExtraLiveArguments(['node', 'reconcile.ts', '--txid'], 'live:reconcile');
    }).toThrow(LiveError);
    expect(() => {
      assertNoConfirmationBypassEnv({ CI: 'true' });
    }).toThrow(LiveError);
    expect(() => {
      assertNoConfirmationBypassEnv({ CONFIRM: 'LIVE SEND' });
    }).toThrow(LiveError);
    expect(() => {
      assertNoConfirmationBypassEnv({ AUTO_CONFIRM: 'true', YES: 'true' });
    }).toThrow(LiveError);
  });

  it('does not let env override hard caps or pair/amount grammar', () => {
    const config = loadConfig({
      LIVE_MAX_INPUT_LAMPORTS: '999999999',
      LIVE_MAX_DAILY: '9',
      LIVE_MAX_FEE: '9',
      LIVE_PAIR: 'BONK',
      LIVE_BROADCAST_ENABLED: 'true',
    });
    expect(config.liveBroadcastEnabled).toBe(true);
    expect(() => {
      assertLiveAmount('1000001');
    }).toThrow(LiveError);
    expect(() => {
      assertLiveAmount('01');
    }).toThrow(LiveError);
    expect(() => {
      assertLiveAmount('+1');
    }).toThrow(LiveError);
    expect(() => {
      assertLiveAmount('1.0');
    }).toThrow(LiveError);
    expect(() => {
      assertLiveAmount('1e6');
    }).toThrow(LiveError);
    expect(assertLiveAmount('1000000')).toBe(1_000_000n);
    expect(WRAPPED_SOL_MINT).toBe('So11111111111111111111111111111111111111112');
    expect(USDC_MINT).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  });

  it('keeps live:status and live:history off-network and classifies every status', async () => {
    const status = runLiveStatus({ TRADING_ENABLED: 'false', LIVE_BROADCAST_ENABLED: 'false' }, ['node', 'status.ts']);
    expect(status.jito).toBe('disabled');
    const memory = openMemoryLiveStore();
    opened.push(memory);
    expect(executeLiveHistory(memory.store)).toEqual([]);
    await expect(
      runLiveReconcile({ SOLANA_NETWORK: 'mainnet-beta', DATABASE_ENABLED: 'true', DATABASE_PATH: ':memory:' }, [
        'node',
        'reconcile.ts',
        '--signature',
      ]),
    ).rejects.toThrow(LiveError);
    for (const value of LIVE_ATTEMPT_STATUSES) {
      expect(typeof isBroadcastRiskStatus(value)).toBe('boolean');
      expect(typeof mayHaveBeenSent(value)).toBe('boolean');
      expect(typeof isReconcileEligibleStatus(value)).toBe('boolean');
      expect(existingAttemptMaySendAgain(value)).toBe(false);
      expect(LIVE_BROADCAST_RISK_STATUSES.includes(value as (typeof LIVE_BROADCAST_RISK_STATUSES)[number]) || !isBroadcastRiskStatus(value)).toBe(true);
    }
    expect(utcDayKey(utcDayStartMs(Date.parse('2026-08-19T00:00:00.000Z')))).toBe('2026-08-19');
    expect(LIVE_GET_TRANSACTION_ENCODING).toBe('base64');
    expect(LIVE_GET_TRANSACTION_MAX_SUPPORTED_VERSION).toBe(0);
    expect(LIVE_GET_TRANSACTION_COMMITMENT).toBe('confirmed');
  });

  it('preview never reserves, signs, or sends', async () => {
    const fixture = await loadTestWalletFixture();
    const liveRpc = createFakeLiveRpc({ takerAddress: fixture.address });
    const preview = await executeLivePreview({
      intent: walletExecutionIntent(fixture.address),
      jupiter: liveJupiter(fixture.address),
      executionRpc: liveExecutionRpc(),
      liveRpc,
    });
    expect(preview.noSend).toBe(true);
    expect(liveRpc.sendCount).toBe(0);
  });
});
