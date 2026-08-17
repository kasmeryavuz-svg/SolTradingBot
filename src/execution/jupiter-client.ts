import {
  JUPITER_API_KEY_HEADER,
  JUPITER_BUILD_URL,
  JUPITER_HTTP_METHOD,
  JUPITER_MAX_RESPONSE_BYTES,
  JUPITER_PROVIDER_HOST,
  JUPITER_REDIRECT_POLICY,
} from './constants.js';
import { ExecutionError } from './errors.js';
import { sanitizeExecutionText } from './sanitize.js';
import type { ExecutionFetchLike, JupiterBuildRequest, JupiterClient } from './types.js';

export function normalizeOptionalApiKey(apiKey: string | undefined): string | undefined {
  if (apiKey === undefined) {
    return undefined;
  }
  const trimmed = apiKey.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function isJsonMediaType(contentType: string | null): boolean {
  if (contentType === null) {
    return false;
  }
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType === 'application/json';
}

export function createJupiterBuildClient(options: {
  timeoutMs: number;
  apiKey?: string;
  fetchImpl?: ExecutionFetchLike;
}): JupiterClient {
  const fetchImpl = options.fetchImpl ?? productionFetch;
  const apiKey = normalizeOptionalApiKey(options.apiKey);
  const secrets = apiKey === undefined ? [] : [apiKey];

  return {
    async build(request: JupiterBuildRequest): Promise<unknown> {
      const url = buildJupiterUrl(request);
      assertProviderUrl(url);
      const headers: Record<string, string> = { accept: 'application/json' };
      if (apiKey !== undefined) {
        headers[JUPITER_API_KEY_HEADER] = apiKey;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, options.timeoutMs);

      let response: Awaited<ReturnType<ExecutionFetchLike>>;
      try {
        response = await fetchImpl(url, {
          method: JUPITER_HTTP_METHOD,
          headers,
          signal: controller.signal,
          redirect: JUPITER_REDIRECT_POLICY,
        });
      } catch (error: unknown) {
        throw mapJupiterTransportError(error, options.timeoutMs, secrets);
      } finally {
        clearTimeout(timer);
      }

      if (response.status >= 300 && response.status < 400) {
        throw new ExecutionError('Jupiter provider redirect was refused. e14 does not follow redirects.', {
          code: 'provider_invalid_response',
        });
      }

      if (
        response.status >= 200 &&
        response.status < 300 &&
        !isJsonMediaType(response.headers.get('content-type'))
      ) {
        throw new ExecutionError(
          'Jupiter /build 2xx response did not use an application/json Content-Type. The body was not parsed.',
          { code: 'provider_invalid_response' },
        );
      }

      const body = await readBoundedBody(response, JUPITER_MAX_RESPONSE_BYTES, secrets);
      if (response.status === 429) {
        throw new ExecutionError('Jupiter rate-limited the request.', { code: 'provider_rate_limited' });
      }
      if (response.status === 401 || response.status === 403) {
        throw new ExecutionError('Jupiter rejected the request authentication.', {
          code: 'provider_auth_failed',
        });
      }
      if (response.status >= 500) {
        throw new ExecutionError('Jupiter provider is unavailable.', { code: 'provider_unavailable' });
      }
      if (response.status === 404) {
        throw new ExecutionError('Jupiter /build route was not found.', { code: 'provider_unavailable' });
      }
      if (response.status !== 200) {
        throw mapJupiterHttpError(response.status, body, secrets);
      }

      try {
        return JSON.parse(body) as unknown;
      } catch {
        throw new ExecutionError('Jupiter returned a non-JSON /build body.', {
          code: 'provider_invalid_response',
        });
      }
    },
  };
}

export function buildJupiterUrl(request: JupiterBuildRequest): string {
  const params = new URLSearchParams({
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    amount: request.amount,
    taker: request.taker,
    slippageBps: request.slippageBps,
    maxAccounts: request.maxAccounts,
    blockhashSlotsToExpiry: request.blockhashSlotsToExpiry,
    computeUnitPricePercentile: request.computeUnitPricePercentile,
    forJitoBundle: request.forJitoBundle,
  });
  return `${JUPITER_BUILD_URL}?${params.toString()}`;
}

function assertProviderUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== JUPITER_PROVIDER_HOST || parsed.pathname !== '/swap/v2/build') {
    throw new ExecutionError('Refusing a Jupiter request that is not the code-defined /swap/v2/build URL.', {
      code: 'provider_invalid_response',
    });
  }
}

async function productionFetch(
  input: string,
  init: {
    method: 'GET';
    headers: Record<string, string>;
    signal: AbortSignal;
    redirect: 'error';
  },
): ReturnType<ExecutionFetchLike> {
  return fetch(input, init);
}

async function readBoundedBody(
  response: Awaited<ReturnType<ExecutionFetchLike>>,
  maxBytes: number,
  secrets: readonly string[],
): Promise<string> {
  const declared = response.headers.get('content-length');
  if (declared !== null && declared !== '') {
    if (!/^\d+$/.test(declared) || BigInt(declared) > BigInt(maxBytes)) {
      throw new ExecutionError('Jupiter /build response exceeded the 2 MiB size cap.', {
        code: 'provider_invalid_response',
      });
    }
  }

  const reader = response.body?.getReader();
  if (reader !== undefined) {
    return readStreamingBody(reader, maxBytes, secrets);
  }

  if (declared === null || declared === '' || response.arrayBuffer === undefined) {
    throw new ExecutionError(
      'Jupiter /build body reader was unavailable and no trusted Content-Length was present. e14 refuses an unbounded fallback.',
      { code: 'provider_invalid_response' },
    );
  }

  let bytes: Uint8Array;
  try {
    const raw = await response.arrayBuffer();
    bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  } catch (error: unknown) {
    throw mapJupiterTransportError(error, 0, secrets);
  }
  if (bytes.byteLength > maxBytes) {
    throw new ExecutionError('Jupiter /build response exceeded the 2 MiB size cap.', {
      code: 'provider_invalid_response',
    });
  }
  return new TextDecoder().decode(bytes);
}

async function readStreamingBody(
  reader: { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> | void },
  maxBytes: number,
  secrets: readonly string[],
): Promise<string> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      const chunk = result.value === undefined ? new Uint8Array() : result.value;
      total += chunk.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ExecutionError('Jupiter /build response exceeded the 2 MiB size cap.', {
          code: 'provider_invalid_response',
        });
      }
      chunks.push(chunk);
    }
  } catch (error: unknown) {
    if (error instanceof ExecutionError) {
      throw error;
    }
    throw mapJupiterTransportError(error, 0, secrets);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function mapJupiterTransportError(
  error: unknown,
  timeoutMs: number,
  secrets: readonly string[],
): ExecutionError {
  if (error instanceof ExecutionError) {
    return error;
  }
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return new ExecutionError(
      timeoutMs > 0
        ? `Jupiter /build timed out after ${String(timeoutMs)}ms.`
        : 'Jupiter /build timed out.',
      { code: 'provider_unavailable', cause: error },
    );
  }
  const raw = error instanceof Error ? error.message : 'Jupiter provider is unavailable.';
  const message = sanitizeExecutionText(raw, secrets);
  if (/redirect/i.test(message)) {
    return new ExecutionError('Jupiter provider redirect was refused. e14 does not follow redirects.', {
      code: 'provider_invalid_response',
      cause: error,
    });
  }
  return new ExecutionError('Jupiter provider is unavailable.', {
    code: 'provider_unavailable',
    cause: error,
  });
}

function mapJupiterHttpError(status: number, body: string, secrets: readonly string[]): ExecutionError {
  const sanitized = sanitizeExecutionText(body.slice(0, 200), secrets);
  if (/no route|not found|unable to find/i.test(sanitized)) {
    return new ExecutionError('Jupiter found no route for the requested ExactIn swap.', {
      code: 'provider_no_route',
    });
  }
  return new ExecutionError(`Jupiter /build failed with HTTP ${String(status)}.`, {
    code: 'provider_invalid_response',
  });
}
