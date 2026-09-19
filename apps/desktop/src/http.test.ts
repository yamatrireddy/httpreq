// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { HttpRequest } from '@httpreq/shared';
import { executeHttp } from './http';

const request: HttpRequest = {
  id: '1',
  name: 'test',
  method: 'GET',
  url: 'https://example.com/users',
  params: [],
  headers: [],
  body: { type: 'none', content: '' },
  auth: { type: 'none' },
};

describe('executeHttp', () => {
  it('returns a normalized response and forwards the abort signal', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('hello', { status: 201 }));
    const signal = new AbortController().signal;
    const result = await executeHttp(request, signal, fetchImpl);
    expect(result).toMatchObject({ ok: true, value: { status: 201, body: 'hello' } });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.com/users',
      expect.objectContaining({ method: 'GET', signal }),
    );
  });

  it('rejects malformed payloads with a serializable INVALID_REQUEST error', async () => {
    const fetchImpl = vi.fn();
    const result = await executeHttp({ url: 42 }, new AbortController().signal, fetchImpl);
    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'Invalid request payload.' },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses non-HTTP protocols', async () => {
    const result = await executeHttp(
      { ...request, url: 'file:///etc/passwd' },
      new AbortController().signal,
      vi.fn(),
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
  });

  it('maps native failures to NETWORK_ERROR without leaking the cause', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('net::ERR_CONNECTION_REFUSED'));
    const result = await executeHttp(request, new AbortController().signal, fetchImpl);
    expect(result).toEqual({
      ok: false,
      error: { code: 'NETWORK_ERROR', message: 'The native request could not be completed.' },
    });
  });
});
