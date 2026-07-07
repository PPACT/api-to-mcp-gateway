import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from './tools.js';
import type { ApiOperation, ApiSource, IApiProxy, CallToolResult } from '../packages/core/src/types.js';

let executeCalls: Array<Record<string, unknown>> = [];
const mockProxy: IApiProxy = {
  execute: (async (req) => {
    executeCalls.push(req);
    return { statusCode: 200, headers: {}, body: { ok: true } };
  }) as IApiProxy['execute'],
};

const sampleOp: ApiOperation = {
  operationId: 'getUser', method: 'GET', path: '/users/{id}',
  summary: 'Get a user',
  parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
  responses: {},
};
const sampleSource: ApiSource = { name: 'github', baseUrl: 'https://api.github.com' };

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    executeCalls = [];
    registry = new ToolRegistry(mockProxy);
  });

  it('registers a tool and has() returns true', () => {
    registry.register(sampleOp, sampleSource);
    expect(registry.has('github_get_user')).toBe(true);
  });

  it('returns empty list when no tools registered', () => {
    expect(registry.list()).toEqual([]);
  });

  it('has() returns false for unknown tool', () => {
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('lists registered tools with correct name', () => {
    registry.register(sampleOp, sampleSource);
    const tools = registry.list();
    expect(tools.length).toBe(1);
    expect(typeof tools[0]!.name).toBe('string');
    expect(tools[0]!.name.length).toBeGreaterThan(0);
    expect(tools[0]!.inputSchema.type).toBe('object');
  });

  it('executes a tool via proxy', async () => {
    registry.register(sampleOp, sampleSource);
    const result: CallToolResult = await registry.execute('github_get_user', { id: 42 });
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0]!.type).toBe('text');
    expect(executeCalls.length).toBe(1);
    expect(executeCalls[0]!.method).toBe('GET');
  });

  it('returns error result for unknown tool', async () => {
    const result = await registry.execute('nonexistent', {});
    expect(result.isError).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
  });
});