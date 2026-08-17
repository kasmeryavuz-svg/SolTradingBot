import type { IncomingMessage } from 'node:http';
import { DASHBOARD_BIND_HOST } from './constants.js';
import {
  DASHBOARD_CONTENT_SECURITY_POLICY,
  DASHBOARD_PERMISSIONS_POLICY,
} from './definition.js';

export const DASHBOARD_SECURITY_HEADERS = {
  'Content-Security-Policy': DASHBOARD_CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
  'Permissions-Policy': DASHBOARD_PERMISSIONS_POLICY,
} as const;

export function expectedDashboardHosts(port: number): readonly string[] {
  return [`${DASHBOARD_BIND_HOST}:${String(port)}`, `localhost:${String(port)}`];
}

export function isAllowedDashboardHost(
  hostHeader: string | string[] | undefined,
  port: number,
): boolean {
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
  if (hostname === DASHBOARD_BIND_HOST) {
    return true;
  }
  return hostname.length === 9 && hostname.toLowerCase() === 'localhost';
}

export function readRequestHost(request: IncomingMessage): string | string[] | undefined {
  return request.headers.host;
}

export function isAllowedDashboardMethod(method: string | undefined): method is 'GET' | 'HEAD' {
  return method === 'GET' || method === 'HEAD';
}
