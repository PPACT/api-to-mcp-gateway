import type {
  ApiOperation,
  ApiSource,
  MCPToolDef,
  ProxyRequest,
  ProxyResult,
  CallToolResult,
  SearchResult,
} from './types.js';

// ============================================================
// Contract 1: OpenAPI Spec Parser
// ============================================================

export interface IOperationParser {
  parse(source: string): Promise<ApiOperation[]>;
}

// ============================================================
// Contract 2: MCP Tool Registry
// ============================================================

export interface IToolRegistry {
  register(op: ApiOperation, source: ApiSource): void;
  list(): MCPToolDef[];
  execute(name: string, args: Record<string, unknown>): Promise<CallToolResult>;
  has(name: string): boolean;
}

// ============================================================
// Contract 3: API Proxy
// ============================================================

export interface IApiProxy {
  execute(req: ProxyRequest): Promise<ProxyResult>;
}

// ============================================================
// Contract 4: RAG Store
// ============================================================

export interface IRagStore {
  index(operations: ApiOperation[], specName: string): Promise<void>;
  search(query: string, topK: number): Promise<SearchResult[]>;
  clear(specName: string): Promise<void>;
}
