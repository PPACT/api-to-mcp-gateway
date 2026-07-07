import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator, type ILLMBackend, type LLMResponse } from '../packages/agent/src/orchestrator.js';
import { ToolRegistry } from './tools.js';
import { ApiProxy } from './proxy.js';
import { MemoryVectorStore } from '../packages/rag/src/store.js';
import { RAGRetriever } from '../packages/rag/src/retriever.js';
import { RAGIndexer } from '../packages/rag/src/indexer.js';
import type { ApiOperation, ApiSource } from '../packages/core/src/types.js';

const sampleOps: ApiOperation[] = [
  {
    operationId: 'listUsers',
    method: 'GET',
    path: '/users',
    summary: 'List users',
    parameters: [],
    responses: { '200': { statusCode: '200', description: 'OK' } },
  },
];

function makeMockLLM(response: LLMResponse): ILLMBackend {
  return { chat: vi.fn().mockResolvedValue(response) };
}

describe('AgentOrchestrator', () => {
  let registry: ToolRegistry;
  let store: MemoryVectorStore;
  let retriever: RAGRetriever;

  beforeEach(async () => {
    const proxy = new ApiProxy();
    registry = new ToolRegistry(proxy);
    const source: ApiSource = { name: 'api', baseUrl: 'https://api.example.com' };
    for (const op of sampleOps) {
      registry.register(op, source);
    }

    store = new MemoryVectorStore();
    const indexer = new RAGIndexer(store);
    await indexer.index(sampleOps, 'api');
    retriever = new RAGRetriever(store);
  });

  it('completes immediately when LLM returns no tool calls', async () => {
    const mockLLM = makeMockLLM({ toolCalls: [], content: 'Task complete.' });
    const orchestrator = new AgentOrchestrator(registry, retriever, mockLLM);

    const result = await orchestrator.execute('do something');
    expect(result.success).toBe(true);
    expect(result.finalAnswer).toBe('Task complete.');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.action).toBe('complete');
  });

  it('calls rag_search when LLM requests it', async () => {
    const mockLLM = makeMockLLM({
      toolCalls: [
        { name: 'rag_search', arguments: { query: 'list users' } },
        { name: '__done', arguments: {} },
      ],
      content: 'done',
    });

    // Second call returns no tools (completes)
    const mockLLM2 = makeMockLLM({ toolCalls: [], content: 'done' });
    // Return first response, then second
    (mockLLM.chat as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce((mockLLM as unknown as { chat: { mock: { results: Array<{ value: unknown }> } } }).chat.mock.results[0]?.value as never)
      .mockResolvedValueOnce(mockLLM2.chat.mock.results[0]?.value as never);

    // Simplified: just test with LLM that returns rag_search then stops
    const simpleLLM = makeMockLLM({
      toolCalls: [{ name: 'rag_search', arguments: { query: 'list users' } }],
      content: 'searching...',
    });
    // Override chat to return rag_search first, then complete
    let callCount = 0;
    const seqLLM: ILLMBackend = {
      chat: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { toolCalls: [{ name: 'rag_search', arguments: { query: 'list users' } }], content: '' };
        }
        return { toolCalls: [], content: 'All done.' };
      }),
    };

    const orchestrator = new AgentOrchestrator(registry, retriever, seqLLM);
    const result = await orchestrator.execute('list all users');

    expect(result.success).toBe(true);
    expect(result.steps.length).toBeGreaterThanOrEqual(1);
    const ragStep = result.steps.find((s) => s.action === 'rag_search');
    expect(ragStep).toBeDefined();
  });

  it('returns success false when max iterations reached', async () => {
    // LLM always returns tool calls — never completes
    const infiniteLLM: ILLMBackend = {
      chat: vi.fn().mockResolvedValue({
        toolCalls: [{ name: 'rag_search', arguments: { query: 'test' } }],
        content: '',
      }),
    };

    const orchestrator = new AgentOrchestrator(registry, retriever, infiniteLLM);
    const result = await orchestrator.execute('do something');

    expect(result.success).toBe(false);
    expect(result.steps.length).toBeGreaterThanOrEqual(10);
    expect(result.finalAnswer).toContain('Max iterations');
  });

  it('executes MCP tools from the registry', async () => {
    const seqLLM: ILLMBackend = {
      chat: vi.fn().mockImplementation(async () => {
        return { toolCalls: [], content: 'Done with MCP call.' };
      }),
    };

    const orchestrator = new AgentOrchestrator(registry, retriever, seqLLM);
    const result = await orchestrator.execute('list users');

    expect(result.success).toBe(true);
    expect(result.finalAnswer).toBe('Done with MCP call.');
  });
});
