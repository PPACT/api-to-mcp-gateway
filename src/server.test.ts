import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMCPServer } from './server.js';
import type { IApiProxy, IOperationParser, IToolRegistry } from '../packages/core/src/contracts.js';
import type { ApiOperation, ApiSource, MCPToolDef, CallToolResult } from '../packages/core/src/types.js';
import { ToolRegistry } from './tools.js';

const mockProxy: IApiProxy = {
  execute: async () => ({ statusCode: 200, headers: {}, body: { ok: true } }),
};

const mockParser: IOperationParser = {
  parse: async () => [],
};

const sampleTool: MCPToolDef = {
  name: 'github_get_user',
  description: 'Get a user',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'integer', description: 'User ID' } },
    required: ['id'],
  },
};

describe('MCPServer', () => {
  let server: ReturnType<typeof createMCPServer>;

  beforeEach(() => {
    server = createMCPServer({ proxy: mockProxy, parser: mockParser });
  });

  afterEach(() => {
    server.stop();
  });

  it('handles initialize and returns server info', async () => {
    const result = await server.handleRequest({
      jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' }
    });
    expect(result.result).toBeDefined();
    expect(result.result.protocolVersion).toBe('2024-11-05');
    expect(result.result.serverInfo.name).toBe('api-to-mcp-gateway');
  });

  it('handles tools/list and returns registered tools', async () => {
    const registry = new ToolRegistry(mockProxy);
    const op: ApiOperation = {
      operationId: 'getUser',
      method: 'GET',
      path: '/users/{id}',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      responses: {},
    };
    const source: ApiSource = { name: 'github', baseUrl: 'https://api.github.com' };
    registry.register(op, source);

    const srv = createMCPServer({ proxy: mockProxy, parser: mockParser, registry });
    const result = await srv.handleRequest({
      jsonrpc: '2.0', id: 2, method: 'tools/list', params: {}
    });
    expect(result.result.tools).toHaveLength(1);
    expect(result.result.tools[0].name).toBe('github_get_user');
    srv.stop();
  });

  it('handles tools/call and executes the tool', async () => {
    const registry = new ToolRegistry(mockProxy);
    const op: ApiOperation = {
      operationId: 'ping',
      method: 'GET',
      path: '/ping',
      summary: 'Ping',
      parameters: [],
      responses: {},
    };
    const source: ApiSource = { name: 'api', baseUrl: 'https://api.example.com' };
    registry.register(op, source);

    const srv = createMCPServer({ proxy: mockProxy, parser: mockParser, registry });
    const result = await srv.handleRequest({
      jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'api_ping', arguments: {} }
    });
    expect(result.result.content).toBeDefined();
    expect(result.result.content[0].type).toBe('text');
    srv.stop();
  });

  it('returns error for unknown method', async () => {
    const result = await server.handleRequest({
      jsonrpc: '2.0', id: 4, method: 'unknown/method', params: {}
    });
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe(-32601);
  });
});
