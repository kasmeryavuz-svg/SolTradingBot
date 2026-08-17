import { createServer, connect as netConnect } from 'node:net';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSqlitePersistenceRepository,
  type SqlitePersistenceRepository,
} from '../src/persistence/index.js';
import { startDashboardServer, type DashboardClock } from '../src/dashboard/index.js';
import type { DashboardHttpServer } from '../src/dashboard/server.js';

export const FIXED_CLOCK: DashboardClock = {
  nowIso(): string {
    return '2026-08-17T22:00:00.000Z';
  },
};

const tempDirs: string[] = [];
const openRepos: SqlitePersistenceRepository[] = [];
const openServers: DashboardHttpServer[] = [];

export function dashboardTempDbPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'mtb-dashboard-'));
  tempDirs.push(directory);
  return join(directory, 'history.sqlite');
}

export function openDashboardWriteRepo(path: string): SqlitePersistenceRepository {
  const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
  repository.initialize();
  openRepos.push(repository);
  return repository;
}

export async function getFreeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (address === null || typeof address === 'string') {
          reject(new Error('expected TCP address'));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

export async function startTestDashboard(env: Record<string, string> = {}): Promise<{
  port: number;
  server: DashboardHttpServer;
}> {
  const port = env['DASHBOARD_PORT'] === undefined ? await getFreeLoopbackPort() : Number(env['DASHBOARD_PORT']);
  const server = await startDashboardServer(
    {
      TRADING_ENABLED: 'false',
      ...env,
      DASHBOARD_PORT: String(port),
    },
    { clock: FIXED_CLOCK },
  );
  openServers.push(server);
  return { port, server };
}

export function rawDashboardRequest(options: {
  port: number;
  path: string;
  method: string;
  host?: string;
  body?: string;
}): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port: options.port,
        path: options.path,
        method: options.method,
        headers: {
          host: options.host ?? `127.0.0.1:${String(options.port)}`,
          ...(options.body === undefined
            ? {}
            : { 'content-length': String(Buffer.byteLength(options.body)) }),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    if (options.body === undefined) {
      req.end();
    } else {
      req.end(options.body);
    }
  });
}

export function rawDashboardHttp(options: {
  port: number;
  method?: string;
  requestTarget: string;
  headerLines: readonly string[];
}): Promise<{ status: number; raw: string; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host: '127.0.0.1', port: options.port }, () => {
      const method = options.method ?? 'GET';
      socket.write(
        `${method} ${options.requestTarget} HTTP/1.1\r\n${options.headerLines.join('\r\n')}\r\nConnection: close\r\n\r\n`,
      );
    });
    const chunks: Buffer[] = [];
    socket.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    socket.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const match = /^HTTP\/1\.\d (\d{3})/.exec(raw);
      const separator = raw.indexOf('\r\n\r\n');
      resolve({
        status: match?.[1] === undefined ? 0 : Number(match[1]),
        raw,
        body: separator < 0 ? '' : raw.slice(separator + 4),
      });
    });
    socket.on('error', reject);
    socket.setTimeout(3000, () => {
      socket.destroy();
      reject(new Error('raw dashboard HTTP timed out'));
    });
  });
}

export function rawConnectMethod(port: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host: '127.0.0.1', port }, () => {
      socket.write(
        `CONNECT 127.0.0.1:${String(port)} HTTP/1.1\r\nHost: 127.0.0.1:${String(port)}\r\n\r\n`,
      );
    });
    const chunks: Buffer[] = [];
    socket.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    socket.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const match = /^HTTP\/1\.\d (\d{3})/.exec(raw);
      resolve({
        status: match?.[1] === undefined ? 0 : Number(match[1]),
        body: raw,
      });
    });
    socket.on('error', reject);
    socket.setTimeout(3000, () => {
      socket.destroy();
      reject(new Error('CONNECT timed out'));
    });
  });
}

export async function cleanupDashboardHarness(): Promise<void> {
  while (openServers.length > 0) {
    const server = openServers.pop();
    if (server !== undefined) {
      try {
        await server.close();
      } catch {
        // Already closed by the test.
      }
    }
  }
  while (openRepos.length > 0) {
    try {
      openRepos.pop()?.close();
    } catch {
      // Already closed by the test.
    }
  }
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory !== undefined) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}
