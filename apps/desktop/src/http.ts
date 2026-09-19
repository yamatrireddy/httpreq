import { performance } from 'node:perf_hooks';
import { prepareRequest, toHttpResponse } from '@httpreq/api-client';
import {
  AppError,
  serializeError,
  type HttpRequest,
  type HttpResponse,
  type IpcResult,
} from '@httpreq/shared';

export type FetchImplementation = (url: string, init: RequestInit) => Promise<Response>;

const isHttpRequest = (value: unknown): value is HttpRequest => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HttpRequest>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.url === 'string' &&
    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(candidate.method ?? '') &&
    Array.isArray(candidate.params) &&
    Array.isArray(candidate.headers)
  );
};

/**
 * Validates an untrusted renderer payload and executes it natively. Never throws: every outcome
 * is returned as an IpcResult because Electron IPC strips custom error classes and their codes.
 */
export const executeHttp = async (
  request: unknown,
  signal: AbortSignal,
  fetchImpl: FetchImplementation,
): Promise<IpcResult<HttpResponse>> => {
  try {
    if (!isHttpRequest(request)) throw new AppError('INVALID_REQUEST', 'Invalid request payload.');
    const prepared = prepareRequest(request);
    if (!['http:', 'https:'].includes(new URL(prepared.url).protocol)) {
      throw new AppError('INVALID_REQUEST', 'Only HTTP and HTTPS URLs are permitted.');
    }
    const startedAt = performance.now();
    const response = await fetchImpl(prepared.url, { ...prepared, signal });
    return { ok: true, value: await toHttpResponse(response, startedAt) };
  } catch (error) {
    return {
      ok: false,
      error: serializeError(error, {
        code: 'NETWORK_ERROR',
        message: 'The native request could not be completed.',
      }),
    };
  }
};
