import { existsSync } from 'node:fs';
import type { IncomingHttpHeaders } from 'node:http';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareDashboardCommand, startDashboardServer, DASHBOARD_TRADING_ENABLED_REFUSAL } from '../src/dashboard/index.js';
import { DashboardError } from '../src/dashboard/errors.js';
import { DASHBOARD_SECURITY_HEADERS } from '../src/dashboard/security.js';
import {
  cleanupDashboardHarness,
  dashboardTempDbPath,
  openDashboardWriteRepo,
  rawConnectMethod,
  rawDashboardRequest,
  startTestDashboard,
} from './dashboard-harness.js';
import { createSqlitePersistenceRepository } from '../src/persistence/index.js';

afterEach(async () => {
  await cleanupDashboardHarness();
});

const API_PATHS = [
  '/api/v1/dashboard',
  '/api/v1/performance',
  '/api/v1/research',
  '/api/v1/market',
  '/api/v1/runtime-paper',
  '/api/v1/database-health',
] as const;

function expectSecurityHeaders(headers: IncomingHttpHeaders): void {
  expect(headers['content-security-policy']).toBe(DASHBOARD_SECURITY_HEADERS['Content-Security-Policy']);
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['cache-control']).toBe('no-store');
  expect(headers['permissions-policy']).toBe(DASHBOARD_SECURITY_HEADERS['Permissions-Policy']);
  expect(headers['access-control-allow-origin']).toBeUndefined();
}

describe('dashboard HTTP security and API', () => {
  it('refuses to start when TRADING_ENABLED=true and leaves no listener', async () => {
    expect(() => {
      prepareDashboardCommand({ TRADING_ENABLED: 'true', DASHBOARD_PORT: '43131' });
    }).toThrow(DashboardError);
    expect(() => {
      prepareDashboardCommand({ TRADING_ENABLED: 'true', DASHBOARD_PORT: '43131' });
    }).toThrow(DASHBOARD_TRADING_ENABLED_REFUSAL);

    await expect(
      startDashboardServer({ TRADING_ENABLED: 'true', DASHBOARD_PORT: '43131' }),
    ).rejects.toThrow(/TRADING_ENABLED=true/);

    await expect(
      rawDashboardRequest({ port: 43131, path: '/', method: 'GET' }),
    ).rejects.toThrow();
  });

  it('binds only to 127.0.0.1', async () => {
    const { port, server } = await startTestDashboard({ DATABASE_ENABLED: 'false' });
    expect(server.address().address).toBe('127.0.0.1');
    expect(server.address().port).toBe(port);
    expect(server.address().family).toMatch(/IPv4/i);
  });

  it('serves GET/HEAD, rejects other methods, and validates Host', async () => {
    const path = dashboardTempDbPath();
    openDashboardWriteRepo(path).close();
    const { port } = await startTestDashboard({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: path,
    });

    const html = await rawDashboardRequest({ port, path: '/', method: 'GET' });
    expect(html.status).toBe(200);
    expect(html.headers['content-type']).toBe('text/html; charset=utf-8');
    expectSecurityHeaders(html.headers);
    expect(html.body).toContain('SolTradingBot');
    expect(html.body).not.toMatch(/\bBUY\b|\bSELL\b|CONNECT WALLET|EXECUTE/);

    const head = await rawDashboardRequest({ port, path: '/', method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body).toBe('');

    const js = await rawDashboardRequest({ port, path: '/app.js', method: 'GET' });
    expect(js.status).toBe(200);
    expect(js.headers['content-type']).toBe('text/javascript; charset=utf-8');

    const css = await rawDashboardRequest({ port, path: '/styles.css', method: 'GET' });
    expect(css.status).toBe(200);
    expect(css.headers['content-type']).toBe('text/css; charset=utf-8');

    const localhostHost = await rawDashboardRequest({
      port,
      path: '/api/v1/dashboard',
      method: 'GET',
      host: `localhost:${String(port)}`,
    });
    expect(localhostHost.status).toBe(200);

    const badHost = await rawDashboardRequest({
      port,
      path: '/api/v1/dashboard',
      method: 'GET',
      host: 'evil.example:80',
    });
    expect(badHost.status).toBe(400);
    expect(badHost.body).not.toMatch(/at Object|Error:|\\src\\/);

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE']) {
      const rejected = await rawDashboardRequest({ port, path: '/api/v1/dashboard', method });
      expect(rejected.status).toBe(405);
      expect(rejected.headers.allow).toBe('GET, HEAD');
    }
    const connect = await rawConnectMethod(port);
    expect(connect.status).toBe(405);
    expect(connect.body).toContain('Method not allowed');

    const traversal = await rawDashboardRequest({ port, path: '/../package.json', method: 'GET' });
    expect(traversal.status).toBe(404);
    const encoded = await rawDashboardRequest({
      port,
      path: '/%2e%2e/package.json',
      method: 'GET',
    });
    expect(encoded.status).toBe(404);
    const unknown = await rawDashboardRequest({ port, path: '/index.html', method: 'GET' });
    expect(unknown.status).toBe(404);
  });

  it('returns JSON APIs without secrets and leaves row counts unchanged', async () => {
    const path = dashboardTempDbPath();
    const repository = openDashboardWriteRepo(path);
    const before = repository.getStats();
    repository.close();
    const { port } = await startTestDashboard({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: path,
    });

    for (const apiPath of API_PATHS) {
      const response = await rawDashboardRequest({ port, path: apiPath, method: 'GET' });
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
      expectSecurityHeaders(response.headers);
      expect(response.body).not.toContain('SOLANA_RPC_URL');
      expect(response.body).not.toContain('process.env');
      expect(response.body).not.toMatch(/https:\/\/api\.mainnet-beta\.solana\.com/);
      const parsed = JSON.parse(response.body) as { safety?: { tradingCapability?: string } };
      expect(parsed.safety?.tradingCapability).toBe('DISABLED');
    }

    const afterRepo = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    afterRepo.initialize();
    const after = afterRepo.getStats();
    afterRepo.close();
    expect(after).toEqual(before);
  });
});

describe('actual local database smoke', () => {
  it('reads the live local database without changing counts when present', async () => {
    const localPath = join(process.cwd(), 'data', 'soltradingbot.sqlite');
    if (!existsSync(localPath)) {
      return;
    }
    const beforeRepo = createSqlitePersistenceRepository({ path: localPath, busyTimeoutMs: 1000 });
    beforeRepo.initialize();
    const before = beforeRepo.getStats();
    beforeRepo.close();

    const { port, server } = await startTestDashboard({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: localPath,
    });
    expect(server.address().address).toBe('127.0.0.1');
    for (const apiPath of ['/', ...API_PATHS]) {
      const response = await rawDashboardRequest({ port, path: apiPath, method: 'GET' });
      expect(response.status).toBe(200);
      expectSecurityHeaders(response.headers);
      expect(response.body).not.toContain('SOLANA_RPC_URL');
      const head = await rawDashboardRequest({ port, path: apiPath, method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(head.body).toBe('');
    }
    const health = await rawDashboardRequest({ port, path: '/api/v1/database-health', method: 'GET' });
    expect(health.body).toContain('integrityCheck');
    const badHost = await rawDashboardRequest({
      port,
      path: '/api/v1/dashboard',
      method: 'GET',
      host: 'evil.example:80',
    });
    expect(badHost.status).toBe(400);
    const post = await rawDashboardRequest({ port, path: '/api/v1/dashboard', method: 'POST' });
    expect(post.status).toBe(405);
    const traversal = await rawDashboardRequest({ port, path: '/../package.json', method: 'GET' });
    expect(traversal.status).toBe(404);
    await server.close();

    const afterRepo = createSqlitePersistenceRepository({ path: localPath, busyTimeoutMs: 1000 });
    afterRepo.initialize();
    const after = afterRepo.getStats();
    afterRepo.close();
    expect(after.schemaVersion).toBe(8);
    expect(after.tokenCount).toBe(before.tokenCount);
    expect(after.marketSnapshotCount).toBe(before.marketSnapshotCount);
    expect(after.riskScanCount).toBe(before.riskScanCount);
    expect(after.featureVectorCount).toBe(before.featureVectorCount);
    expect(after.strategyEvaluationCount).toBe(before.strategyEvaluationCount);
    expect(after.paperEvaluationCount).toBe(before.paperEvaluationCount);
    expect(after.positionEvaluationCount).toBe(before.positionEvaluationCount);
    expect(after.paperPositionCount).toBe(before.paperPositionCount);
    expect(after.openPaperPositionCount).toBe(before.openPaperPositionCount);
    expect(after.exitEvaluationCount).toBe(before.exitEvaluationCount);
    expect(after.paperPositionExitCount).toBe(before.paperPositionExitCount);
  });
});
