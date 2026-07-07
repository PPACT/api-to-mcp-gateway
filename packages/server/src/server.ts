import { createServer, type Server } from 'node:http';
import type { IToolRegistry, IApiProxy, IOperationParser } from '@api2mcp/core';
import { ToolRegistry } from './tools.js';

interface JSONRPCRequest {
  jsonrpc: string;
  id: number | string;
  method: string;
  params: Record<string, unknown>;
}

interface JSONRPCResponse {
  jsonrpc: string;
  id: number | string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
}

export interface MCPServerOptions {
  proxy: IApiProxy;
  parser: IOperationParser;
  registry?: IToolRegistry;
  port?: number;
  host?: string;
}

export function createMCPServer(options: MCPServerOptions) {
  const proxy = options.proxy;
  const parser = options.parser;
  const registry = options.registry ?? new ToolRegistry(proxy);
  const port = options.port ?? 0;
  const host = options.host ?? '127.0.0.1';

  let httpServer: Server | null = null;

  async function handleRequest(req: JSONRPCRequest): Promise<JSONRPCResponse> {
    const baseResponse = { jsonrpc: '2.0', id: req.id };

    switch (req.method) {
      case 'initialize':
        return {
          ...baseResponse,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'api-to-mcp-gateway', version: '0.1.0' },
          },
        };

      case 'tools/list':
        return {
          ...baseResponse,
          result: { tools: registry.list() },
        };

      case 'tools/call': {
        const { name, arguments: args = {} } = req.params as { name: string; arguments?: Record<string, unknown> };
        const result = await registry.execute(name, args as Record<string, unknown>);
        return {
          ...baseResponse,
          result: result as unknown as Record<string, unknown>,
        };
      }

      default:
        return {
          ...baseResponse,
          error: { code: -32601, message: 'Method not found: ' + req.method },
        };
    }
  }

  function start(): Promise<void> {
    return new Promise((resolve) => {
      httpServer = createServer(async (req, res) => {
        if (req.method === 'POST' && req.url === '/mcp') {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', async () => {
            try {
              const rpcReq = JSON.parse(body) as JSONRPCRequest;
              const rpcRes = await handleRequest(rpcReq);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(rpcRes));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0', id: null,
                error: { code: -32700, message: 'Parse error' },
              }));
            }
          });
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      httpServer.listen(port, host, () => resolve());
    });
  }

  function stop(): void {
    httpServer?.close();
  }

  return { handleRequest, start, stop, registry };
}
