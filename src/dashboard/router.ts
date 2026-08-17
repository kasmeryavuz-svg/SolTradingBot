import type { IncomingMessage, ServerResponse } from 'node:http';
import { DASHBOARD_API_ROUTES } from './constants.js';
import {
  sendBadRequest,
  sendBuffer,
  sendJson,
  sendMethodNotAllowed,
  sendNotFound,
} from './responses.js';
import { isAllowedDashboardHost, isAllowedDashboardMethod, readRequestHost } from './security.js';
import type { DashboardService } from './service.js';
import type { DashboardSnapshot } from './types.js';

export type DashboardStaticAssets = {
  html: Buffer;
  javascript: Buffer;
  css: Buffer;
};

export type DashboardRoute =
  | { kind: 'static'; name: 'html' | 'javascript' | 'css' }
  | { kind: 'api'; name: (typeof DASHBOARD_API_ROUTES)[number] }
  | { kind: 'not_found' }
  | { kind: 'bad_path'; reason: 'absolute_form' | 'query' | 'malformed' };

const ABSOLUTE_FORM_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export function resolveDashboardRoute(rawUrl: string | undefined): DashboardRoute {
  if (rawUrl === undefined || rawUrl === '') {
    return { kind: 'not_found' };
  }

  if (isAbsoluteFormRequestTarget(rawUrl)) {
    return { kind: 'bad_path', reason: 'absolute_form' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl, 'http://127.0.0.1');
  } catch {
    return { kind: 'bad_path', reason: 'malformed' };
  }

  if (parsed.search !== '' || parsed.hash !== '' || rawUrl.includes('?') || rawUrl.includes('#')) {
    return { kind: 'bad_path', reason: 'query' };
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(parsed.pathname);
  } catch {
    return { kind: 'bad_path', reason: 'malformed' };
  }

  if (decoded.includes('\0') || decoded.includes('..') || decoded.includes('\\')) {
    return { kind: 'not_found' };
  }

  if (decoded === '/' || decoded === '/index.html') {
    return decoded === '/' ? { kind: 'static', name: 'html' } : { kind: 'not_found' };
  }
  if (decoded === '/app.js') {
    return { kind: 'static', name: 'javascript' };
  }
  if (decoded === '/styles.css') {
    return { kind: 'static', name: 'css' };
  }
  if ((DASHBOARD_API_ROUTES as readonly string[]).includes(decoded)) {
    return { kind: 'api', name: decoded as (typeof DASHBOARD_API_ROUTES)[number] };
  }

  return { kind: 'not_found' };
}

export function handleDashboardRequest(input: {
  request: IncomingMessage;
  response: ServerResponse;
  port: number;
  service: DashboardService;
  assets: DashboardStaticAssets;
}): void {
  const method = input.request.method ?? '';
  if (!isAllowedDashboardMethod(method)) {
    sendMethodNotAllowed(input.response, method);
    return;
  }

  if (!isAllowedDashboardHost(readRequestHost(input.request), input.port)) {
    sendBadRequest(input.response, method, 'Invalid Host header.');
    return;
  }

  const route = resolveDashboardRoute(input.request.url);
  if (route.kind === 'bad_path') {
    sendBadRequest(input.response, method, badPathMessage(route.reason));
    return;
  }
  if (route.kind === 'not_found') {
    sendNotFound(input.response, method);
    return;
  }
  if (route.kind === 'static') {
    if (route.name === 'html') {
      sendBuffer(input.response, 200, 'text/html; charset=utf-8', input.assets.html, method);
      return;
    }
    if (route.name === 'javascript') {
      sendBuffer(input.response, 200, 'text/javascript; charset=utf-8', input.assets.javascript, method);
      return;
    }
    sendBuffer(input.response, 200, 'text/css; charset=utf-8', input.assets.css, method);
    return;
  }

  try {
    sendJson(input.response, 200, selectApiPayload(route.name, input.service), method);
  } catch {
    sendJson(
      input.response,
      500,
      { error: { code: 'section_unavailable', message: 'Section unavailable.' } },
      method,
    );
  }
}

function isAbsoluteFormRequestTarget(rawUrl: string): boolean {
  if (rawUrl.length >= 2 && rawUrl[0] === '/' && rawUrl[1] === '/') {
    return true;
  }
  return ABSOLUTE_FORM_SCHEME.test(rawUrl);
}

function badPathMessage(reason: 'absolute_form' | 'query' | 'malformed'): string {
  if (reason === 'absolute_form') {
    return 'Absolute-form request targets are not allowed.';
  }
  if (reason === 'query') {
    return 'Unexpected query parameters.';
  }
  return 'Invalid request path.';
}

function selectApiPayload(
  route: (typeof DASHBOARD_API_ROUTES)[number],
  service: DashboardService,
): unknown {
  if (route === '/api/v1/database-health') {
    return {
      ...service.buildPresentationShell(),
      health: service.buildDatabaseHealth(),
    };
  }

  const snapshot = service.buildSnapshot();
  if (route === '/api/v1/dashboard') {
    return snapshot;
  }
  if (route === '/api/v1/performance') {
    return pick(snapshot, 'performance');
  }
  if (route === '/api/v1/research') {
    return pick(snapshot, 'research');
  }
  if (route === '/api/v1/market') {
    return pick(snapshot, 'market');
  }
  return pick(snapshot, 'runtimePaper');
}

function pick<K extends keyof DashboardSnapshot>(
  snapshot: DashboardSnapshot,
  key: K,
): Pick<DashboardSnapshot, 'meta' | 'safety' | K> {
  return {
    meta: snapshot.meta,
    safety: snapshot.safety,
    [key]: snapshot[key],
  } as Pick<DashboardSnapshot, 'meta' | 'safety' | K>;
}
