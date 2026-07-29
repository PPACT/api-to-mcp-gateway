import { describe, it, expect } from 'vitest';
import { AgentOrchestrator } from '../orchestrator.js';
import type { ILLMBackend, LLMCallResult, CallToolResult, MCPToolDef, ApiOperation, ApiSource } from '@api2mcp/core';
import type { IToolRegistry } from '@api2mcp/core';
import type { RAGRetriever } from '@api2mcp/rag';
import { MemoryVectorStore } from '@api2mcp/rag';
import { RAGIndexer } from '@api2mcp/rag';
import { RAGRetriever } from '@api2mcp/rag';

class MockRegistry implements IToolRegistry {
  private tools: MCPToolDef[] = [];
  register(op: ApiOperation, source: ApiSource) {
    this.tools.push({
      name: source.name + '_' + op.operationId,
      description: op.summary ?? op.operationId,
      inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
    });
  }
  list() { return this.tools; }
  async execute(name: string, _args: Record<string, unknown>): Promise<CallToolResult> {
    return { content: [{ type: 'text', text: '{"status":"ok","tool":"' + name + '"}' }] };
  }
  has(_name: string) { return true; }
}

class AgentMockLLM implements ILLMBackend {
  private calls = 0;
  async chat(): Promise<LLMCallResult> {
    this.calls++;
    if (this.calls === 1) {
      return {
        content: '',
        toolCalls: [{ name: 'rag_search', arguments: { query: 'add pet' } }],
      };
    }
    return { content: 'Task completed successfully.', toolCalls: [] };
  }
}

describe('AgentOrchestrator', () => {
  it('executes a simple task with tool calls', async () => {
    const registry = new MockRegistry();
    registry.register(
      { operationId: 'addPet', method: 'POST', path: '/pet', parameters: [], responses: {} },
      { name: 'petstore', baseUrl: 'http://localhost' },
    );

    const store = new MemoryVectorStore();
    const indexer = new RAGIndexer(store);
    await indexer.index([
      { operationId: 'addPet', method: 'POST', path: '/pet', summary: 'Add pet', description: 'Add a new pet', parameters: [], responses: {} },
    ], 'petstore');
    const retriever = new RAGRetriever(store);

    const llm = new AgentMockLLM();
    const orchestrator = new AgentOrchestrator(registry, retriever, llm);

    const result = await orchestrator.execute('Add a new pet');

    expect(result.success).toBe(true);
    expect(result.steps.length).toBeGreaterThanOrEqual(1);
    expect(result.steps[0]!.action).toBe('rag_search');
  });

  it('completes without tool calls', async () => {
    const registry = new MockRegistry();
    const store = new MemoryVectorStore();
    const retriever = new RAGRetriever(store);

    const llm: ILLMBackend = {
      async chat() {
        return { content: 'Nothing to do.', toolCalls: [] };
      },
    };
    const orchestrator = new AgentOrchestrator(registry, retriever, llm);

    const result = await orchestrator.execute('Say hello');

    expect(result.success).toBe(true);
    expect(result.steps[0]!.action).toBe('complete');
  });

  it('handles max iterations', async () => {
    const registry = new MockRegistry();
    const store = new MemoryVectorStore();
    const retriever = new RAGRetriever(store);

    let count = 0;
    const llm: ILLMBackend = {
      async chat() {
        count++;
        return { content: '', toolCalls: [{ name: 'rag_search', arguments: { query: 'loop' } }] };
      },
    };
    const orchestrator = new AgentOrchestrator(registry, retriever, llm);

    const result = await orchestrator.execute('Loop forever');
    expect(result.success).toBe(false);
    expect(count).toBe(10);
    expect(result.finalAnswer).toContain('Max iterations');
  });
});
