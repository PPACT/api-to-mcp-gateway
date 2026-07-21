import type { ApiOperation, MCPToolDef, MCPSchemaProperty, ApiParameter } from './types.js';

/**
 * Convert an OpenAPI operation to an MCP tool definition.
 * Tool name: {source}_{snake_case_operationId}
 * inputSchema: parameters + requestBody mapped to JSON Schema properties
 */
export function convertOperation(op: ApiOperation, source: string): MCPToolDef {
  const name = toolName(source, op.operationId);
  const description = buildDescription(op);
  const properties: Record<string, MCPSchemaProperty> = {};
  const required: string[] = [];

  // Map path/query/header parameters
  for (const param of op.parameters) {
    properties[param.name] = mapParameter(param);
    if (param.required) {
      required.push(param.name);
    }
  }

  // Map requestBody properties if present
  if (op.requestBody) {
    const jsonContent = op.requestBody.content['application/json'];
    if (jsonContent?.schema?.properties) {
      for (const [key, schema] of Object.entries(jsonContent.schema.properties as Record<string, Record<string, unknown>>)) {
        properties[key] = mapSchemaProperty(schema);
      }
      if (jsonContent.schema.required) {
        required.push(...jsonContent.schema.required);
      }
    }
  }

  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    },
  };
}

/** operationId camelCase to snake_case: getUserById → get_user_by_id */
function toolName(source: string, operationId: string): string {
  const snake = operationId.replace(/([A-Z])/g, '_$1').toLowerCase();
  return source + '_' + snake;
}

function buildDescription(op: ApiOperation): string {
  const parts: string[] = [];
  if (op.summary) parts.push(op.summary);
  if (op.description && op.description !== op.summary) parts.push(op.description);
  const suffix = op.tags && op.tags.length > 0 ? ' Tags: ' + op.tags.join(', ') + '.' : '';
  return parts.join('. ') + suffix;
}

function mapParameter(param: ApiParameter): MCPSchemaProperty {
  return {
    type: param.schema.type ?? 'string',
    description: param.description ?? param.name + ' (' + param.in + ')',
    enum: param.schema.enum,
  };
}

function mapSchemaProperty(schema: Record<string, unknown>): MCPSchemaProperty {
  return {
    type: (schema.type as string) ?? 'string',
    description: schema.description as string | undefined,
    enum: schema.enum as string[] | undefined,
  };
}
