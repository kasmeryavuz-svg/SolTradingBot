import { describe, expect, it } from 'vitest';
import { runProductionSupervisor } from '../src/production/supervisor.js';
import {
  createFakeClock,
  createRecoverableProviderFailure,
  freePort,
  initTempDatabase,
  productionEnv,
} from './production-fixtures.js';

async function readJson(
  url: string,
  method: 'GET' | 'HEAD' | 'POST' = 'GET',
): Promise<{ status: number; headers: Headers; body: string }> {
  const response = await fetch(url, { method });
  return {
    status: response.status,
    headers: response.headers,
    body: method === 'HEAD' ? '' : await response.text(),
  };
}

describe('production health', () => {
  it('serves healthz 200 and readyz 503/200 according to cycle success', async () => {
    const { directory, path } = initTempDatabase();
    const port = await freePort();
    const gates: Array<{ outcome: 'ok' | 'fail'; release: () => void }> = [];
    let requestShutdown: (() => void) | undefined;
    let resolveStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });

    const finished = runProductionSupervisor(
      productionEnv({
        DATABASE_PATH: path,
        PROD20_HEALTH_PORT: String(port),
      }),
      {
        clock: createFakeClock(),
        logger: { write: (): void => undefined },
        skipPreflight: true,
        skipLock: true,
        installSignals: false,
        lockDirectory: directory,
        onStarted: (control) => {
          requestShutdown = control.requestShutdown;
          resolveStarted?.();
        },
        runCollectorCycle: async () => {
          const gate: { outcome: 'ok' | 'fail'; release: () => void } = {
            outcome: 'ok',
            release: () => undefined,
          };
          await new Promise<void>((resolve) => {
            gate.release = resolve;
            gates.push(gate);
          });
          if (gate.outcome === 'fail') {
            throw createRecoverableProviderFailure('provider timeout');
          }
        },
      },
    );

    await started;
    const healthz = await readJson(`http://127.0.0.1:${String(port)}/healthz`);
    expect(healthz.status).toBe(200);
    const healthBody = JSON.parse(healthz.body) as { shuttingDown: boolean };
    expect(healthBody.shuttingDown).toBe(false);
    expect(healthz.body).not.toContain(path);
    expect(healthz.body).not.toMatch(/SOLANA_RPC|watchlist|api-key/i);
    expect((await readJson(`http://127.0.0.1:${String(port)}/readyz`)).status).toBe(503);

    await waitFor(() => gates.length >= 1);
    const firstGate = gates[0];
    expect(firstGate).toBeDefined();
    firstGate?.release();
    await waitFor(async () => (await readJson(`http://127.0.0.1:${String(port)}/readyz`)).status === 200);

    await waitFor(() => gates.length >= 2);
    const secondGate = gates[1];
    expect(secondGate).toBeDefined();
    if (secondGate !== undefined) {
      secondGate.outcome = 'fail';
      secondGate.release();
    }
    await waitFor(async () => (await readJson(`http://127.0.0.1:${String(port)}/readyz`)).status === 503);

    await waitFor(() => gates.length >= 3);
    const thirdGate = gates[2];
    expect(thirdGate).toBeDefined();
    thirdGate?.release();
    await waitFor(async () => (await readJson(`http://127.0.0.1:${String(port)}/readyz`)).status === 200);

    const post = await readJson(`http://127.0.0.1:${String(port)}/healthz`, 'POST');
    expect(post.status).toBe(405);
    expect(post.headers.get('access-control-allow-origin')).toBeNull();
    expect((await readJson(`http://127.0.0.1:${String(port)}/nope`)).status).toBe(404);
    expect((await readJson(`http://127.0.0.1:${String(port)}/healthz`, 'HEAD')).status).toBe(200);

    requestShutdown?.();
    await waitFor(async () => {
      const ready = await readJson(`http://127.0.0.1:${String(port)}/readyz`);
      return ready.status === 503;
    });
    expect((await readJson(`http://127.0.0.1:${String(port)}/healthz`)).status).toBe(200);
    for (const gate of gates) {
      gate.release();
    }
    await finished;
  });
});

async function waitFor(predicate: (() => boolean) | (() => Promise<boolean>)): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('timed out');
}
