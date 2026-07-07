# Task Checklist: API-to-MCP Gateway

## Phase: Slice 1 -- Min Viable Chain

### Checkpoint: Slice 1 Ready
- [ ] All Slice 1 tests pass
- [ ] pnpm build succeeds
- [ ] Petstore spec -> 1 MCP tool def verified

---

## Task 1: OpenAPI Parser
**Description:** Implement core/parser.ts -- reads OpenAPI spec, validates, extracts operations.
**Acceptance:** Parse JSON OpenAPI 3.0, extract operationId/method/path/params, reject invalid specs.
**Scope:** S (1-2 files) | **Deps:** None

## Task 2: MCP Tool Converter
**Description:** Implement core/converter.ts -- operation -> MCP tool def with snake_case naming.
**Acceptance:** Snake_case tool names, parameter mapping, required fields, meaningful descriptions.
**Scope:** S (1-2 files) | **Deps:** Task 1

## Phase: Slice 2 -- Full Server + CLI

### Checkpoint: Slice 2 Ready
- [ ] Server starts on localhost:3000/mcp, tools/list works, tools/call proxies API calls

## Task 3: Tool Registry
**Description:** Implement server/tools.ts -- register, list, execute MCP tools.
**Acceptance:** CRUD operations, unified error format on failure.
**Scope:** S (1-2 files) | **Deps:** Task 2

## Task 4: API Proxy
**Description:** Implement server/proxy.ts -- HTTP proxy to target APIs with URL interpolation.
**Acceptance:** URL template interpolation, JSON serialization, error handling (4xx/5xx).
**Scope:** S (1-2 files) | **Deps:** Task 2

## Task 5: MCP Server Entry
**Description:** Implement server/index.ts -- Streamable HTTP MCP server wiring.
**Acceptance:** Initialize handshake, tools/list, tools/call, bind 127.0.0.1.
**Scope:** M (3-5 files) | **Deps:** Task 3, 4

## Task 6: CLI Entry
**Description:** Implement cli/index.ts -- command-line interface.
**Acceptance:** --spec, --port, --host flags, --help, remote spec URL support.
**Scope:** S (1-2 files) | **Deps:** Task 5

## Phase: Slice 3 -- Auth Injection

## Task 7: Auth Injection
**Description:** Implement server/auth.ts -- inject auth headers from env vars.
**Acceptance:** API Key + Bearer, multi-API coexistence, no credential leaks.
**Scope:** S (1-2 files) | **Deps:** Task 4

## Phase: Slice 4 -- Multi-API Aggregation

## Task 8: Multi-Spec Support
**Description:** Extend registry/CLI for multiple --spec flags.
**Acceptance:** Namespaced tools, no collisions, independent auth per spec.
**Scope:** S (1-2 files) | **Deps:** Task 6

## Phase: Slice 5 -- RAG Enhancement

## Task 9: RAG Indexer
**Description:** Implement rag/indexer.ts + rag/store.ts -- chunk docs, in-memory vector store.
**Acceptance:** Chunk operations, index from ApiOperation[].
**Scope:** M (3-5 files) | **Deps:** Task 2

## Task 10: RAG Retriever
**Description:** Implement rag/retriever.ts -- semantic search.
**Acceptance:** Top-K results with similarity scores, graceful empty results.
**Scope:** S (1-2 files) | **Deps:** Task 9

## Phase: Slice 6 -- Agent Orchestration

## Task 11: Agent Orchestrator
**Description:** Implement agent/orchestrator.ts -- main loop with RAG + Claude.
**Acceptance:** Multi-step task execution, Zod validation of LLM output, max iteration limit.
**Scope:** M (3-5 files) | **Deps:** Task 10, 5

## Task 12: Agent Prompts
**Description:** Implement agent/prompts.ts + tools.ts.
**Acceptance:** System prompt for RAG-first discovery, agent tools (rag_search, list_available_tools).
**Scope:** S (1-2 files) | **Deps:** Task 11