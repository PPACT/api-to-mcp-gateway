import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ProxyRequest } from '@api2mcp/core';
import { ApiProxy } from '../proxy.js';

function request(): ProxyRequest {
  return {
    method: 'GET',
    url: 'https://api.test/thing',
    headers: {},
    queryParams: {},
    timeoutMs: 1000,
  };
}

function stubFetch(response: Response): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

describe('ApiProxy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses a JSON response body', async () => {
    stubFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await new ApiProxy().execute(request());

    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({ ok: true });
  });

  it('keeps a non-JSON body as raw text rather than collapsing it to {}', async () => {
    stubFetch(
      new Response('plain text body', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );

    const result = await new ApiProxy().execute(request());

    expect(result.body).not.toEqual({});
    expect(result.body).toMatchObject({
      raw: 'plain text body',
      contentType: 'text/plain',
    });
  });

  it('keeps an HTML gateway error page instead of reporting an empty object', async () => {
    stubFetch(
      new Response('<html>502 Bad Gateway</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const result = await new ApiProxy().execute(request());

    expect(result.statusCode).toBe(502);
    expect(result.body).toMatchObject({ raw: '<html>502 Bad Gateway</html>' });
  });

  it('still returns {} for an empty body, where nothing was lost', async () => {
    stubFetch(new Response(null, { status: 204 }));

    const result = await new ApiProxy().execute(request());

    expect(result.body).toEqual({});
  });

  it('propagates network errors unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    await expect(new ApiProxy().execute(request())).rejects.toThrow('connection refused');
  });
});
