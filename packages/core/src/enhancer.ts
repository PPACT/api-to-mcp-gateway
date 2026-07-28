import type { ApiOperation, EnhanceOptions, EnhanceResult, ILLMBackend } from './types.js';
import type { IEnhancer } from './contracts.js';

/**
 * API operation enhancer — uses LLM to fill in missing descriptions,
 * examples, and improve semantic clarity for AI consumption.
 */
export class Enhancer implements IEnhancer {
  constructor(private llm: ILLMBackend) {}

  async enhance(
    operations: ApiOperation[],
    options: EnhanceOptions = {},
  ): Promise<{ operations: ApiOperation[]; results: EnhanceResult[] }> {
    const { fields = ['description', 'example'], useLLM = true, selective = false } = options;
    const results: EnhanceResult[] = [];
    const enhanced: ApiOperation[] = [];

    for (const op of operations) {
      if (selective && this.needsEnhancement(op)) {
        // 跳过不需要增强的
        enhanced.push(op);
        continue;
      }

      if (useLLM && this.hasDeficits(op, fields)) {
        const result = await this.enhanceOne(op, fields);
        results.push(result);
        enhanced.push({ ...op, summary: result.after.summary ?? op.summary, description: result.after.description ?? op.description });
      } else {
        enhanced.push(op);
      }
    }

    return { operations: enhanced, results };
  }

  /**
   * Build a batch prompt to enhance multiple operations at once.
   * Saves token cost vs calling LLM per operation.
   */
  async enhanceBatch(
    operations: ApiOperation[],
    fields: ('description' | 'example' | 'summary')[] = ['description'],
  ): Promise<{ operations: ApiOperation[]; results: EnhanceResult[] }> {
    const deficitOps = operations.filter((op) => this.hasDeficits(op, fields));
    if (deficitOps.length === 0) return { operations, results: [] };

    const specSummary = deficitOps.map((op) => ({
      operationId: op.operationId,
      method: op.method,
      path: op.path,
      summary: op.summary ?? '(缺失)',
      description: op.description ?? '(缺失)',
      params: op.parameters.map((p) => `${p.name} (${p.in}): ${p.description ?? '无描述'}`),
    }));

    const prompt = [
      '以下 OpenAPI operations 的文档质量较差，需要增强以便 AI Agent 理解。',
      '对每个 operation，生成更清晰的 description（面向 AI 调用者）和缺失字段的建议。',
      '',
      JSON.stringify(specSummary, null, 2),
      '',
      '返回 JSON 数组，每个元素:',
      '{"operationId":"...", "enhancedSummary":"...", "enhancedDescription":"...", "suggestedExamples": {"paramName": "exampleValue"}}',
    ].join('\n');

    try {
      const res = await this.llm.chat({
        systemPrompt: '你是 OpenAPI 文档专家。返回纯 JSON 数组，不含 markdown。',
        messages: [{ role: 'user', content: prompt }],
      });

      const parsed = JSON.parse(res.content.trim().replace(/```json|```/g, '')) as Array<{
        operationId: string;
        enhancedSummary: string;
        enhancedDescription: string;
        suggestedExamples: Record<string, string>;
      }>;

      const results: EnhanceResult[] = [];
      const enhanced = operations.map((op) => {
        const match = parsed.find((p) => p.operationId === op.operationId);
        if (!match) return op;

        const before = { summary: op.summary, description: op.description };
        const after: { summary?: string; description?: string } = {};

        const changes: string[] = [];
        if (fields.includes('summary') && match.enhancedSummary) {
          after.summary = match.enhancedSummary;
          changes.push('summary: 已增强');
        }
        if (fields.includes('description') && match.enhancedDescription) {
          after.description = match.enhancedDescription;
          changes.push('description: 已增强');
        }

        results.push({ operationId: op.operationId, before, after, changes });
        return { ...op, summary: after.summary ?? op.summary, description: after.description ?? op.description };
      });

      return { operations: enhanced, results };
    } catch {
      // LLM 失败时返回原始 operations
      return { operations, results: [] };
    }
  }

  // ---- private ----

  private async enhanceOne(
    op: ApiOperation,
    fields: string[],
  ): Promise<EnhanceResult> {
    const before = { summary: op.summary, description: op.description };

    const prompt = [
      `优化以下 API 接口的文档质量：`,
      `- operationId: ${op.operationId}`,
      `- 方法: ${op.method} ${op.path}`,
      `- 当前 summary: ${op.summary ?? '(缺失)'}`,
      `- 当前 description: ${op.description ?? '(缺失)'}`,
      `- 参数: ${op.parameters.map((p) => `${p.name} (${p.in}${p.required ? ', 必填' : ''}): ${p.description ?? '无描述'}`).join('; ')}`,
      fields.includes('example') ? '请同时提供合理的参数示例值。' : '',
      '',
      `返回 JSON: {"summary":"...", "description":"..."}`,
    ].join('\n');

    try {
      const res = await this.llm.chat({
        systemPrompt: '你是 OpenAPI 文档专家。返回纯 JSON，不含 markdown。',
        messages: [{ role: 'user', content: prompt }],
      });

      const parsed = JSON.parse(res.content.trim().replace(/```json|```/g, ''));
      const changes: string[] = [];
      const after: { summary?: string; description?: string } = {};

      if (fields.includes('summary') && parsed.summary && parsed.summary !== op.summary) {
        after.summary = parsed.summary;
        changes.push('summary');
      }
      if (fields.includes('description') && parsed.description && parsed.description !== op.description) {
        after.description = parsed.description;
        changes.push('description');
      }

      return { operationId: op.operationId, before, after, changes };
    } catch {
      return { operationId: op.operationId, before, after: {}, changes: [] };
    }
  }

  private hasDeficits(op: ApiOperation, fields: string[]): boolean {
    if (fields.includes('description') && (!op.description || op.description.length < 20)) return true;
    if (fields.includes('summary') && (!op.summary || op.summary.length < 5)) return true;
    return false;
  }

  private needsEnhancement(op: ApiOperation): boolean {
    // 简单的规则判断：如果描述和 summary 都充分，不需要增强
    const hasGoodSummary = op.summary != null && op.summary.length >= 20;
    const hasGoodDesc = op.description != null && op.description.length >= 40;
    const paramsDescribed = op.parameters.every((p) => p.description != null && p.description.length >= 3);
    return Boolean(hasGoodSummary && hasGoodDesc && paramsDescribed);
  }
}
