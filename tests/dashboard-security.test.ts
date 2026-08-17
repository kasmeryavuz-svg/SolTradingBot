import { afterEach, describe, expect, it } from 'vitest';
import { DASHBOARD_SECURITY_HEADERS, isAllowedDashboardHost } from '../src/dashboard/security.js';
import { resolveDashboardRoute } from '../src/dashboard/router.js';
import { cleanupDashboardHarness } from './dashboard-harness.js';

afterEach(async () => {
  await cleanupDashboardHarness();
});

describe('dashboard security helpers', () => {
  it('accepts only loopback Host forms for the configured port', () => {
    expect(isAllowedDashboardHost('127.0.0.1:4313', 4313)).toBe(true);
    expect(isAllowedDashboardHost('localhost:4313', 4313)).toBe(true);
    expect(isAllowedDashboardHost('LOCALHOST:4313', 4313)).toBe(true);
    expect(isAllowedDashboardHost('127.0.0.1:4314', 4313)).toBe(false);
    expect(isAllowedDashboardHost('0.0.0.0:4313', 4313)).toBe(false);
    expect(isAllowedDashboardHost('[::1]:4313', 4313)).toBe(false);
    expect(isAllowedDashboardHost('localhost.:4313', 4313)).toBe(false);
    expect(isAllowedDashboardHost('localhost.evil.com:4313', 4313)).toBe(false);
    expect(isAllowedDashboardHost(undefined, 4313)).toBe(false);
  });

  it('does not enable a CORS wildcard header', () => {
    expect(Object.keys(DASHBOARD_SECURITY_HEADERS)).not.toContain('Access-Control-Allow-Origin');
  });

  it('maps only the explicit static and API allowlist', () => {
    expect(resolveDashboardRoute('/')).toEqual({ kind: 'static', name: 'html' });
    expect(resolveDashboardRoute('/app.js')).toEqual({ kind: 'static', name: 'javascript' });
    expect(resolveDashboardRoute('/styles.css')).toEqual({ kind: 'static', name: 'css' });
    expect(resolveDashboardRoute('/api/v1/dashboard')).toEqual({
      kind: 'api',
      name: '/api/v1/dashboard',
    });
    expect(resolveDashboardRoute('/api/v1/action')).toEqual({ kind: 'not_found' });
    expect(resolveDashboardRoute('/../package.json')).toEqual({ kind: 'not_found' });
    expect(resolveDashboardRoute('/%2e%2e/package.json')).toEqual({ kind: 'not_found' });
  });
});
