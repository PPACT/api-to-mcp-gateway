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
// Server Config
// ============================================================

export interface ServerConfig {
  port: number;
  host: string;
  specPath?: string;
  specUrl?: string;
  auth?: Record<string, AuthConfig>;
}
