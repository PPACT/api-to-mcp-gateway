import type {
  ApiOperation,
  OpScore,
  ScoreReport,
  ScoreIssue,
  DimensionScore,
  ScoreLevel,
  ILLMBackend,
} from './types.js';
import type { IScorer } from './contracts.js';

// ============================================================
// Rule-based Scorer with LLM fallback
// ============================================================

const DIMS = [
  { name: '描述完整度', max: 25, key: 'description' },
  { name: 'Schema 覆盖度', max: 25, key: 'schema' },
  { name: '示例丰富度', max: 20, key: 'examples' },
  { name: '错误码清晰度', max: 15, key: 'errors' },
  { name: '命名质量', max: 15, key: 'naming' },
] as const;

export class Scorer implements IScorer {
  constructor(private llm?: ILLMBackend) {}

  async score(operations: ApiOperation[]): Promise<ScoreReport> {
    const scored: OpScore[] = [];
    for (const op of operations) {
      scored.push(await this.scoreOne(op));
    }

    const overall = scored.length > 0
      ? Math.round(scored.reduce((s, o) => s + o.totalScore, 0) / scored.length)
      : 0;

    return {
      overall,
      operationCount: scored.length,
      summary: {
        expose: scored.filter((o) => o.level === 'expose').length,
        enhanceFirst: scored.filter((o) => o.level === 'enhance_first').length,
        doNotExpose: scored.filter((o) => o.level === 'do_not_expose').length,
      },
      operations: scored,
    };
  }

  async scoreOne(op: ApiOperation): Promise<OpScore> {
    const dimensions = DIMS.map((d) => this.scoreDim(d, op));
    const totalScore = dimensions.reduce((s, d) => s + d.score, 0);
    const allIssues = dimensions.flatMap((d) => d.issues);
    let level = this.level(totalScore, allIssues);
    let llmFallback = false;

    // LLM 兜底：模糊区间或有语义问题
    if (this.llm && this.shouldFallback(allIssues, totalScore)) {
      const llmAdjust = await this.llmFallbackScore(op, allIssues);
      if (llmAdjust !== null) {
        level = llmAdjust.level;
        llmFallback = true;
        // 追加 LLM 的评估意见
        allIssues.push(...llmAdjust.notes);
      }
    }

    return {
      operationId: op.operationId,
      method: op.method,
      path: op.path,
      totalScore,
      dimensions,
      issues: allIssues,
      level,
      llmFallback,
    };
  }

  // ---- dimension scorers ----

  private scoreDim(dim: typeof DIMS[number], op: ApiOperation): DimensionScore {
    switch (dim.key) {
      case 'description': return this.scoreDescription(op, dim);
      case 'schema':     return this.scoreSchema(op, dim);
      case 'examples':   return this.scoreExamples(op, dim);
      case 'errors':     return this.scoreErrors(op, dim);
      case 'naming':     return this.scoreNaming(op, dim);
    }
  }

  private scoreDescription(op: ApiOperation, dim: typeof DIMS[number]): DimensionScore {
    const issues: ScoreIssue[] = [];
    let score = dim.max;

    if (!op.summary || op.summary.length < 5) {
      score -= 10;
      issues.push({ field: 'summary', severity: 'error', message: 'summary 缺失或过短', dimension: dim.key });
    } else if (op.summary.length < 20) {
      score -= 5;
      issues.push({ field: 'summary', severity: 'warning', message: 'summary 过于简短，建议丰富', dimension: dim.key });
    }

    if (!op.description || op.description.length < 10) {
      score -= 10;
      issues.push({ field: 'description', severity: 'error', message: 'description 缺失或过短', dimension: dim.key });
    } else if (op.description.length < 30) {
      score -= 5;
      issues.push({ field: 'description', severity: 'warning', message: 'description 不够详细', dimension: dim.key });
    }

    for (const p of op.parameters) {
      if (!p.description || p.description.length < 3) {
        score -= 2;
        issues.push({
          field: `parameters.${p.name}`,
          severity: 'warning',
          message: `参数 "${p.name}" 缺少描述`,
          dimension: dim.key,
        });
      }
    }

    // requestBody 描述
    if (op.requestBody && (!op.requestBody.description || op.requestBody.description.length < 3)) {
      score -= 2;
      issues.push({ field: 'requestBody', severity: 'warning', message: '请求体缺少描述', dimension: dim.key });
    }

    return { name: dim.name, score: Math.max(0, score), maxScore: dim.max, issues };
  }

  private scoreSchema(op: ApiOperation, dim: typeof DIMS[number]): DimensionScore {
    const issues: ScoreIssue[] = [];
    let score = dim.max;

    // requestBody schema
    if (['POST', 'PUT', 'PATCH'].includes(op.method)) {
      const jsonContent = op.requestBody?.content?.['application/json'];
      if (!jsonContent?.schema?.properties || Object.keys(jsonContent.schema.properties).length === 0) {
        score -= 15;
        issues.push({ field: 'requestBody', severity: 'error', message: 'requestBody schema 缺失或为空', dimension: dim.key });
      } else if (!jsonContent.schema.required || jsonContent.schema.required.length === 0) {
        score -= 5;
        issues.push({ field: 'requestBody.required', severity: 'warning', message: '未声明 required 字段', dimension: dim.key });
      }
    }

    // 响应 schema
    const responseKeys = Object.keys(op.responses ?? {});
    if (responseKeys.length === 0) {
      score -= 10;
      issues.push({ field: 'responses', severity: 'error', message: '无任何响应定义', dimension: dim.key });
    } else if (!responseKeys.some((k) => k.startsWith('2'))) {
      score -= 5;
      issues.push({ field: 'responses', severity: 'warning', message: '无 2xx 成功响应定义', dimension: dim.key });
    }

    return { name: dim.name, score: Math.max(0, score), maxScore: dim.max, issues };
  }

  private scoreExamples(op: ApiOperation, dim: typeof DIMS[number]): DimensionScore {
    const issues: ScoreIssue[] = [];
    let score = dim.max;

    let hasExample = false;
    for (const p of op.parameters) {
      if (p.schema.example !== undefined) hasExample = true;
    }

    if (!hasExample) {
      score -= 12;
      issues.push({ field: 'parameters', severity: 'warning', message: '所有参数均无 example 值', dimension: dim.key });
    }

    // requestBody example
    if (op.requestBody) {
      const jsonContent = op.requestBody.content?.['application/json'];
      const props = jsonContent?.schema?.properties ?? {};
      let bodyHasExample = false;
      for (const v of Object.values(props)) {
        if ((v as Record<string, unknown>).example !== undefined) bodyHasExample = true;
      }
      if (!bodyHasExample && Object.keys(props).length > 0) {
        score -= 8;
        issues.push({ field: 'requestBody', severity: 'warning', message: '请求体字段无 example', dimension: dim.key });
      }
    }

    return { name: dim.name, score: Math.max(0, score), maxScore: dim.max, issues };
  }

  private scoreErrors(op: ApiOperation, dim: typeof DIMS[number]): DimensionScore {
    const issues: ScoreIssue[] = [];
    let score = dim.max;

    const codes = Object.keys(op.responses ?? {});
    const has4xx = codes.some((k) => k.startsWith('4'));
    const has5xx = codes.some((k) => k.startsWith('5'));
    const has2xx = codes.some((k) => k.startsWith('2'));

    if (!has2xx) { score -= 5; issues.push({ field: 'responses', severity: 'error', message: '缺少 2xx 成功响应', dimension: dim.key }); }
    if (!has4xx) { score -= 5; issues.push({ field: 'responses', severity: 'warning', message: '缺少 4xx 客户端错误定义', dimension: dim.key }); }
    if (!has5xx) { score -= 5; issues.push({ field: 'responses', severity: 'warning', message: '缺少 5xx 服务端错误定义', dimension: dim.key }); }

    return { name: dim.name, score: Math.max(0, score), maxScore: dim.max, issues };
  }

  private scoreNaming(op: ApiOperation, dim: typeof DIMS[number]): DimensionScore {
    const issues: ScoreIssue[] = [];
    let score = dim.max;

    if (!op.operationId || op.operationId.length < 3) {
      score -= 10;
      issues.push({ field: 'operationId', severity: 'error', message: 'operationId 缺失或无效', dimension: dim.key });
    } else {
      // 检查是否 camelCase（标准 REST 风格）
      if (!/^[a-z][a-zA-Z0-9]*$/.test(op.operationId)) {
        score -= 5;
        issues.push({ field: 'operationId', severity: 'warning', message: 'operationId 不是 camelCase 格式', dimension: dim.key });
      }
      // 检查是否包含动词
      if (!/^(get|list|create|update|delete|add|remove|find|search|patch|put|post)/i.test(op.operationId)) {
        score -= 3;
        issues.push({ field: 'operationId', severity: 'info', message: 'operationId 建议以标准动词开头 (get/list/create/update/delete)', dimension: dim.key });
      }
      // 检查长度
      if (op.operationId.length > 60) {
        score -= 2;
        issues.push({ field: 'operationId', severity: 'warning', message: 'operationId 过长（>60字符）', dimension: dim.key });
      }
    }

    return { name: dim.name, score: Math.max(0, score), maxScore: dim.max, issues };
  }

  // ---- fallback logic ----

  private shouldFallback(issues: ScoreIssue[], totalScore: number): boolean {
    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;
    // 模糊区间
    if (totalScore >= 40 && totalScore <= 60) return true;
    // 太多 warning 但无 error（规则无法判断语义）
    if (warningCount >= 3 && errorCount === 0) return true;
    return false;
  }

  private async llmFallbackScore(
    op: ApiOperation,
    ruleIssues: ScoreIssue[],
  ): Promise<{ level: ScoreLevel; notes: ScoreIssue[] } | null> {
    if (!this.llm) return null;

    try {
      const prompt = [
        `评估以下 API 接口是否适合暴露给 AI Agent 调用：`,
        `- operationId: ${op.operationId}`,
        `- 方法: ${op.method} ${op.path}`,
        `- summary: ${op.summary ?? '(无)'}`,
        `- description: ${op.description ?? '(无)'}`,
        `- 参数数: ${op.parameters.length}`,
        `规则评分发现的问题:`,
        ...ruleIssues.map((i) => `  [${i.severity}] ${i.message}`),
        ``,
        `返回 JSON: {"level":"expose|enhance_first|do_not_expose","reason":"为什么这样判断"}`,
      ].join('\n');

      const res = await this.llm.chat({
        systemPrompt: '你是 API 质量评审专家。只返回 JSON。',
        messages: [{ role: 'user', content: prompt }],
      });

      const parsed = JSON.parse(res.content.trim().replace(/```json|```/g, ''));
      const level = (['expose', 'enhance_first', 'do_not_expose'].includes(parsed.level)
        ? parsed.level
        : 'enhance_first') as ScoreLevel;

      return {
        level,
        notes: [{
          field: '_llm',
          severity: 'info',
          message: `LLM评估: ${parsed.reason ?? '无额外说明'} (调整为 ${level})`,
          dimension: 'llm',
        }],
      };
    } catch {
      return null; // LLM 失败，使用规则结果
    }
  }

  // ---- helpers ----

  private level(totalScore: number, issues: ScoreIssue[]): ScoreLevel {
    const errors = issues.filter((i) => i.severity === 'error').length;
    if (totalScore < 40 || errors >= 3) return 'do_not_expose';
    if (totalScore < 65 || errors >= 1) return 'enhance_first';
    return 'expose';
  }
}
