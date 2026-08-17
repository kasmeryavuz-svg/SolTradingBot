import type { ServerResponse } from 'node:http';
import { serializeDashboardJson } from './json.js';
import { DASHBOARD_SECURITY_HEADERS } from './security.js';

export function applyDashboardSecurityHeaders(response: ServerResponse): void {
  for (const [name, value] of Object.entries(DASHBOARD_SECURITY_HEADERS)) {
    response.setHeader(name, value);
  }
}

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  method: string,
): void {
  const payload = serializeDashboardJson(body);
  applyDashboardSecurityHeaders(response);
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Content-Length', Buffer.byteLength(payload));
  if (method === 'HEAD') {
    response.end();
    return;
  }
  response.end(payload);
}

export function sendBuffer(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: Buffer,
  method: string,
): void {
  applyDashboardSecurityHeaders(response);
  response.statusCode = status;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Length', body.byteLength);
  if (method === 'HEAD') {
    response.end();
    return;
  }
  response.end(body);
}

export function sendMethodNotAllowed(response: ServerResponse, method: string): void {
  response.setHeader('Allow', 'GET, HEAD');
  sendJson(
    response,
    405,
    { error: { code: 'method_not_allowed', message: 'Method not allowed.' } },
    method,
  );
}

export function sendBadRequest(response: ServerResponse, method: string, message: string): void {
  sendJson(response, 400, { error: { code: 'bad_request', message } }, method);
}

export function sendNotFound(response: ServerResponse, method: string): void {
  sendJson(response, 404, { error: { code: 'not_found', message: 'Not found.' } }, method);
}
