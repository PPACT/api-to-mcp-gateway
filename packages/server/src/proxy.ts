import type { ProxyRequest, ProxyResult } from '@api2mcp/core';
import type { IApiProxy } from '@api2mcp/core';

export class ApiProxy implements IApiProxy {
  async execute(req: ProxyRequest): Promise<ProxyResult> {
    const url = this.buildUrl(req.url, req.queryParams);

    const fetchOptions: RequestInit = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        ...req.headers,
      },
    };

    if (req.body !== undefined && req.method !== 'GET') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), req.timeoutMs);
    fetchOptions.signal = controller.signal;

    try {
      const response = await fetch(url, fetchOptions);
      clearTimeout(timeout);

      const body = await response.json().catch(() => ({}));
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return { statusCode: response.status, headers, body };
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  private buildUrl(base: string, params: Record<string, string>): string {
    if (Object.keys(params).length === 0) return base;
    const qs = new URLSearchParams(params).toString();
    return base + (base.includes('?') ? '&' : '?') + qs;
  }
}
