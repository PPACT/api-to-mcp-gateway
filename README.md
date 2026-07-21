# API-to-MCP Gateway

Convert any OpenAPI/Swagger spec into a running MCP Server.
AI agents can then call those APIs directly.

## Quick Start

```
pnpm install
pnpm test
pnpm start -- --spec ./specs/petstore.yaml
```

The MCP server listens at `http://127.0.0.1:3000/mcp`.
Connect Claude Desktop, Codex, or any MCP client.

## How It Works

```
OpenAPI Spec --> Parser --> Converter --> ToolRegistry --> MCP Server (JSON-RPC)
                                                              |
                                                   API Proxy --HTTP--> Target API
                                                   AuthManager
                                                   RAG Retriever
                                                   Agent Orchestrator
```

1. Parse - extract every endpoint and parameter from the spec
2. Convert - map each operation to an MCP tool (snake_case name, JSON Schema)
3. Serve - expose tools over Streamable HTTP with JSON-RPC 2.0
4. Proxy - forward tool calls as real HTTP requests

## Project Structure

```
packages/
  core/       OpenAPI parsing + tool schema conversion
  server/     MCP runtime: tools, proxy, auth, JSON-RPC
  cli/        CLI entry (multi-spec, remote URL support)
  rag/        Vector store + semantic search
  agent/      Orchestrator: RAG -> LLM -> tool calls -> loop
specs/        Sample OpenAPI specs (Petstore)
```

## Configuration

Auth via environment variables (pattern `{SOURCE}_TOKEN` or `{SOURCE}_API_KEY`):

```
export GITHUB_TOKEN=ghp_xxx
export NOTION_API_KEY=secret_xxx
pnpm start -- --spec ./github.yaml --spec ./notion.yaml
```

Multiple `--spec` flags register tools from different APIs into one server.

## Tech Stack

TypeScript 5 (strict), Node.js 20+, pnpm workspace monorepo.
MCP SDK, @apidevtools/swagger-parser, yaml, Vitest.

## Commands

```
pnpm install    Install dependencies
pnpm test       Run all tests (53 tests, 8 suites)
pnpm build      Compile TypeScript
pnpm start -- --spec <path|url>   Start MCP gateway
```
