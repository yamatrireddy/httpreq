import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppError,
  type AppErrorCode,
  type HttpRequest,
  type HttpResponse,
  type HttpRuntime,
} from '@httpreq/shared';

export type ExecutionOutcome =
  | { kind: 'success' }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string; code?: AppErrorCode };

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError';

/**
 * Runs requests through the runtime with one AbortController per request tab, so tabs can send
 * concurrently and cancelling one tab never affects another.
 */
export function useRequestExecution(
  runtime: HttpRuntime,
  onResponse: (requestId: string, response: HttpResponse) => void,
) {
  const controllers = useRef(new Map<string, AbortController>());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());

  const setSending = useCallback((requestId: string, sending: boolean) => {
    setPending((previous) => {
      const next = new Set(previous);
      if (sending) next.add(requestId);
      else next.delete(requestId);
      return next;
    });
  }, []);

  const send = useCallback(
    async (request: HttpRequest): Promise<ExecutionOutcome> => {
      controllers.current.get(request.id)?.abort();
      const controller = new AbortController();
      controllers.current.set(request.id, controller);
      setSending(request.id, true);
      try {
        const response = await runtime.execute(request, controller.signal);
        onResponse(request.id, response);
        return { kind: 'success' };
      } catch (error) {
        if (isAbortError(error)) return { kind: 'cancelled' };
        return error instanceof AppError
          ? { kind: 'failed', message: error.message, code: error.code }
          : { kind: 'failed', message: 'An unexpected error occurred.' };
      } finally {
        // A newer send for the same tab owns the entry once it has replaced this controller.
        if (controllers.current.get(request.id) === controller) {
          controllers.current.delete(request.id);
          setSending(request.id, false);
        }
      }
    },
    [runtime, onResponse, setSending],
  );

  const cancel = useCallback((requestId: string) => {
    controllers.current.get(requestId)?.abort();
  }, []);

  const isSending = useCallback((requestId: string) => pending.has(requestId), [pending]);

  useEffect(() => {
    const active = controllers.current;
    return () => active.forEach((controller) => controller.abort());
  }, []);

  return { send, cancel, isSending };
}
