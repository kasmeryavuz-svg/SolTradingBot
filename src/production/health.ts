import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { PROD20_HEALTH_HOST, PROD20_SECURITY_HEADERS } from './constants.js';
import type {
  ProductionHealthListenAddress,
  ProductionHealthRuntime,
  ProductionHealthSnapshot,
  ProductionReadyReason,
} from './types.js';

export type ProductionHealthState = {
  snapshot: () => ProductionHealthSnapshot;
};

export class ProductionHealthServer implements ProductionHealthRuntime {
  private readonly server: Server;
  private readonly port: number;
  private readonly state: ProductionHealthState;
  private runtimeErrorHandler: ((error: Error) => void) | undefined;
  private listening = false;

  constructor(options: { port: number; state: ProductionHealthState }) {
    this.port = options.port;
    this.state = options.state;
    this.server = createServer((request, response) => {
      handleProductionHealthRequest({
        request,
        response,
        port: this.port,
        snapshot: this.state.snapshot(),
      });
    });
  }

  setRuntimeErrorHandler(handler: (error: Error) => void): void {
    this.runtimeErrorHandler = handler;
  }

  listen(): Promise<ProductionHealthListenAddress> {
    return new Promise((resolve, reject) => {
      const fail = (error: Error): void => {
        this.server.close(() => {
          reject(error);
        });
      };
      this.server.once('error', fail);
      this.server.listen(this.port, PROD20_HEALTH_HOST, () => {
        this.server.off('error', fail);
        const address = this.server.address();
        if (address === null || typeof address === 'string') {
          fail(new Error('Production health server has no TCP address.'));
          return;
        }
        this.listening = true;
        this.server.on('error', (error: Error) => {
          this.runtimeErrorHandler?.(error);
        });
        resolve({ address: address.address, port: address.port });
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.listening) {
        this.server.close(() => {
          resolve();
        });
        return;
      }
      this.listening = false;
      this.server.close((error) => {
        if (error && isErrnoException(error) && error.code === 'ERR_SERVER_NOT_RUNNING') {
          resolve();
          return;
        }
        resolve();
      });
    });
  }
}

export function handleProductionHealthRequest(input: {
  request: IncomingMessage;
  response: ServerResponse;
  port: number;
  snapshot: ProductionHealthSnapshot;
}): void {
  const method = input.request.method ?? '';
  if (method !== 'GET' && method !== 'HEAD') {
    sendJson(input.response, 405, { error: { code: 'method_not_allowed', message: 'Method not allowed.' } }, method);
    return;
  }
  if (!isAllowedProductionHost(input.request.headers.host, input.port)) {
    sendJson(input.response, 400, { error: { code: 'bad_request', message: 'Invalid Host header.' } }, method);
    return;
  }

  const route = resolveProductionHealthRoute(input.request.url);
  if (route === 'not_found') {
    sendJson(input.response, 404, { error: { code: 'not_found', message: 'Not found.' } }, method);
    return;
  }

  if (route === 'healthz') {
    sendJson(
      input.response,
      200,
      {
        status: 'ok',
        specVersion: input.snapshot.specVersion,
        specFingerprint: input.snapshot.specFingerprint,
        uptimeMs: input.snapshot.uptimeMs,
        shuttingDown: input.snapshot.shuttingDown,
      },
      method,
    );
    return;
  }

  const ready = isProductionReady(input.snapshot);
  sendJson(
    input.response,
    ready ? 200 : 503,
    {
      status: ready ? 'ready' : 'not_ready',
      specVersion: input.snapshot.specVersion,
      specFingerprint: input.snapshot.specFingerprint,
      reason: productionReadyReason(input.snapshot),
    },
    method,
  );
}

export function isProductionReady(snapshot: ProductionHealthSnapshot): boolean {
  return (
    snapshot.startupPassed &&
    snapshot.lockHeld &&
    !snapshot.shuttingDown &&
    snapshot.consecutiveFailedCycles < 3 &&
    snapshot.completedSuccessfulCycle
  );
}

export function productionReadyReason(snapshot: ProductionHealthSnapshot): ProductionReadyReason {
  if (snapshot.shuttingDown) {
    return 'shutting_down';
  }
  if (snapshot.consecutiveFailedCycles >= 3) {
    return 'circuit_open';
  }
  if (!snapshot.startupPassed || !snapshot.lockHeld) {
    return 'startup';
  }
  if (!snapshot.completedSuccessfulCycle) {
    return snapshot.consecutiveFailedCycles > 0 ? 'failed_cycle' : 'startup';
  }
  return 'ready';
}

export function resolveProductionHealthRoute(rawUrl: string | undefined): 'healthz' | 'readyz' | 'not_found' {
  if (rawUrl === undefined || rawUrl === '') {
    return 'not_found';
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl, 'http://127.0.0.1');
  } catch {
    return 'not_found';
  }
  if (parsed.search !== '' || parsed.hash !== '' || rawUrl.includes('?') || rawUrl.includes('#')) {
    return 'not_found';
  }
  if (parsed.pathname === '/healthz') {
    return 'healthz';
  }
  if (parsed.pathname === '/readyz') {
    return 'readyz';
  }
  return 'not_found';
}

export function isAllowedProductionHost(hostHeader: string | string[] | undefined, port: number): boolean {
  if (typeof hostHeader !== 'string') {
    return false;
  }
  const separator = hostHeader.lastIndexOf(':');
  if (separator <= 0 || separator === hostHeader.length - 1) {
    return false;
  }
  const hostname = hostHeader.slice(0, separator);
  const portText = hostHeader.slice(separator + 1);
  if (portText !== String(port)) {
    return false;
  }
  if (hostname === PROD20_HEALTH_HOST) {
    return true;
  }
  return hostname.length === 9 && hostname.toLowerCase() === 'localhost';
}

function sendJson(response: ServerResponse, status: number, body: unknown, method: string): void {
  const payload = JSON.stringify(body);
  for (const [name, value] of Object.entries(PROD20_SECURITY_HEADERS)) {
    response.setHeader(name, value);
  }
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Content-Length', Buffer.byteLength(payload));
  if (status === 405) {
    response.setHeader('Allow', 'GET, HEAD');
  }
  if (method === 'HEAD') {
    response.end();
    return;
  }
  response.end(payload);
}

function isErrnoException(error: Error): error is NodeJS.ErrnoException {
  return 'code' in error;
}
