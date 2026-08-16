const URL_IN_TEXT = /https?:\/\/[^\s)]+/gi;

export function sanitizeRpcUrl(raw: string): string {
  try {
    const url = new URL(raw);

    if (url.username !== '') {
      url.username = 'REDACTED';
    }
    if (url.password !== '') {
      url.password = 'REDACTED';
    }

    for (const key of [...url.searchParams.keys()]) {
      url.searchParams.set(key, 'REDACTED');
    }

    url.pathname = url.pathname
      .split('/')
      .map((segment) => (looksLikeSecretPathSegment(segment) ? 'REDACTED' : segment))
      .join('/');

    return url.toString();
  } catch {
    return '[unprintable-rpc-url]';
  }
}

export function sanitizeErrorText(text: string): string {
  return text.replace(URL_IN_TEXT, (url) => sanitizeRpcUrl(url));
}

function looksLikeSecretPathSegment(segment: string): boolean {
  return segment.length >= 16 && /^[A-Za-z0-9_-]+$/.test(segment);
}
