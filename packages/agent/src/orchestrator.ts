import type { CallToolResult } from '@api2mcp/core';
import type { IToolRegistry } from '@api2mcp/core';
import type { RAGRetriever } from '@api2mcp/rag';

export interface LLMResponse {
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
  content: string;
}

export interface ILLMBackend {
  chat(params: {
    systemPrompt: string;
    messages: Array<{ role: string; content: string }>;
    tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  }): Promise<LLMResponse>;
}

export interface AgentStep {
  iteration: number;
  action: 'rag_search' | 'list_tools' | 'tool_call' | 'complete' | 'error';
  detail: string;
  result?: CallToolResult;
}

export interface AgentResult {
  success: boolean;
  steps: AgentStep[];
  finalAnswer: string;
}

const MAX_ITERATIONS = 10;

export class AgentOrchestrator {
  constructor(
    private registry: IToolRegistry,
    private retriever: RAGRetriever,
    private llm: ILLMBackend,
  ) {}
  async execute(task: string): Promise<AgentResult> {
    const steps: AgentStep[] = [];
    const messages: Array<{ role: string; content: string }> = [
      { role: 'user', content: task },
    ];

    for (let i = 1; i <= MAX_ITERATIONS; i++) {
      const availableTools = this.buildAgentTools();

      const llmResponse = await this.llm.chat({
        systemPrompt: this.systemPrompt(),
        messages,
        tools: availableTools,
      });

      if (llmResponse.toolCalls.length === 0) {
        steps.push({ iteration: i, action: 'complete', detail: llmResponse.content });
        return { success: true, steps, finalAnswer: llmResponse.content };
      }

      for (const tc of llmResponse.toolCalls) {
        const result = await this.executeTool(tc.name, tc.arguments);
        steps.push({
          iteration: i,
          action: tc.name === 'rag_search' || tc.name === 'list_available_tools'
            ? (tc.name as 'rag_search' | 'list_tools')
            : 'tool_call',
          detail: tc.name,
          result,
        });

        messages.push({
          role: 'assistant',
          content: JSON.stringify({ tool_call: { name: tc.name, arguments: tc.arguments } }),
        });
        messages.push({
          role: 'user',
          content: JSON.stringify({ tool_result: result }),
        });
      }
    }

    return {
      success: false,
      steps,
      finalAnswer: 'Max iterations (' + MAX_ITERATIONS + ') reached without completing the task.',
    };
  }

  private systemPrompt(): string {
    const tools = this.registry.list();
    return 'You are an API orchestrator agent. Available MCP tools:\n' +
      tools.map((t) => '  - ' + t.name + ': ' + t.description).join('\n') +
      '\n\nWorkflow:\n' +
      '1. Use rag_search to find the most relevant API operations.\n' +
      '2. Call the appropriate tool(s) with correct parameters.\n' +
      '3. Based on results, decide next steps or report completion.\n' +
      '4. Stop when the task is finished. Max 10 iterations.';
  }

  private buildAgentTools(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    const tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> = [];

    tools.push({
      name: 'rag_search',
      description: 'Search API documentation to find relevant operations.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'What do you want to do?' }, topK: { type: 'number', description: 'Number of results (default 5)' } },
        required: ['query'],
      },
    });

    tools.push({
      name: 'list_available_tools',
      description: 'List all available MCP tools with names and descriptions.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    });

    for (const t of this.registry.list()) {
      tools.push({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as unknown as Record<string, unknown>,
      });
    }

    return tools;
  }

  private async executeTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    if (name === 'rag_search') {
      const query = (args.query as string) ?? '';
      const topK = (args.topK as number) ?? 5;
      const results = this.retriever.search(query, topK);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }

    if (name === 'list_available_tools') {
      const tools = this.registry.list();
      return { content: [{ type: 'text', text: JSON.stringify(tools, null, 2) }] };
    }

    return this.registry.execute(name, args);
  }
}
