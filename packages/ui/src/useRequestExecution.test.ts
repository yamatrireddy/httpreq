import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AppError,
  createEmptyRequest,
  type HttpRequest,
  type HttpResponse,
  type HttpRuntime,
} from '@httpreq/shared';
import { useRequestExecution } from './useRequestExecution';

const response: HttpResponse = {
  status: 200,
  statusText: 'OK',
  headers: {},
  body: '',
  contentType: 'text/plain',
  durationMs: 1,
  sizeBytes: 0,
};

/** Runtime whose requests stay pending until resolved by id, and honour abort signals. */
const createControllableRuntime = () => {
  const resolvers = new Map<string, (value: HttpResponse) => void>();
  const runtime: HttpRuntime = {
    kind: 'browser',
    execute: (request: HttpRequest, signal?: AbortSignal) =>
      new Promise((resolve, reject) => {
        resolvers.set(request.id, resolve);
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
  };
  return { runtime, resolve: (id: string) => resolvers.get(id)?.(response) };
};

describe('useRequestExecution', () => {
  it('tracks and cancels requests per tab independently', async () => {
    const { runtime, resolve } = createControllableRuntime();
    const onResponse = vi.fn();
    const { result } = renderHook(() => useRequestExecution(runtime, onResponse));
    const first = createEmptyRequest();
    const second = createEmptyRequest();

    let firstOutcome!: ReturnType<typeof result.current.send>;
    let secondOutcome!: ReturnType<typeof result.current.send>;
    act(() => {
      firstOutcome = result.current.send(first);
      secondOutcome = result.current.send(second);
    });
    expect(result.current.isSending(first.id)).toBe(true);
    expect(result.current.isSending(second.id)).toBe(true);

    await act(async () => {
      result.current.cancel(second.id);
      await expect(secondOutcome).resolves.toEqual({ kind: 'cancelled' });
    });
    expect(result.current.isSending(second.id)).toBe(false);
    expect(result.current.isSending(first.id)).toBe(true);

    await act(async () => {
      resolve(first.id);
      await expect(firstOutcome).resolves.toEqual({ kind: 'success' });
    });
    expect(result.current.isSending(first.id)).toBe(false);
    expect(onResponse).toHaveBeenCalledTimes(1);
    expect(onResponse).toHaveBeenCalledWith(first.id, response);
  });

  it('reports AppError messages as failures', async () => {
    const runtime: HttpRuntime = {
      kind: 'electron',
      execute: () => Promise.reject(new AppError('NETWORK_ERROR', 'Connection refused.')),
    };
    const { result } = renderHook(() => useRequestExecution(runtime, vi.fn()));
    await act(async () => {
      await expect(result.current.send(createEmptyRequest())).resolves.toEqual({
        kind: 'failed',
        message: 'Connection refused.',
      });
    });
  });
});
