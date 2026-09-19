import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserHttpRuntime, prepareRequest } from './index';
import type { HttpRequest } from '@httpreq/shared';

const request: HttpRequest = {
  id: '1',
  name: 'test',
  method: 'POST',
  url: 'https://example.com/users',
  params: [{ id: 'p', key: 'page', value: '2', enabled: true }],
  headers: [],
  body: { type: 'json', content: '{"name":"Ada"}' },
  auth: { type: 'bearer', token: 'secret' },
};

describe('prepareRequest', () => {
  it('combines params, auth and JSON defaults', () => {
    const result = prepareRequest(request);
    expect(result.url).toBe('https://example.com/users?page=2');
    expect(result.headers).toEqual({
      Authorization: 'Bearer secret',
      'Content-Type': 'application/json',
    });
    expect(result.body).toBe('{"name":"Ada"}');
  });

  it('rejects invalid JSON', () => {
    expect(() => prepareRequest({ ...request, body: { type: 'json', content: '{' } })).toThrow(
      'not valid JSON',
    );
  });
});

describe('BrowserHttpRuntime', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('normalizes a fetch response for the shared UI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const response = await new BrowserHttpRuntime().execute({ ...request, method: 'GET' });
    expect(response).toMatchObject({ status: 200, body: '{"ok":true}', sizeBytes: 11 });
  });
});
