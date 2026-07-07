import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiProxy } from './proxy.js';
import type { ProxyRequest } from '../packages/core/src/types.js';

describe('ApiProxy', () => {
  let proxy: ApiProxy;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    proxy = new ApiProxy();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('makes a GET request and returns structured result', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: 'test' }),
    });
    globalThis.fetch = mockFetch;

    const req: ProxyRequest = {
      method: 'GET',
      url: 'https://api.example.com/users',
      headers: {},
      queryParams: {},
      timeoutMs: 5000,
    };

    const result = await proxy.execute(req);
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({ data: 'test' });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/users',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('appends query params to URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({}),
    });
    globalThis.fetch = mockFetch;

    await proxy.execute({
      method: 'GET',
      url: 'https://api.example.com/search',
      headers: {},
      queryParams: { q: 'test', page: '1' },
      timeoutMs: 5000,
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('q=test');
    expect(calledUrl).toContain('page=1');
  });

  it('sends JSON body for POST requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers(),
      json: async () => ({ created: true }),
    });
    globalThis.fetch = mockFetch;

    await proxy.execute({
      method: 'POST',
      url: 'https://api.example.com/users',
      headers: {},
      queryParams: {},
      body: { name: 'Alice' },
      timeoutMs: 5000,
    });

    const options = mockFetch.mock.calls[0][1] as Record<string, unknown>;
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ name: 'Alice' }));
  });

  it('returns error info when HTTP error occurs (not throw)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      json: async () => ({ error: 'not found' }),
    });
    globalThis.fetch = mockFetch;

    const result = await proxy.execute({
      method: 'GET',
      url: 'https://api.example.com/missing',
      headers: {},
      queryParams: {},
      timeoutMs: 5000,
    });

    expect(result.statusCode).toBe(404);
    expect(result.body).toEqual({ error: 'not found' });
  });
});
