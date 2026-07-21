import type { ApiOperation, ApiSource, MCPToolDef, CallToolResult, ToolError, ProxyRequest } from '@api2mcp/core';
import type { IApiProxy } from '@api2mcp/core';
import { convertOperation } from '@api2mcp/core';
import { AuthManager } from './auth.js';

interface ToolEntry {
  operation: ApiOperation;
  source: ApiSource;
  def: MCPToolDef;
}

export class ToolRegistry {
  private tools: Map<string, ToolEntry> = new Map();
  private proxy: IApiProxy;
  private authManager: AuthManager | null;

  constructor(proxy: IApiProxy, authManager?: AuthManager) {
    this.proxy = proxy;
    this.authManager = authManager ?? null;
  }

  register(op: ApiOperation, source: ApiSource): void {
    const def = convertOperation(op, source.name);
    this.tools.set(def.name, { operation: op, source, def });
  }

  list(): MCPToolDef[] {
    return Array.from(this.tools.values()).map((entry) => entry.def);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    const entry = this.tools.get(name);
    if (!entry) {
      return this.errorResult({
        error: { code: 'TOOL_NOT_FOUND', message: 'Tool "' + name + '" not found' },
      });
    }

    try {
      const { source, operation } = entry;
      const proxyReq: ProxyRequest = {
        method: operation.method,
        url: source.baseUrl + this.interpolatePath(operation.path, args),
        headers: this.authManager ? this.authManager.getHeaders(source.name) : {},
        queryParams: this.extractQueryParams(operation.path, args),
        body: operation.method !== 'GET' ? args : undefined,
        timeoutMs: 30000,
      };

      const proxyResult = await this.proxy.execute(proxyReq);
      return {
        content: [{ type: 'text', text: JSON.stringify(proxyResult.body, null, 2) }],
      };
    } catch (err) {
      return this.errorResult({
        error: {
          code: 'EXECUTION_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
          suggestion: 'Check the tool parameters and try again',
        },
      });
    }
  }

  private interpolatePath(path: string, args: Record<string, unknown>): string {
    return path.replace(/{(\w+)}/g, (_, key) => String(args[key] ?? '{' + key + '}'));
  }

  private extractQueryParams(path: string, args: Record<string, unknown>): Record<string, string> {
    const result: Record<string, string> = {};
    const pathParamNames = Array.from(path.matchAll(/{(\w+)}/g)).map((m) => m[1]);
    for (const [key, value] of Object.entries(args)) {
      if (!pathParamNames.includes(key) && value !== undefined && value !== null) {
        result[key] = String(value);
      }
    }
    return result;
  }

  private errorResult(error: ToolError): CallToolResult {
    return {
      content: [{ type: 'text', text: JSON.stringify(error) }],
      isError: true,
    };
  }
}