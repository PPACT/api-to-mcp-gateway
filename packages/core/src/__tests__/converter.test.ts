import { describe, it, expect } from 'vitest';
import { convertOperation } from '../converter.js';
import type { ApiOperation } from '../types.js';

const baseOp: ApiOperation = {
  operationId: 'getUserById',
  method: 'GET',
  path: '/users/{userId}',
  summary: 'Get a user by ID',
  description: 'Returns a single user',
  tags: ['users'],
  parameters: [
    {
      name: 'userId',
      in: 'path',
      required: true,
      schema: { type: 'integer', format: 'int64' },
    },
    {
      name: 'include',
      in: 'query',
      required: false,
      schema: { type: 'string' },
    },
  ],
  responses: {
    '200': { statusCode: '200', description: 'OK' },
  },
};

describe('convertOperation', () => {
  it('converts operationId camelCase to snake_case tool name with source prefix', () => {
    const tool = convertOperation(baseOp, 'github');
    expect(tool.name).toBe('github_get_user_by_id');
  });

  it('converts single-word operationId correctly', () => {
    const op: ApiOperation = {
      operationId: 'search',
      method: 'GET',
      path: '/search',
      parameters: [],
      responses: {},
    };
    const tool = convertOperation(op, 'api');
    expect(tool.name).toBe('api_search');
  });

  it('maps path and query parameters to inputSchema properties', () => {
    const tool = convertOperation(baseOp, 'github');
    expect(tool.inputSchema.properties).toHaveProperty('userId');
    expect(tool.inputSchema.properties['userId']!.type).toBe('integer');
    expect(tool.inputSchema.properties['userId']!.description).toBeDefined();

    expect(tool.inputSchema.properties).toHaveProperty('include');
    expect(tool.inputSchema.properties['include']!.type).toBe('string');
  });

  it('lists required parameters in inputSchema.required', () => {
    const tool = convertOperation(baseOp, 'github');
    expect(tool.inputSchema.required).toContain('userId');
    expect(tool.inputSchema.required).not.toContain('include');
  });

  it('includes requestBody properties in inputSchema', () => {
    const op: ApiOperation = {
      operationId: 'createUser',
      method: 'POST',
      path: '/users',
      parameters: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string' },
              },
              required: ['name', 'email'],
            },
          },
        },
      },
      responses: {},
    };
    const tool = convertOperation(op, 'api');
    expect(tool.inputSchema.properties).toHaveProperty('name');
    expect(tool.inputSchema.properties).toHaveProperty('email');
    expect(tool.inputSchema.required).toContain('name');
  });

  it('generates description from summary', () => {
    const tool = convertOperation(baseOp, 'github');
    expect(tool.description).toContain('Get a user by ID');
  });

  it('handles operations with no parameters', () => {
    const op: ApiOperation = {
      operationId: 'ping',
      method: 'GET',
      path: '/ping',
      summary: 'Health check',
      parameters: [],
      responses: {},
    };
    const tool = convertOperation(op, 'api');
    expect(tool.name).toBe('api_ping');
    expect(tool.inputSchema.properties).toEqual({});
    expect(tool.inputSchema.required).toBeUndefined();
  });
});
