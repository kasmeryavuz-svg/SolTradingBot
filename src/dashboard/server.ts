import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from '../config/types.js';
import { DASHBOARD_BIND_HOST } from './constants.js';
import { DashboardError } from './errors.js';
import { handleDashboardRequest, type DashboardStaticAssets } from './router.js';
import { DASHBOARD_SECURITY_HEADERS } from './security.js';
import { DashboardService, systemDashboardClock } from './service.js';
import type { DashboardClock } from './types.js';

export type DashboardListenAddress = {
  address: string;
  port: number;
  family: string;
};

export class DashboardHttpServer {
  private readonly server: Server;
  private readonly service: DashboardService;
  private readonly assets: DashboardStaticAssets;
  private readonly port: number;

  constructor(options: {
    config: AppConfig;
    clock?: DashboardClock;
    assets?: DashboardStaticAssets;
  }) {
    this.port = options.config.dashboard.port;
    this.service = new DashboardService(options.config, options.clock ?? systemDashboardClock);
    this.assets = options.assets ?? loadDashboardStaticAssets();
    this.server = createServer((request, response) => {
      handleDashboardRequest({
        request,
        response,
        port: this.port,
        service: this.service,
        assets: this.assets,
      });
    });
    this.server.on('connect', (_request, socket) => {
      const body = '{"error":{"code":"method_not_allowed","message":"Method not allowed."}}';
      socket.write(
        [
          'HTTP/1.1 405 Method Not Allowed',
          'Allow: GET, HEAD',
          `Content-Security-Policy: ${DASHBOARD_SECURITY_HEADERS['Content-Security-Policy']}`,
          'X-Content-Type-Options: nosniff',
          'Referrer-Policy: no-referrer',
          'X-Frame-Options: DENY',
          'Cache-Control: no-store',
          `Permissions-Policy: ${DASHBOARD_SECURITY_HEADERS['Permissions-Policy']}`,
          'Content-Type: application/json; charset=utf-8',
          `Content-Length: ${String(Buffer.byteLength(body))}`,
          'Connection: close',
          '',
          body,
        ].join('\r\n'),
      );
      socket.end();
    });
  }

  listen(): Promise<DashboardListenAddress> {
    return new Promise((resolve, reject) => {
      const fail = (error: Error): void => {
        this.server.close(() => {
          reject(toDashboardListenError(error));
        });
      };
      this.server.once('error', fail);
      this.server.listen(this.port, DASHBOARD_BIND_HOST, () => {
        this.server.off('error', fail);
        try {
          resolve(this.address());
        } catch (error: unknown) {
          fail(error instanceof Error ? error : new Error('Dashboard failed to start the HTTP listener.'));
        }
      });
    });
  }

  address(): DashboardListenAddress {
    const address = this.server.address();
    if (address === null || typeof address === 'string') {
      throw new DashboardError('Dashboard server has no TCP address.');
    }
    return {
      address: address.address,
      port: address.port,
      family: address.family,
    };
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((error) => {
        if (error && isErrnoException(error) && error.code === 'ERR_SERVER_NOT_RUNNING') {
          resolve();
          return;
        }
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

function toDashboardListenError(error: Error): DashboardError {
  if (isErrnoException(error) && error.code === 'EADDRINUSE') {
    return new DashboardError('Dashboard port is already in use.');
  }
  return new DashboardError('Dashboard failed to start the HTTP listener.');
}

function isErrnoException(error: Error): error is NodeJS.ErrnoException {
  return 'code' in error;
}

export function createDashboardServer(options: {
  config: AppConfig;
  clock?: DashboardClock;
  assets?: DashboardStaticAssets;
}): DashboardHttpServer {
  return new DashboardHttpServer(options);
}

export function loadDashboardStaticAssets(): DashboardStaticAssets {
  const directory = join(dirname(fileURLToPath(import.meta.url)), 'public');
  return {
    html: readFileSync(join(directory, 'index.html')),
    javascript: readFileSync(join(directory, 'app.js')),
    css: readFileSync(join(directory, 'styles.css')),
  };
}
