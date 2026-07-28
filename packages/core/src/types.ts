import type { z } from 'zod';

// ============================================================
// OpenAPI / API Operation Types
// ============================================================

export interface ApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  description?: string;
  schema: ApiSchema;
}

export interface ApiRequestBody {
  required: boolean;
  description?: string;
  content: Record<string, { schema: ApiSchema }>;
}

export interface ApiResponse {
  statusCode: string;
  description: string;
  content?: Record<string, { schema: ApiSchema }>;
}

export interface ApiSchema {
  type?: string;
  format?: string;
  enum?: string[];
  items?: ApiSchema;
  properties?: Record<string, ApiSchema>;
  required?: string[];
  nullable?: boolean;
  default?: unknown;
  oneOf?: ApiSchema[];
  allOf?: ApiSchema[];
  anyOf?: ApiSchema[];
  description?: string;
  example?: unknown;
  $$ref?: string;
}

export interface ApiOperation {
  operationId: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  path: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters: ApiParameter[];
  requestBody?: ApiRequestBody;
  responses: Record<string, unknown>;
  deprecated?: boolean;
}

export interface ApiSpec {
  title: string;
  version: string;
  description?: string;
  baseUrl: string;
  operations: ApiOperation[];
}

// ============================================================
// API Source
// ============================================================

export interface ApiSource {
  name: string;
  baseUrl: string;
  description?: string;
}

// ============================================================
// MCP Tool Definition Types
// ============================================================

export interface MCPToolDef {
  name: string;
  description: string;
  inputSchema: MCPJsonSchema;
}

export interface MCPJsonSchema {
  type: 'object';
  properties: Record<string, MCPSchemaProperty>;
  required?: string[];
}

export interface MCPSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: MCPSchemaProperty;
  properties?: Record<string, MCPSchemaProperty>;
  required?: string[];
  nullable?: boolean;
  default?: unknown;
}

// ============================================================
// Proxy Types
// ============================================================

export interface ProxyRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
}

export interface ProxyResult {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface CallToolResult {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'resource'; resource: unknown }
    | { type: 'image'; data: string; mimeType: string }
  >;
  isError?: boolean;
}

// ============================================================
// Unified Error Format
// ============================================================

export interface ToolError {
  error: {
    code: string;
    message: string;
    suggestion?: string;
  };
}

// ============================================================
// Auth Configuration
// ============================================================

export type AuthType = 'api_key' | 'bearer' | 'oauth2' | 'none';

export interface AuthConfig {
  type: AuthType;
  headerName?: string;
  tokenPrefix?: string;
  envVar: string;
}

// ============================================================
// RAG / Search Types
// ============================================================

export interface SearchResult {
  operationId: string;
  toolName: string;
  description: string;
  path: string;
  method: string;
  similarityScore: number;
}

export interface RAGDocument {
  id: string;
  content: string;
  metadata: {
    operationId: string;
    toolName: string;
    path: string;
    method: string;
    sourceName: string;
  };
}

// ============================================================
// Score Types
// ============================================================

export type ScoreLevel = 'expose' | 'enhance_first' | 'do_not_expose';

export interface ScoreIssue {
  field: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  dimension: string;
}

export interface DimensionScore {
  name: string;
  score: number;
  maxScore: number;
  issues: ScoreIssue[];
}

export interface OpScore {
  operationId: string;
  method: string;
  path: string;
  totalScore: number;
  dimensions: DimensionScore[];
  issues: ScoreIssue[];
  level: ScoreLevel;
  /** true 表示 LLM 参与了评分裁决 */
  llmFallback: boolean;
}

export interface ScoreReport {
  overall: number;
  operationCount: number;
  summary: {
    expose: number;
    enhanceFirst: number;
    doNotExpose: number;
  };
  operations: OpScore[];
}

// ============================================================
// Enhancer Types
// ============================================================

export interface EnhanceOptions {
  /** 要增强的字段 */
  fields?: ('description' | 'example' | 'summary')[];
  /** 是否使用 LLM（默认 true） */
  useLLM?: boolean;
  /** 只增强被标记为 enhance_first 的 operation */
  selective?: boolean;
}

export interface EnhanceResult {
  operationId: string;
  before: Pick<ApiOperation, 'summary' | 'description'>;
  after: Pick<ApiOperation, 'summary' | 'description'>;
  changes: string[];
}

// ============================================================
// LLM Backend (shared between Scorer fallback & Enhancer)
// ============================================================

export interface ILLMBackend {
  chat(params: {
    systemPrompt: string;
    messages: Array<{ role: string; content: string }>;
  }): Promise<{ content: string }>;
}

// ============================================================
// Server Config
// ============================================================

export interface ServerConfig {
  port: number;
  host: string;
  specPath?: string;
  specUrl?: string;
  auth?: Record<string, AuthConfig>;
}
