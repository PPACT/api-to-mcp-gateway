import { describe, it, expect } from 'vitest';
import { Scorer } from '../scorer.js';
import type { ApiOperation } from '../types.js';

function makeOp(overrides: Partial<ApiOperation> = {}): ApiOperation {
  return {
    operationId: 'getUserById',
    method: 'GET',
    path: '/users/{id}',
    summary: 'Get a user by their unique ID',
    description: 'Returns the full user object including profile, email, and metadata',
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        description: 'The unique identifier of the user',
        schema: { type: 'string', example: 'usr_abc123' },
      },
    ],
    responses: {
      '200': { statusCode: '200', description: 'User found' },
      '404': { statusCode: '404', description: 'User not found' },
      '500': { statusCode: '500', description: 'Server error' },
    },
    ...overrides,
  };
}

describe('Scorer', () => {
  const scorer = new Scorer();

  it('满分接口：描述完整、有示例、错误码齐全', async () => {
    const op = makeOp();
    const result = await scorer.scoreOne(op);
    expect(result.totalScore).toBeGreaterThanOrEqual(80);
    expect(result.level).toBe('expose');
    expect(result.llmFallback).toBe(false);
  });

  it('空描述接口打低分', async () => {
    const op = makeOp({
      summary: undefined,
      description: undefined,
      parameters: [],
      responses: {},
    });
    const result = await scorer.scoreOne(op);
    expect(result.totalScore).toBeLessThanOrEqual(45);
    expect(result.level).toBe('do_not_expose');
  });

  it('POST 接口缺 requestBody schema 扣分', async () => {
    const op = makeOp({
      method: 'POST',
      requestBody: undefined,
    });
    const result = await scorer.scoreOne(op);
    const schemaDim = result.dimensions.find((d) => d.name.includes('Schema'));
    expect(schemaDim).toBeDefined();
    expect(schemaDim!.score).toBeLessThan(15);
  });

  it('缺 4xx/5xx 错误码扣分', async () => {
    const op = makeOp({
      responses: { '200': { statusCode: '200', description: 'OK' } },
    });
    const result = await scorer.scoreOne(op);
    const errDim = result.dimensions.find((d) => d.name.includes('错误码'));
    expect(errDim).toBeDefined();
    expect(errDim!.score).toBeLessThan(10);
  });

  it('评分结果有 5 个维度', async () => {
    const op = makeOp();
    const result = await scorer.scoreOne(op);
    expect(result.dimensions).toHaveLength(5);
    expect(result.dimensions.map((d) => d.name)).toEqual([
      '描述完整度',
      'Schema 覆盖度',
      '示例丰富度',
      '错误码清晰度',
      '命名质量',
    ]);
  });

  it('operationId 不是 camelCase 扣分', async () => {
    const op = makeOp({ operationId: 'get_user_by_id' });
    const result = await scorer.scoreOne(op);
    const namingDim = result.dimensions.find((d) => d.name.includes('命名'));
    expect(namingDim!.score).toBeLessThan(15);
  });

  it('批量评分返回汇总', async () => {
    const ops = [makeOp(), makeOp({ summary: undefined, description: undefined })];
    const report = await scorer.score(ops);
    expect(report.operationCount).toBe(2);
    expect(report.overall).toBeGreaterThan(0);
    expect(report.summary.expose + report.summary.enhanceFirst + report.summary.doNotExpose).toBe(2);
  });

  it('缺示例扣分', async () => {
    const op = makeOp({
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ],
    });
    const result = await scorer.scoreOne(op);
    const exDim = result.dimensions.find((d) => d.name.includes('示例'));
    expect(exDim!.score).toBeLessThan(12);
  });
});
