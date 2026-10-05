import type { ProxyRequest, ProxyResult } from '@api2mcp/core';
import type { IApiProxy } from '@api2mcp/core';

/**
 * Turn a response body into the value handed back to the caller.
 *
 * A body that failed to parse used to collapse to `{}`, which made a
 * `text/plain` or HTML error page indistinguishable from an empty-but-valid
 * JSON object. Anything non-empty that fails to parse is now returned as raw
 * text with the reason attached; an empty body still yields `{}` since nothing
 * was lost.
 */
function parseBody(text: string, contentType: string | undefined): unknown {
  if (text.trim() === '') return {};

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text,
      contentType: contentType ?? 'unknown',
      parseError: 'Response body is not valid JSON — returned as raw text.',
    };
  }
}

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

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      const text = await response.text();

      return {
        statusCode: response.status,
        headers,
        body: parseBody(text, headers['content-type']),
      };
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
