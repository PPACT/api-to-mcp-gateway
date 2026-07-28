import { describe, it, expect } from 'vitest';
import { Enhancer } from '../enhancer.js';
import type { ApiOperation, ILLMBackend } from '../types.js';

// Mock LLM that returns pre-defined responses
class MockLLM implements ILLMBackend {
  async chat(params: { systemPrompt: string; messages: Array<{ role: string; content: string }> }) {
    const msg = params.messages[0]?.content ?? '';

    if (msg.includes('getUserById')) {
      return {
        content: JSON.stringify({
          summary: 'Retrieve a user by their unique identifier',
          description: 'Returns complete user profile including contact details, preferences, and account status. Suitable for user lookup in workflows.',
        }),
      };
    }

    if (msg.includes('"operationId"') && msg.includes('enhancedDescription')) {
      return { content: JSON.stringify([
        { operationId: 'addPet', enhancedSummary: 'Add a new pet to the store', enhancedDescription: 'Creates a new pet entry with name and status fields.' },
        { operationId: 'getPetById', enhancedSummary: 'Find pet by ID', enhancedDescription: 'Retrieves a pet record by its unique numeric identifier.' },
      ]) };
    }

    return { content: '{}' };
  }
}

function makeOp(overrides: Partial<ApiOperation> = {}): ApiOperation {
  return {
    operationId: 'getUserById',
    method: 'GET',
    path: '/users/{id}',
    summary: undefined,
    description: undefined,
    parameters: [
      { name: 'id', in: 'path', required: true, description: undefined, schema: { type: 'string' } },
    ],
    responses: { '200': { statusCode: '200', description: 'OK' } },
    ...overrides,
  };
}

describe('Enhancer', () => {
  const mockLLM = new MockLLM();
  const enhancer = new Enhancer(mockLLM);

  it('增强缺失的 description', async () => {
    const op = makeOp();
    const { results } = await enhancer.enhance([op], { fields: ['description'] });
    expect(results).toHaveLength(1);
    expect(results[0]!.after.description).toBeDefined();
    expect(results[0]!.before.description).toBeUndefined();
  });

  it('增强缺失的 summary', async () => {
    const op = makeOp();
    const { results } = await enhancer.enhance([op], { fields: ['summary'] });
    expect(results).toHaveLength(1);
    expect(results[0]!.after.summary).toBeDefined();
    expect(results[0]!.before.summary).toBeUndefined();
  });

  it('已有描述的不重复增强', async () => {
    const op = makeOp({
      summary: 'Get user',
      description: 'A very detailed description that is more than 40 characters long and explains everything',
    });
    const { results } = await enhancer.enhance([op]);
    expect(results).toHaveLength(0);
  });

  it('空列表不报错', async () => {
    const { results } = await enhancer.enhance([]);
    expect(results).toHaveLength(0);
  });

  it('批量增强多个 operation', async () => {
    const ops = [
      makeOp({ operationId: 'addPet', method: 'POST', summary: 'Add pet', description: undefined }),
      makeOp({ operationId: 'getPetById', summary: 'Find pet', description: undefined }),
    ];
    const { results } = await enhancer.enhanceBatch(ops, ['description', 'summary']);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('返回的 operations 保留了原字段', async () => {
    const op = makeOp({ tags: ['users'] });
    const { operations } = await enhancer.enhance([op], { fields: ['description'] });
    expect(operations[0]!.tags).toEqual(['users']);
    expect(operations[0]!.method).toBe('GET');
    expect(operations[0]!.path).toBe('/users/{id}');
  });

  it('LLM 失败时优雅降级', async () => {
    const badLLM: ILLMBackend = { chat: async () => { throw new Error('down'); } };
    const badEnhancer = new Enhancer(badLLM);
    const op = makeOp();
    const { results } = await badEnhancer.enhance([op]);
    expect(results).toHaveLength(1);
    expect(results[0]!.changes).toHaveLength(0);
  });
});
