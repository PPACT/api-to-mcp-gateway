# API-to-MCP Gateway

> 输入 OpenAPI 文档 → 自动生成 MCP Server → AI Agent 直接调用第三方 API

Convert any REST API (OpenAPI/Swagger) into an MCP Server, enabling AI agents (Claude, GPT, Codex) to directly call third-party APIs through the Model Context Protocol.

## Features

- **OpenAPI → MCP Tool Generation** — Parse OpenAPI 2.0/3.0 specs (JSON or YAML) and auto-generate MCP tool definitions with snake_case naming, complete input schemas, and descriptions
- **Streamable HTTP Transport** — MCP protocol over HTTP (`POST /mcp`), supporting multiple AI clients simultaneously (not just stdio)
- **API Proxy Execution** — When an AI agent calls an MCP tool, the gateway issues a real HTTP request to the target API and returns the response
- **RAG-Enhanced Discovery** — Vectorize API documentation so agents can search for relevant operations before calling them (never "blind call")
- **Agent Orchestration** — Built-in agent loop that chains RAG search → tool selection → API execution for multi-step tasks
- **Multi-API Aggregation** — One MCP server can expose tools from multiple OpenAPI specs simultaneously
- **Auth Management** — Supports API Key, Bearer Token, and OAuth2 via environment variables — never hardcoded

## Architecture

```
┌────────────┐   OpenAPI Spec   ┌──────────────┐   MCP tools    ┌────────────┐
│   User /   │ ───────────────> │   Gateway    │ <────────────> │ AI Agent   │
│   CLI      │                  │   Server     │                │ (Claude)   │
└────────────┘                  └──────┬───────┘                └────────────┘
                                      │
                               ┌──────▼──────┐
                               │  API Proxy  │ ──HTTP──> 第三方 API
                               └─────────────┘         (GitHub/Notion/...)
                               
┌────────────┐
│ RAG Store  │  ← 文档向量化，Agent 检索后调用
└────────────┘
```

### Monorepo Structure

```
api-to-mcp-gateway/
├── packages/
│   ├── core/          # OpenAPI 解析 → MCP Tool Schema 映射
│   │   ├── parser.ts      # 解析 OpenAPI JSON/YAML，提取 operations
│   │   ├── converter.ts   # operationId → snake_case tool name + JSON Schema
│   │   ├── contracts.ts   # 核心接口 (IParser/IToolRegistry/IApiProxy/IRagStore)
│   │   └── types.ts       # 类型定义
│   │
│   ├── server/        # MCP Server 运行时
│   │   ├── server.ts      # Streamable HTTP server (JSON-RPC 2.0, POST /mcp)
│   │   ├── proxy.ts       # API 请求代理（发起 HTTP 调用到目标 API）
│   │   ├── auth.ts        # Auth 注入（API Key / Bearer / OAuth2）
│   │   └── index.ts
│   │
│   ├── rag/           # RAG 文档检索
│   │   ├── indexer.ts     # API 文档向量化
│   │   ├── retriever.ts   # 语义搜索
│   │   └── store.ts       # 内存向量存储（余弦相似度）
│   │
│   ├── agent/         # Agent 编排层
│   │   ├── orchestrator.ts  # Agent 主循环（RAG → tool call → iterate）
│   │   └── prompts.ts       # System prompt
│   │
│   └── cli/           # CLI 入口
│       └── index.ts       # `api2mcp serve --spec ./api.yaml`
│
├── specs/
│   └── petstore.yaml  # 示例 OpenAPI spec
├── package.json       # pnpm workspace monorepo
└── tsconfig.json
```

## Quick Start

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0

### Installation

```bash
# Clone the repository
git clone https://github.com/PPACT/api-to-mcp-gateway.git
cd api-to-mcp-gateway

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Usage

```bash
# Start with a local OpenAPI spec file
pnpm start -- --spec ./specs/petstore.yaml

# Start with a remote OpenAPI spec URL
pnpm start -- --spec https://petstore.swagger.io/v2/swagger.json

# Custom port and host
pnpm start -- --spec ./specs/github.openapi.json --port 8080 --host 0.0.0.0

# Multiple specs (multi-API aggregation)
pnpm start -- --spec ./specs/github.yaml --spec ./specs/notion.yaml
```

The MCP server starts at `http://127.0.0.1:3000/mcp`. Connect any MCP-compatible client (Claude Desktop, VS Code, etc.) to this endpoint.

### Auth Configuration

Set environment variables for APIs that require authentication:

```bash
# API Key auth
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Bearer token auth
export NOTION_API_KEY=secret_xxxxxxxxxxxx

# Then start the server
pnpm start -- --spec ./specs/github.openapi.json
```

The gateway auto-detects auth requirements. Configure explicitly via the `AuthManager` API for fine-grained control:

```typescript
import { AuthManager } from '@api2mcp/server';

const auth = new AuthManager();
auth.register('github', { type: 'bearer', envVar: 'GITHUB_TOKEN' });
auth.register('notion', { type: 'api_key', headerName: 'Notion-Version', envVar: 'NOTION_API_KEY' });
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test -- --watch

# Build + test
pnpm build && pnpm test
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5 (strict mode) |
| Runtime | Node.js 20+ |
| Package Manager | pnpm workspace |
| MCP Protocol | JSON-RPC 2.0 + Streamable HTTP |
| OpenAPI Parsing | YAML + JSON (vanilla) |
| Validation | Zod |
| Testing | Vitest |
| Vector Store | In-memory (cosine similarity) |

### Core Flow

```
1. Parse OpenAPI Spec
   parser.ts reads JSON/YAML → extracts operations (operationId, method, path, parameters)

2. Convert to MCP Tools
   converter.ts maps operationId to snake_case tool name,
   parameters + requestBody → JSON Schema inputSchema

3. Register Tools
   ToolRegistry stores all tools with their source API metadata

4. Start MCP Server
   Streamable HTTP server listens on /mcp, handles JSON-RPC requests:
   - initialize  → handshake
   - tools/list  → list all generated tools
   - tools/call  → execute tool → proxy HTTP request to target API

5. AI Agent Connects
   Claude/GPT connects via MCP, discovers tools, calls APIs
```

### Naming Convention

| Context | Convention | Example |
|---------|-----------|---------|
| MCP Tool Name | `{source}_{snake_case}` | `github_list_issues`, `petstore_add_pet` |
| TypeScript Interface | PascalCase | `ApiOperation`, `MCPToolDef` |
| File Name | kebab-case | `schema-mapper.ts` |
| Environment Variable | UPPER_SNAKE | `GITHUB_TOKEN` |

### Error Format

All tool execution errors follow a unified format:

```json
{
  "error": {
    "code": "API_ERROR",
    "message": "GitHub API returned 401 — check your GITHUB_TOKEN",
    "suggestion": "Try github_list_issues with owner='octocat'"
  }
}
```

## Design Decisions

- **Streamable HTTP only** — No stdio transport. Gateway needs to serve multiple AI clients simultaneously over the network.
- **Static pre-generation** — Tools are generated at server startup from OpenAPI specs, not dynamically at call time. This gives better discoverability and lower latency.
- **In-memory RAG** — Simple hash-based vector store for demo purposes. Replaceable with LanceDB or Chroma for production.
- **3-package monorepo for P0** — `core` (parsing), `server` (runtime), `cli` (entry). RAG and Agent packages are add-on layers.

## Demo Script

A 3-minute demo narrative for showcasing the project:

```bash
# 1. Start the gateway with Petstore API
pnpm start -- --spec ./specs/petstore.yaml

# 2. In another terminal, use an MCP client to connect
# Claude Desktop config (mcp.json):
{
  "mcpServers": {
    "petstore": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}

# 3. Ask Claude:
#    "Add a new pet named 'Buddy' with status 'available' to the pet store,
#     then find all available pets."
# Claude autonomously:
#   - Calls petstore_add_pet({name: "Buddy", status: "available"})
#   - Calls petstore_find_pets_by_status({status: "available"})
#   - Reports results
```

## Comparison with Alternatives

| Feature | API-to-MCP Gateway | openapi-mcp-gateway (Python) | criteo/openapi-to-mcp |
|---------|-------------------|------------------------------|----------------------|
| Transport | **Streamable HTTP** | stdio | stdio |
| RAG Search | ✅ | ❌ | ❌ |
| Agent Orchestration | ✅ | ❌ | ❌ |
| Multi-API Aggregation | ✅ | ❌ | ❌ |
| Auth Management | ✅ | ❌ | ❌ |
| LLM-Enhanced Descriptions | Planned (P1) | ❌ | ✅ |

## License

MIT
