import type { HttpResponse, PreparedBody, PreparedRequest } from '@httpreq/shared';

const toFetchBody = (body: PreparedBody | undefined): BodyInit | undefined => {
  if (!body) return undefined;
  if (body.kind === 'text') return body.text;
  if (body.kind === 'bytes') return body.bytes as BufferSource;
  const form = new FormData();
  for (const part of body.parts) {
    if ('bytes' in part) {
      form.append(
        part.name,
        new Blob([part.bytes as BlobPart], {
          type: part.contentType || 'application/octet-stream',
        }),
        part.fileName,
      );
    } else {
      form.append(part.name, part.value);
    }
  }
  return form;
};

/** Converts a prepared request into `fetch` options (browser `fetch` and Electron `net.fetch`). */
export const toFetchInit = (request: PreparedRequest, signal?: AbortSignal): RequestInit => ({
  method: request.method,
  headers: request.headers,
  body: toFetchBody(request.body),
  redirect: request.options.followRedirects ? 'follow' : 'manual',
  credentials: request.options.sendCookies ? 'include' : 'omit',
  signal,
});

/**
 * Reads a response, stopping at `maxBytes` (0 = unlimited) so a huge download can never exhaust
 * memory; the result is then marked as truncated.
 */
export const readResponse = async (
  response: Response,
  startedAt: number,
  maxBytes = 0,
): Promise<HttpResponse> => {
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  const reader = response.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (maxBytes > 0 && size + value.length > maxBytes) {
        chunks.push(value.subarray(0, maxBytes - size));
        size = maxBytes;
        truncated = true;
        await reader.cancel().catch(() => undefined);
        break;
      }
      chunks.push(value);
      size += value.length;
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  // A redirect that was not followed ("manual") is opaque in browsers: no status or headers.
  const opaqueRedirect = response.type === 'opaqueredirect';
  return {
    status: response.status,
    statusText: opaqueRedirect ? 'Redirect not followed' : response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: new TextDecoder().decode(bytes),
    contentType: response.headers.get('content-type') ?? 'text/plain',
    durationMs: Math.round(performance.now() - startedAt),
    sizeBytes: size,
    ...(truncated ? { truncated } : {}),
  };
};
