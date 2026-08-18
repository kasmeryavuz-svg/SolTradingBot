import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config/index.js';
import {
  DASHBOARD_TRADING_ENABLED_REFUSAL,
  DashboardError,
  DashboardService,
  SqliteDashboardDataSource,
  buildClosedTradeCumulativeGrossPnl,
  isAllowedDashboardHost,
  mapResearchData,
  prepareDashboardCommand,
  resolveDashboardRoute,
  serializeDashboardJson,
  startDashboardServer,
} from '../src/dashboard/index.js';
import { executePerformanceReport } from '../src/performance/command.js';
import { SqlitePerformanceDataSource } from '../src/performance/sqlite-source.js';
import { executeResearchCompare } from '../src/research/command.js';
import { SqliteResearchDataSource } from '../src/research/sqlite-source.js';
import { RESEARCH_CANDIDATE_IDS } from '../src/research/types.js';
import { openSqliteDatabase } from '../src/persistence/sqlite/index.js';
import { SqlitePersistenceRepository } from '../src/persistence/index.js';
import { allEntrySnapshot } from './research-fixtures.js';
import { addMs } from './performance-fixtures.js';
import {
  cleanupDashboardHarness,
  dashboardTempDbPath,
  FIXED_CLOCK,
  getFreeLoopbackPort,
  openDashboardWriteRepo,
  rawDashboardHttp,
  rawDashboardRequest,
  startTestDashboard,
} from './dashboard-harness.js';

afterEach(async () => {
  await cleanupDashboardHarness();
  vi.restoreAllMocks();
});

describe('dashboard hostile routing and host policy', () => {
  it('parses Host by exact hostname/port equality', () => {
    expect(isAllowedDashboardHost('127.0.0.1:4313', 4313)).toBe(true);
    expect(isAllowedDashboardHost('localhost:4313', 4313)).toBe(true);
    expect(isAllowedDashboardHost('LOCALHOST:4313', 4313)).toBe(true);
    expect(isAllowedDashboardHost('LocalHost:4313', 4313)).toBe(true);
    expect(isAllowedDashboardHost('evil.com:4313', 4313)).toBe(false);
    expect(isAllowedDashboardHost('localhost.evil.com:4313', 4313)).toBe(false);
    expect(isAllowedDashboardHost('127.0.0.1.evil.com:4313', 4313)).toBe(false);
    expect(isAllowedDashboardHost('localhost:4314', 4313)).toBe(false);
    expect(isAllowedDashboardHost('127.0.0.1:4314', 4313)).toBe(false);
    expect(isAllowedDashboardHost('localhost', 4313)).toBe(false);
    expect(isAllowedDashboardHost('127.0.0.1', 4313)).toBe(false);
    expect(isAllowedDashboardHost('localhost.:4313', 4313)).toBe(false);
    expect(isAllowedDashboardHost('[::1]:4313', 4313)).toBe(false);
    expect(isAllowedDashboardHost('0.0.0.0:4313', 4313)).toBe(false);
    expect(isAllowedDashboardHost('', 4313)).toBe(false);
    expect(isAllowedDashboardHost(' 127.0.0.1:4313', 4313)).toBe(false);
    expect(isAllowedDashboardHost('127.0.0.1:4313 ', 4313)).toBe(false);
    expect(isAllowedDashboardHost(['127.0.0.1:4313', 'evil.com:80'], 4313)).toBe(false);
    expect(isAllowedDashboardHost(undefined, 4313)).toBe(false);
  });

  it('rejects absolute-form targets and unexpected query strings', () => {
    expect(resolveDashboardRoute('http://evil.example/api/v1/dashboard')).toEqual({
      kind: 'bad_path',
      reason: 'absolute_form',
    });
    expect(resolveDashboardRoute('https://evil.example/api/v1/dashboard')).toEqual({
      kind: 'bad_path',
      reason: 'absolute_form',
    });
    expect(resolveDashboardRoute('//evil.example/api/v1/dashboard')).toEqual({
      kind: 'bad_path',
      reason: 'absolute_form',
    });
    expect(resolveDashboardRoute('/api/v1/research?best=true')).toEqual({
      kind: 'bad_path',
      reason: 'query',
    });
    expect(resolveDashboardRoute('/api/v1/market?limit=999999')).toEqual({
      kind: 'bad_path',
      reason: 'query',
    });
    expect(resolveDashboardRoute('/?next=https://evil')).toEqual({
      kind: 'bad_path',
      reason: 'query',
    });
    expect(resolveDashboardRoute('/api/v1/dashboard?token=x')).toEqual({
      kind: 'bad_path',
      reason: 'query',
    });
    expect(resolveDashboardRoute('/styles.css?../../')).toEqual({
      kind: 'bad_path',
      reason: 'query',
    });
    expect(resolveDashboardRoute('/api/v1/dashboard')).toEqual({
      kind: 'api',
      name: '/api/v1/dashboard',
    });
  });
});

describe('dashboard hostile HTTP behavior', () => {
  it('rejects absolute-form, query strings, bad hosts, and keeps HEAD empty', async () => {
    const path = dashboardTempDbPath();
    openDashboardWriteRepo(path).close();
    const { port } = await startTestDashboard({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: path,
    });

    const absolute = await rawDashboardRequest({
      port,
      path: 'http://evil.example/api/v1/dashboard',
      method: 'GET',
    });
    expect(absolute.status).toBe(400);
    expect(absolute.body).toContain('Absolute-form request targets are not allowed.');

    for (const queryPath of [
      '/api/v1/dashboard?token=x',
      '/api/v1/research?best=true',
      '/api/v1/research?start=1',
      '/api/v1/research?end=2',
      '/api/v1/research?pair=x',
      '/api/v1/research?candidate=s07_baseline',
      '/api/v1/research?sort=pnl',
      '/api/v1/research?rank=1',
      '/api/v1/research?threshold=1',
      '/api/v1/market?limit=999999',
      '/api/v1/research?winner=true',
      '/?next=https://evil',
    ]) {
      const rejected = await rawDashboardRequest({ port, path: queryPath, method: 'GET' });
      expect(rejected.status).toBe(400);
      expect(rejected.body).toContain('Unexpected query parameters.');
    }

    const withBody = await rawDashboardRequest({
      port,
      path: '/api/v1/dashboard',
      method: 'GET',
      body: '{"token":"x"}',
    });
    expect(withBody.status).toBe(200);

    const head = await rawDashboardRequest({ port, path: '/api/v1/dashboard', method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    expect(head.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(head.headers['x-content-type-options']).toBe('nosniff');

    const unknownHead = await rawDashboardRequest({ port, path: '/nope', method: 'HEAD' });
    expect(unknownHead.status).toBe(404);
    expect(unknownHead.body).toBe('');

    const post = await rawDashboardRequest({ port, path: '/api/v1/dashboard', method: 'POST' });
    expect(post.status).toBe(405);
    expect(post.headers.allow).toBe('GET, HEAD');
    expect(post.headers['content-security-policy']).toBeTruthy();

    const hostCases = [
      'evil.com:80',
      `localhost.evil.com:${String(port)}`,
      `127.0.0.1.evil.com:${String(port)}`,
      'localhost:9',
      '127.0.0.1:9',
      'localhost',
      '127.0.0.1',
      `localhost.:${String(port)}`,
      `[::1]:${String(port)}`,
      `0.0.0.0:${String(port)}`,
    ];
    for (const host of hostCases) {
      const rejected = await rawDashboardHttp({
        port,
        requestTarget: '/api/v1/dashboard',
        headerLines: [`Host: ${host}`],
      });
      expect(rejected.status, host).toBe(400);
    }
    const missingHost = await rawDashboardHttp({
      port,
      requestTarget: '/api/v1/dashboard',
      headerLines: ['Connection: close'],
    });
    expect(missingHost.status).toBe(400);

    const traversalPaths = [
      '/../package.json',
      '/%2e%2e/package.json',
      '/%2e%2e%2fpackage.json',
      '/..%2f..%2f.env',
      '/app.js/../../README.md',
    ];
    for (const traversalPath of traversalPaths) {
      const response = await rawDashboardRequest({ port, path: traversalPath, method: 'GET' });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body).not.toContain('"name": "meme-trading-bot"');
    }
  });

  it('does not create a missing database file or parent directory', async () => {
    const parent = join(tmpdir(), `mtb-dashboard-missing-${String(Date.now())}`);
    const nested = join(parent, 'nested');
    const dbPath = join(nested, 'history.sqlite');
    expect(existsSync(parent)).toBe(false);
    const { port } = await startTestDashboard({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: dbPath,
    });
    for (const apiPath of [
      '/',
      '/app.js',
      '/styles.css',
      '/api/v1/dashboard',
      '/api/v1/performance',
      '/api/v1/research',
      '/api/v1/market',
      '/api/v1/runtime-paper',
      '/api/v1/database-health',
    ]) {
      const response = await rawDashboardRequest({ port, path: apiPath, method: 'GET' });
      expect(response.status).toBe(200);
    }
    expect(existsSync(dbPath)).toBe(false);
    expect(existsSync(nested)).toBe(false);
    expect(existsSync(parent)).toBe(false);
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);
  });

  it('isolates integrity pragmas to the health route and skips upstream verifyIntegrity', async () => {
    const path = dashboardTempDbPath();
    openDashboardWriteRepo(path).close();
    const performanceIntegrity = vi.spyOn(SqlitePerformanceDataSource.prototype, 'verifyIntegrity');
    const researchIntegrity = vi.spyOn(SqliteResearchDataSource.prototype, 'verifyIntegrity');
    const dashboardHealth = vi.spyOn(SqliteDashboardDataSource.prototype, 'runDatabaseHealth');
    const initialize = vi.spyOn(SqlitePersistenceRepository.prototype, 'initialize');
    const recordMarket = vi.spyOn(SqlitePersistenceRepository.prototype, 'recordMarketSnapshots');

    const { port } = await startTestDashboard({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: path,
    });

    await rawDashboardRequest({ port, path: '/api/v1/dashboard', method: 'GET' });
    await rawDashboardRequest({ port, path: '/api/v1/performance', method: 'GET' });
    await rawDashboardRequest({ port, path: '/api/v1/research', method: 'GET' });
    expect(performanceIntegrity).not.toHaveBeenCalled();
    expect(researchIntegrity).not.toHaveBeenCalled();
    expect(dashboardHealth).not.toHaveBeenCalled();
    expect(recordMarket).not.toHaveBeenCalled();

    await rawDashboardRequest({ port, path: '/api/v1/database-health', method: 'GET' });
    expect(dashboardHealth).toHaveBeenCalledTimes(1);
    expect(performanceIntegrity).not.toHaveBeenCalled();
    expect(researchIntegrity).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
  });

  it('binds 127.0.0.1 even when DASHBOARD_HOST is spoofed and refuses a busy port cleanly', async () => {
    const { port, server } = await startTestDashboard({
      DATABASE_ENABLED: 'false',
      DASHBOARD_HOST: '0.0.0.0',
    });
    expect(server.address().address).toBe('127.0.0.1');
    await expect(
      startDashboardServer({
        TRADING_ENABLED: 'false',
        DATABASE_ENABLED: 'false',
        DASHBOARD_PORT: String(port),
      }),
    ).rejects.toThrow(DashboardError);
    await expect(
      startDashboardServer({
        TRADING_ENABLED: 'false',
        DATABASE_ENABLED: 'false',
        DASHBOARD_PORT: String(port),
      }),
    ).rejects.toThrow('Dashboard port is already in use.');
    const stillUp = await rawDashboardRequest({ port, path: '/', method: 'GET' });
    expect(stillUp.status).toBe(200);
  });

  it('does not open a listener when TRADING_ENABLED=true', async () => {
    const port = await getFreeLoopbackPort();
    expect(() => prepareDashboardCommand({ TRADING_ENABLED: 'true', DASHBOARD_PORT: String(port) })).toThrow(
      DashboardError,
    );
    expect(() => prepareDashboardCommand({ TRADING_ENABLED: 'true', DASHBOARD_PORT: String(port) })).toThrow(
      DASHBOARD_TRADING_ENABLED_REFUSAL,
    );
    expect(() => prepareDashboardCommand({ TRADING_ENABLED: 'true', DASHBOARD_PORT: String(port) })).not.toThrow(
      /Checkpoint 00/,
    );
    await expect(
      startDashboardServer({ TRADING_ENABLED: 'true', DASHBOARD_PORT: String(port) }),
    ).rejects.toThrow(DASHBOARD_TRADING_ENABLED_REFUSAL);
    await expect(rawDashboardRequest({ port, path: '/', method: 'GET' })).rejects.toThrow();
  });
});

describe('dashboard hostile data semantics', () => {
  it('keeps research in canonical candidate order even when metrics favor later candidates', () => {
    const path = dashboardTempDbPath();
    openDashboardWriteRepo(path).close();
    const config = loadConfig({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: path,
      TRADING_ENABLED: 'false',
    });
    const compare = executeResearchCompare(config);
    const shuffled = {
      ...compare,
      candidates: [...compare.candidates].reverse(),
    };
    const mapped = mapResearchData(shuffled);
    expect(mapped.candidates.map((row) => row.candidateId)).toEqual([...RESEARCH_CANDIDATE_IDS]);
    expect(mapped.ranking).toBe(false);
  });

  it('builds closed-trade cumulative GROSS PnL as 10, 6, 9', () => {
    expect(
      buildClosedTradeCumulativeGrossPnl([
        { exitedAt: '2026-08-17T10:01:00.000Z', grossPnlUsd: 10 },
        { exitedAt: '2026-08-17T10:02:00.000Z', grossPnlUsd: -4 },
        { exitedAt: '2026-08-17T10:03:00.000Z', grossPnlUsd: 3 },
      ]).map((point) => point.cumulativeGrossPnlUsd),
    ).toEqual([10, 6, 9]);
  });

  it('rejects nested non-finite JSON before stringify', () => {
    expect(() => serializeDashboardJson({ a: [{ b: Number.NaN }] })).toThrow(DashboardError);
    expect(() => serializeDashboardJson({ a: { b: [Number.POSITIVE_INFINITY] } })).toThrow(DashboardError);
    expect(() => serializeDashboardJson({ a: { b: Number.NEGATIVE_INFINITY } })).toThrow(DashboardError);
  });

  it('limits markets to 25 without changing coverage counts or upstream reports', () => {
    const path = dashboardTempDbPath();
    const repository = openDashboardWriteRepo(path);
    const snapshots = Array.from({ length: 26 }, (_, index) =>
      allEntrySnapshot({
        collectedAt: addMs('2026-08-17T11:00:00.000Z', index * 1000),
        tokenSymbol: `T${String(index)}`,
      }),
    );
    const inserted = repository.recordMarketSnapshots(snapshots);
    expect(inserted).toBe(26);
    repository.close();
    const config = loadConfig({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: path,
      TRADING_ENABLED: 'false',
    });
    const snapshot = new DashboardService(config, FIXED_CLOCK).buildSnapshot();
    expect(snapshot.market.data?.rows).toHaveLength(25);
    expect(snapshot.database.data?.counts?.marketSnapshots).toBe(26);
    expect(executePerformanceReport(config).dataset.performanceDefinitionFingerprint).toBe(
      snapshot.performance.data?.report.dataset.performanceDefinitionFingerprint,
    );
    expect(executeResearchCompare(config).researchDatasetFingerprint).toBe(
      snapshot.research.data?.researchDatasetFingerprint,
    );
  });

  it('marks a future schema missing a required column as incompatible without migrating', () => {
    const path = dashboardTempDbPath();
    openDashboardWriteRepo(path).close();
    const writable = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
    try {
      writable.exec(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (9, '009_future', '2026-08-17T00:00:00.000Z')",
      );
      writable.exec('ALTER TABLE market_snapshots DROP COLUMN token_name');
    } finally {
      writable.close();
    }
    const snapshot = new DashboardService(
      loadConfig({ DATABASE_ENABLED: 'true', DATABASE_PATH: path, TRADING_ENABLED: 'false' }),
      FIXED_CLOCK,
    ).buildSnapshot();
    expect(snapshot.database.data?.status).toBe('incompatible');
    expect(snapshot.database.data?.schemaVersion).toBe(9);
    expect(snapshot.performance.state).toBe('unavailable');
    const versions = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
    expect(Number(versions.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.['version'])).toBe(
      9,
    );
    versions.close();
  });
});

describe('dashboard hostile process and import constraints', () => {
  it('validates app.js syntax with node --check', () => {
    execFileSync(process.execPath, ['--check', 'src/dashboard/public/app.js'], { encoding: 'utf8' });
  });

  it('does not import command execution, child_process, or write commands', () => {
    const dashboardRoot = join(process.cwd(), 'src', 'dashboard');
    const files = listTsFiles(dashboardRoot);
    const seen = new Set<string>();
    const queue = [...files];
    while (queue.length > 0) {
      const file = queue.pop();
      if (file === undefined || seen.has(file)) {
        continue;
      }
      seen.add(file);
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/from ['"]([^'"]+)['"]/g)) {
        const spec = match[1];
        if (spec === undefined) {
          continue;
        }
        expect(spec).not.toMatch(/child_process/);
        expect(spec).not.toMatch(/paper\/(?:step|execute)/);
        expect(spec).not.toMatch(/position\/step/);
        expect(spec).not.toMatch(/exit\/(?:step|execute)/);
        expect(spec).not.toMatch(/collector\/(?:once|watch)/);
        expect(spec).not.toMatch(/market-data\/watch(?:\.js|$)/);
        expect(spec).not.toMatch(/risk\/record/);
        expect(spec).not.toMatch(/features\/record/);
        expect(spec).not.toMatch(/strategy\/record/);
        if (spec.startsWith('.')) {
          const resolved = spec.endsWith('.js')
            ? join(dirname(file), spec.replace(/\.js$/u, '.ts'))
            : join(dirname(file), `${spec}.ts`);
          if (existsSync(resolved)) {
            queue.push(resolved);
          }
        }
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('fails if dashboard HTTP handling makes a non-loopback network call', async () => {
    const path = dashboardTempDbPath();
    openDashboardWriteRepo(path).close();
    const originalHttp = http.request;
    const originalHttps = https.request;
    const originalFetch = globalThis.fetch;
    const guard = (options: unknown): void => {
      const host = hostFromRequest(options);
      if (host !== '127.0.0.1' && host !== 'localhost') {
        throw new Error(`External network call to ${host}`);
      }
    };
    vi.spyOn(http, 'request').mockImplementation((...args: unknown[]) => {
      guard(args[0]);
      return originalHttp(...(args as Parameters<typeof http.request>));
    });
    vi.spyOn(https, 'request').mockImplementation((...args: unknown[]) => {
      guard(args[0]);
      return originalHttps(...(args as Parameters<typeof https.request>));
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: Parameters<typeof fetch>[0], init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : 'request';
      if (!url.startsWith('/') && !url.includes('127.0.0.1') && !url.includes('localhost')) {
        throw new Error(`External fetch to ${url}`);
      }
      return originalFetch(input, init);
    });
    const { port } = await startTestDashboard({ DATABASE_ENABLED: 'true', DATABASE_PATH: path });
    for (const apiPath of [
      '/',
      '/api/v1/dashboard',
      '/api/v1/performance',
      '/api/v1/research',
      '/api/v1/market',
      '/api/v1/runtime-paper',
      '/api/v1/database-health',
    ]) {
      const response = await rawDashboardRequest({ port, path: apiPath, method: 'GET' });
      expect(response.status).toBe(200);
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

function hostFromRequest(options: unknown): string {
  if (typeof options === 'string') {
    return new URL(options).hostname;
  }
  if (options instanceof URL) {
    return options.hostname;
  }
  if (options && typeof options === 'object' && 'hostname' in options && typeof options.hostname === 'string') {
    return options.hostname;
  }
  if (options && typeof options === 'object' && 'host' in options && typeof options.host === 'string') {
    return options.host;
  }
  return '';
}

function listTsFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'public') {
        return [];
      }
      return listTsFiles(path);
    }
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}
