# API-to-MCP Gateway — 项目 Spec

> 将任意 REST API（OpenAPI/Swagger）自动转换为 MCP Server，让 AI Agent 能直接调用第三方 API。

---

## 1. 产品定位

### 一句话描述
输入 OpenAPI 文档 → 自动生成 MCP Server → AI（Claude/GPT/Codex）直接调用 API。

### 和「智能客服」的区别
| 客服 | API-to-MCP Gateway |
|------|-------------------|
| 问答匹配 | 协议转换 + 动态工具调用 |
| 静态知识库 | 实时 API 调用 |
| 只读 | 可读写（CRUD） |
| 单系统 | 桥接任意第三方 API |

---

## 2. 核心功能

### P0（核心链路）
1. **OpenAPI 解析** — 输入 Swagger/OpenAPI 2.0/3.0 JSON 或 URL，解析出所有 endpoints
2. **MCP Tool 生成** — 每个 API operation → 一个 MCP tool（name/description/inputSchema）
3. **MCP Server 运行时** — Streamable HTTP transport，标准 JSON-RPC 2.0 协议
4. **API 代理执行** — 当 AI 调用 MCP tool 时，实际发出 HTTP 请求到目标 API
5. **RAG 文档增强** — 把 API 文档向量化，Agent 可以先检索再调用（不盲调）

### P1（加分项）
6. **动态 Gateway 模式**（参考 openapi-mcp-gateway）— 不预生成 tool，而是 3 个 meta-tool：`list_operations` / `get_operation` / `call_operation`，适合超大型 API
7. **参数无参 GET 自动提升为 Resource** — `GET /users` 无参数 → MCP resource 而非 tool
8. **LLM 增强描述** — 用 LLM 优化 API 的 description 和参数说明，提升 AI 调用准确率
9. **Auth 管理** — 支持 API Key / Bearer Token / OAuth 配置

### P2（可选）
10. **多 API 聚合** — 一个 MCP Server 同时暴露多个 API 的工具
11. **Web UI** — 上传 OpenAPI 文件 → 预览生成的 tools → 一键启动 MCP Server
12. **调用日志/调试面板** — 查看 Agent 调用了哪些 API，请求/响应内容

---

## 3. 技术栈

| 层 | 技术 | 原因 |
|---|---|---|
| **语言** | TypeScript | MCP 官方 SDK 最成熟；前后端统一 |
| **MCP SDK** | `@modelcontextprotocol/sdk` | 官方 SDK，Streamable HTTP transport |
| **OpenAPI 解析** | `@apidevtools/swagger-parser` + `openapi-types` | 成熟的 OpenAPI 解析/校验/dereference |
| **HTTP 客户端** | `undici` (Node 原生 fetch) | 无额外依赖 |
| **向量数据库** | `chromadb` (client) 或 `sqlite-vss` | 轻量，本地运行 |
| **Embedding** | 调用 Claude API / OpenAI `text-embedding-3-small` | RAG 文档检索 |
| **LLM** | `@anthropic-ai/sdk` (Claude Opus 4.8) | 增强描述 + Agent 编排 |
| **运行时** | Node.js + Express | Streamable HTTP transport 需要 HTTP server |
| **前端（P2）** | React + Vite + Tailwind | 可视化操作界面 |

---

## 4. 项目结构

```
api-to-mcp-gateway/
├── packages/
│   ├── core/                    # 核心：OpenAPI 解析 → MCP Schema 映射
│   │   ├── src/
│   │   │   ├── parser.ts        # OpenAPI 解析入口
│   │   │   ├── converter.ts     # Operation → MCP Tool schema
│   │   │   ├── resolver.ts      # $ref / allOf / oneOf 解析
│   │   │   ├── enhancer.ts      # LLM 增强 description
│   │   │   └── types.ts         # 类型定义
│   │   └── package.json
│   │
│   ├── server/                  # MCP Server 运行时
│   │   ├── src/
│   │   │   ├── index.ts         # Server 入口 + Streamable HTTP
│   │   │   ├── tools.ts         # 动态注册/执行 MCP tools
│   │   │   ├── resources.ts     # Resource 注册
│   │   │   ├── proxy.ts         # API 请求代理（发起 HTTP 调用）
│   │   │   ├── auth.ts          # Auth 注入
│   │   │   └── session.ts       # 会话管理
│   │   └── package.json
│   │
│   ├── rag/                     # RAG 文档检索
│   │   ├── src/
│   │   │   ├── indexer.ts       # 文档切片 + 向量化
│   │   │   ├── retriever.ts     # 查询检索
│   │   │   └── store.ts         # 向量存储封装
│   │   └── package.json
│   │
│   ├── agent/                   # Agent 编排层
│   │   ├── src/
│   │   │   ├── orchestrator.ts  # Agent 主循环
│   │   │   ├── prompts.ts       # System prompts
│   │   │   └── tools.ts         # Agent 自己的 tools（RAG 检索等）
│   │   └── package.json
│   │
│   ├── cli/                     # CLI 入口
│   │   └── src/
│   │       └── index.ts         # `npx api2mcp serve --spec ./api.yaml`
│   │
│   └── web/                     # Web UI（P2）
│       └── src/
│           ├── App.tsx
│           ├── components/
│           │   ├── SpecUploader.tsx
│           │   ├── ToolPreview.tsx
│           │   └── ServerPanel.tsx
│           └── pages/
│               └── Dashboard.tsx
│
├── package.json                 # monorepo root (pnpm workspace)
├── tsconfig.json
└── SPEC.md
```

---

## 5. 核心流程

### 5.1 启动流程
```
用户上传/指定 OpenAPI Spec
    │
    ▼
Parser 解析 spec，提取所有 operations
    │
    ▼
Converter 将每个 operation 转为 MCP tool schema
    ├── operationId → tool name
    ├── parameters → inputSchema.properties
    ├── requestBody → inputSchema.properties
    └── responses → outputSchema (可选)
    │
    ▼
Enhancer (可选) LLM 优化 description
    │
    ▼
RAG Indexer 将 API 文档切片向量化
    │
    ▼
MCP Server 启动 (Streamable HTTP on localhost:3000/mcp)
    │
    ▼
Claude / AI Client 连接 MCP Server → 发现 tools → 调用 API
```

### 5.2 Agent 调用流程
```
User: "帮我在 Notion 创建一个数据库，把 GitHub Issue 列表放进去"
    │
    ▼
Agent Orchestrator
    ├── 1. RAG 检索 "Notion 创建数据库" → 获得相关 API 文档片段
    ├── 2. Claude 决定调用 notion_create_database tool
    ├── 3. MCP Server proxy 发出 HTTP POST https://api.notion.com/v1/databases
    ├── 4. Claude 决定调用 github_list_issues tool
    ├── 5. MCP Server proxy 发出 HTTP GET https://api.github.com/repos/X/Y/issues
    └── 6. Claude 决定调用 notion_append_blocks tool 写入内容
    │
    ▼
结果返回给用户
```

---

## 6. API 设计

### 6.1 MCP Server 端点（Streamable HTTP）

```
POST /mcp    → JSON-RPC 消息入口
GET  /mcp    → SSE stream（服务端推送）
```

支持的 JSON-RPC 方法：
- `initialize` — 握手
- `tools/list` — 列出所有生成的 tools
- `tools/call` — 执行 tool → 代理 HTTP 请求到目标 API
- `resources/list` — 列出自动提升的 resources
- `resources/read` — 读取 resource

### 6.2 管理 API（Web UI 用，P2）

```
POST   /api/specs          — 上传/注册 OpenAPI spec
GET    /api/specs/:id       — 获取 spec 信息
GET    /api/specs/:id/tools — 预览生成的 tools
POST   /api/specs/:id/start — 启动 MCP server
DELETE /api/specs/:id/stop  — 停止 MCP server
GET    /api/logs            — 调用日志
```

---

## 7. 数据流

```
                   ┌──────────────┐
                   │   RAG Store  │
                   │  (Chromadb)  │
                   └──────┬───────┘
                          │ 检索文档片段
                          ▼
┌────────┐   OpenAPI   ┌──────────┐   MCP tools   ┌────────────┐
│  User  │ ──────────> │  Gateway │ <───────────> │ AI Agent   │
│        │ <────────── │  Server  │ ─────────────>│ (Claude)   │
└────────┘   结果       └────┬─────┘  tools/call   └────────────┘
                          │
                    ┌─────▼──────┐
                    │  API Proxy │ ──HTTP──> 第三方 API
                    └────────────┘          (Notion/GitHub/...)
```

---

## 8. 开发计划（2 周）

### Week 1：核心链路（P0）
| 天 | 任务 |
|---|------|
| 1-2 | `packages/core` — OpenAPI 解析 + MCP tool schema 转换 |
| 3-4 | `packages/server` — MCP Server 运行时（Streamable HTTP + 工具注册 + API 代理） |
| 5 | `packages/cli` — CLI 入口 `api2mcp serve` |
| 6-7 | 联调 + 端到端测试（用一个真实 API 验证） |

### Week 2：增强功能（P1）
| 天 | 任务 |
|---|------|
| 8-9 | `packages/rag` — 文档向量化 + 检索 |
| 10-11 | `packages/agent` — Agent 编排层 + 多步调用 |
| 12 | Auth 管理 + Error 处理完善 |
| 13-14 | README + 文档完善 + 最终测试 |

---

## 10. 关键开源参考

| 项目 | 借鉴点 | 我们的改进 |
|------|--------|-----------|
| [openapi-mcp-gateway](https://pypi.org/project/openapi-mcp-gateway/) | 3 meta-tool 模式 | +Streamable HTTP +RAG +Agent |
| [criteo/openapi-to-mcp](https://github.com/criteo/openapi-to-mcp) | operationId→tool 映射 | +多 transport +LLM 增强 |
| [cnoe-io/openapi-mcp-codegen](https://github.com/cnoe-io/openapi-mcp-codegen) | LLM 增强 pipeline | 运行时动态生成而非代码生成 |
