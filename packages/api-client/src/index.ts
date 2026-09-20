import type { HttpReqBridge, HttpResponse, HttpRuntime, PreparedRequest } from '@httpreq/shared';
import { AppError, createId } from '@httpreq/shared';
import { readResponse, toFetchInit } from './transport';

export * from './auth/basic';
export * from './auth/digest';
export * from './auth/jwt';
export * from './auth/oauth2';
export * from './auth/registry';
export * from './auth/types';
export * from './curl';
export * from './pipeline';
export * from './transport';
export * from './variables';
export * from './websocket';

export class BrowserHttpRuntime implements HttpRuntime {
  readonly kind = 'browser' as const;

  async execute(request: PreparedRequest, signal?: AbortSignal): Promise<HttpResponse> {
    const startedAt = performance.now();
    try {
      const response = await fetch(request.url, toFetchInit(request, signal));
      return await readResponse(response, startedAt, request.options.maxResponseBytes);
    } catch (cause) {
      if (
        cause instanceof AppError ||
        (cause instanceof DOMException &&
          (cause.name === 'AbortError' || cause.name === 'TimeoutError'))
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
    httpreq?: HttpReqBridge;
  }
}

const abortError = () => new DOMException('The request was cancelled.', 'AbortError');

export class ElectronHttpRuntime implements HttpRuntime {
  readonly kind = 'electron' as const;

  execute(request: PreparedRequest, signal?: AbortSignal): Promise<HttpResponse> {
    const bridge = window.httpreq;
    if (!bridge) {
      return Promise.reject(new AppError('NETWORK_ERROR', 'Electron bridge is unavailable.'));
    }
    if (signal?.aborted) return Promise.reject(abortError());

    const executionId = createId();
    return new Promise<HttpResponse>((resolve, reject) => {
      // Reject immediately on abort; the main process cancels its native request in parallel.
      const onAbort = () => {
        bridge.cancelHttp(executionId);
        reject(abortError());
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      bridge
        .executeHttp(request, executionId)
        .then(
          (result) =>
            result.ok
              ? resolve(result.value)
              : reject(new AppError(result.error.code, result.error.message)),
          (cause: unknown) =>
            reject(
              new AppError('NETWORK_ERROR', 'The desktop bridge could not execute the request.', {
                cause,
              }),
            ),
        )
        .finally(() => signal?.removeEventListener('abort', onAbort));
    });
  }
}
