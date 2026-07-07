# Implementation Plan: API-to-MCP Gateway

## Overview
Build P0 core chain: parse OpenAPI spec -> generate MCP tools -> run Streamable HTTP server -> proxy API calls.
6 vertical slices, each delivering a working, testable increment. TDD throughout.

## Architecture Decisions
- Streamable HTTP only -- single /mcp endpoint, supports multiple AI clients
- 3-package monorepo (core/server/cli) for P0, rag/agent deferred to P1
- Static pre-generation mode for P0; dynamic meta-tool mode as P1 enhancement
- In-memory RAG for initial slice; LanceDB backend as later optimization

## Vertical Slices

### Slice 1: Min Viable Chain (Task 1-2)
Parse Petstore spec -> 1 MCP tool -> verify via unit/integration tests.

### Slice 2: Full Server + CLI (Task 3-6)
MCP Server (Streamable HTTP) + tool registry + API proxy + CLI entry.

### Slice 3: Auth Injection (Task 7)
API Key / Bearer Token support via env vars.

### Slice 4: Multi-API Aggregation (Task 8)
Two specs (GitHub + Notion) -> tools coexist in one server.

### Slice 5: RAG Enhancement (Task 9-10)
Document indexing + semantic search -> AI retrieves before calling.

### Slice 6: Agent Orchestration (Task 11-12)
Multi-step task execution with Claude API.