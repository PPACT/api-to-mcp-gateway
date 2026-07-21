import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { ApiOperation, ApiParameter, ApiRequestBody } from './types.js';

export async function parseOpenApiSpec(filePath: string): Promise<ApiOperation[]> {
  const raw = readFileSync(filePath, 'utf-8');
  let spec: Record<string, unknown>;

  try {
    spec = JSON.parse(raw);
  } catch {
    spec = parseYaml(raw);
  }

  if (!spec || typeof spec !== 'object' || !('openapi' in spec)) {
    throw new Error('File is not a valid OpenAPI spec: missing "openapi" field');
  }

  const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>;
  const operations: ApiOperation[] = [];

  for (const [path, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== 'object') continue;

    for (const [method, opData] of Object.entries(methods)) {
      if (opData == null || typeof opData !== 'object') continue;
      const data = opData as Record<string, unknown>;
      const operationId = data.operationId as string | undefined;
      if (!operationId) continue;

      operations.push({
        operationId,
        method: method.toUpperCase() as ApiOperation['method'],
        path,
        summary: (data.summary as string) ?? undefined,
        description: (data.description as string) ?? undefined,
        tags: (data.tags as string[]) ?? undefined,
        parameters: extractParameters(data.parameters),
        requestBody: extractRequestBody(data.requestBody),
        responses: extractResponses(data.responses) as Record<string, unknown>,
        deprecated: (data.deprecated as boolean) ?? undefined,
      });
    }
  }

  return operations;
}

function extractParameters(raw: unknown): ApiParameter[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p: Record<string, unknown>) => ({
    name: p.name as string,
    in: (p.in as string) as ApiParameter['in'] ?? 'query',
    required: (p.required as boolean) ?? false,
    description: (p.description as string) ?? undefined,
    schema: (p.schema as Record<string, unknown>) ?? {},
  }));
}

function extractRequestBody(raw: unknown): ApiRequestBody | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const rb = raw as Record<string, unknown>;
  return {
    required: (rb.required as boolean) ?? false,
    description: (rb.description as string) ?? undefined,
    content: (rb.content as Record<string, { schema: Record<string, unknown> }>) ?? {},
  };
}

function extractResponses(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  return raw as Record<string, unknown>;
}
