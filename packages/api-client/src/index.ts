import type { AuthConfig, HttpRequest, HttpResponse, HttpRuntime } from '@httpreq/shared';
import { AppError } from '@httpreq/shared';

export interface PreparedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

const encodeBasic = (username: string, password: string): string => {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary);
};

const applyAuth = (auth: AuthConfig, url: URL, headers: Record<string, string>) => {
  if (auth.type === 'basic')
    headers.Authorization = `Basic ${encodeBasic(auth.username, auth.password)}`;
  if (auth.type === 'bearer') headers.Authorization = `Bearer ${auth.token}`;
  if (auth.type === 'api-key') {
    if (auth.location === 'header') headers[auth.key] = auth.value;
    else url.searchParams.set(auth.key, auth.value);
  }
};

export const prepareRequest = (request: HttpRequest): PreparedRequest => {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch (cause) {
    throw new AppError('INVALID_REQUEST', 'Enter a valid absolute URL.', { cause });
  }

  request.params
    .filter((item) => item.enabled && item.key)
    .forEach((item) => url.searchParams.set(item.key, item.value));
  const headers = Object.fromEntries(
    request.headers
      .filter((item) => item.enabled && item.key)
      .map((item) => [item.key, item.value]),
  );
  applyAuth(request.auth, url, headers);

  let body: string | undefined;
  if (request.body.type === 'json' && request.method !== 'GET') {
    try {
      JSON.parse(request.body.content || '{}');
    } catch (cause) {
      throw new AppError('INVALID_REQUEST', 'Request body is not valid JSON.', { cause });
    }
    body = request.body.content || '{}';
    if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
  }
  return { url: url.toString(), method: request.method, headers, body };
};

export const toHttpResponse = async (
  response: Response,
  startedAt: number,
): Promise<HttpResponse> => {
  const body = await response.text();
  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body,
    contentType: response.headers.get('content-type') ?? 'text/plain',
    durationMs: Math.round(performance.now() - startedAt),
    sizeBytes: new Blob([body]).size,
  };
};

export class BrowserHttpRuntime implements HttpRuntime {
  readonly kind = 'browser' as const;

  async execute(request: HttpRequest, signal?: AbortSignal): Promise<HttpResponse> {
    const prepared = prepareRequest(request);
    const startedAt = performance.now();
    try {
      const response = await fetch(prepared.url, { ...prepared, signal });
      return await toHttpResponse(response, startedAt);
    } catch (cause) {
      if (
        cause instanceof AppError ||
        (cause instanceof DOMException && cause.name === 'AbortError')
      )
        throw cause;
      throw new AppError(
        'NETWORK_ERROR',
        'The request could not be completed. Check the URL, network, and CORS policy.',
        { cause },
      );
    }
  }
}

declare global {
  interface Window {
    httpreq?: { executeHttp(request: HttpRequest): Promise<HttpResponse> };
  }
}

export class ElectronHttpRuntime implements HttpRuntime {
  readonly kind = 'electron' as const;

  execute(request: HttpRequest): Promise<HttpResponse> {
    if (!window.httpreq) throw new AppError('NETWORK_ERROR', 'Electron bridge is unavailable.');
    return window.httpreq.executeHttp(request);
  }
}
