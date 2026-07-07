# API-to-MCP Gateway

> 输入 OpenAPI 文档 → 自动生成 MCP Server → AI Agent 直接调用第三方 API

将任意 REST API（OpenAPI/Swagger）自动转换为 MCP Server，让 Claude、GPT 等 AI Agent 通过 MCP 协议直接调用第三方 API。本仓库为求职展示项目，暂不考虑开源。

## 核心功能

- **OpenAPI → MCP Tool 自动生成** — 解析 OpenAPI 2.0/3.0 文档（JSON/YAML），自动生成 MCP tool 定义，包含蛇形命名、完整 inputSchema 和描述
- **Streamable HTTP 传输** — 基于 HTTP 的 MCP 协议（`POST /mcp`），支持多 AI 客户端同时连接，不同于 stdio 只能单客户端
- **API 代理执行** — AI 调用 MCP tool 时，网关实际发出 HTTP 请求到目标 API，并将结果返回给 AI
- **RAG 文档增强** — 将 API 文档向量化，Agent 可以先检索相关操作再调用，避免"盲调"
- **Agent 编排** — 内置 Agent 循环：RAG 搜索 → 工具选择 → API 执行 → 迭代，支持多步复杂任务
- **多 API 聚合** — 一个 MCP Server 同时暴露多个 OpenAPI 文档的工具，互不冲突
- **Auth 鉴权管理** — 支持 API Key / Bearer Token / OAuth2，通过环境变量注入，绝不硬编码

## 架构总览

```
┌────────────┐   OpenAPI 文档   ┌──────────────┐   MCP tools    ┌────────────┐
│  用户/CLI  │ ───────────────> │   Gateway    │ <────────────> │ AI Agent   │
│            │                  │   Server     │                │ (Claude)   │
└────────────┘                  └──────┬───────┘                └────────────┘
                                      │
                               ┌──────▼──────┐
                               │  API 代理层 │ ──HTTP──> 第三方 API
                               └─────────────┘         (GitHub/飞书/Notion...)

┌────────────┐
│ RAG 向量库 │  ← API 文档向量化，Agent 先检索再调用
└────────────┘
```

### 项目结构

```
api-to-mcp-gateway/
├── packages/
│   ├── core/                # 核心：OpenAPI 解析 → MCP Tool Schema 映射
│   │   ├── parser.ts            # 解析 OpenAPI JSON/YAML，提取 operations
│   │   ├── converter.ts         # operationId → snake_case 工具名 + JSON Schema
│   │   ├── contracts.ts         # 核心接口（IParser/IToolRegistry/IApiProxy/IRagStore）
│   │   └── types.ts             # 全部类型定义
│   │
│   ├── server/              # MCP Server 运行时
│   │   ├── server.ts            # Streamable HTTP 服务（JSON-RPC 2.0，POST /mcp）
│   │   ├── proxy.ts             # API 请求代理（发 HTTP 请求到目标 API）
│   │   ├── auth.ts              # Auth 注入（API Key / Bearer / OAuth2）
│   │   └── index.ts
│   │
│   ├── rag/                 # RAG 文档检索
│   │   ├── indexer.ts           # API 文档切片 + 向量化
│   │   ├── retriever.ts         # 语义搜索
│   │   └── store.ts             # 内存向量存储（余弦相似度）
│   │
│   ├── agent/               # Agent 编排层
│   │   ├── orchestrator.ts      # Agent 主循环（RAG 搜索 → 工具调用 → 迭代）
│   │   └── prompts.ts           # System prompt
│   │
│   └── cli/                 # CLI 命令行入口
│       └── index.ts             # `api2mcp serve --spec ./api.yaml`
│
├── specs/
│   └── petstore.yaml        # 示例 OpenAPI 文档
├── package.json             # pnpm workspace monorepo
└── tsconfig.json
```

## 快速开始

### 环境要求

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0

### 安装

```bash
# 克隆仓库
git clone https://github.com/PPACT/api-to-mcp-gateway.git
cd api-to-mcp-gateway

# 安装依赖
pnpm install

# 构建所有包
pnpm build
```

### 使用

```bash
# 使用本地 OpenAPI 文档启动
pnpm start -- --spec ./specs/petstore.yaml

# 使用远程 OpenAPI 文档启动
pnpm start -- --spec https://petstore.swagger.io/v2/swagger.json

# 自定义端口和监听地址
pnpm start -- --spec ./specs/github.openapi.json --port 8080 --host 0.0.0.0

# 多文档聚合（同时暴露多个 API 的工具）
pnpm start -- --spec ./specs/github.yaml --spec ./specs/notion.yaml
```

MCP Server 启动后监听 `http://127.0.0.1:3000/mcp`。将任意支持 MCP 的客户端（Claude Desktop、VS Code 等）连接到此端点即可。

### 配置 Auth

需要鉴权的 API，通过环境变量设置密钥：

```bash
# API Key 模式
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Bearer Token 模式
export NOTION_API_KEY=secret_xxxxxxxxxxxx

# 然后启动服务
pnpm start -- --spec ./specs/github.openapi.json
```

网关会自动检测并注入 Auth。也可通过 `AuthManager` API 精细化控制：

```typescript
import { AuthManager } from '@api2mcp/server';

const auth = new AuthManager();
auth.register('github', { type: 'bearer', envVar: 'GITHUB_TOKEN' });
auth.register('notion', { type: 'api_key', headerName: 'Notion-Version', envVar: 'NOTION_API_KEY' });
```

## 开发

```bash
pnpm install      # 安装依赖
pnpm build        # 构建所有包
pnpm test         # 运行全部测试
pnpm test --watch # 监听模式
```

### 技术栈

| 层 | 技术 |
|---|------|
| 语言 | TypeScript 5（strict 模式） |
| 运行时 | Node.js 20+ |
| 包管理 | pnpm workspace |
| MCP 协议 | JSON-RPC 2.0 + Streamable HTTP |
| OpenAPI 解析 | 原生 YAML + JSON 解析 |
| 校验 | Zod |
| 测试 | Vitest |
| 向量存储 | 内存（余弦相似度） |

### 核心流程

```
1. 解析 OpenAPI 文档
   parser.ts 读取 JSON/YAML → 提取全部 operation（operationId、method、path、parameters）

2. 转换为 MCP Tool
   converter.ts 将 operationId 映射为 snake_case 工具名，
   parameters + requestBody → JSON Schema inputSchema

3. 注册工具
   ToolRegistry 存储所有工具及其对应 API 的元数据

4. 启动 MCP Server
   Streamable HTTP 服务监听 /mcp，处理 JSON-RPC 请求：
   - initialize  → 握手
   - tools/list  → 列出所有工具
   - tools/call  → 执行工具 → 代理 HTTP 请求到目标 API

5. AI Agent 连接
   Claude/GPT 通过 MCP 协议连接 → 发现工具 → 调用 API
```

### 命名规范

| 场景 | 规范 | 示例 |
|------|------|------|
| MCP 工具名 | `{数据源}_{蛇形命名}` | `github_list_issues`、`petstore_add_pet` |
| TypeScript 接口 | PascalCase | `ApiOperation`、`MCPToolDef` |
| 文件名 | kebab-case | `schema-mapper.ts` |
| 环境变量 | UPPER_SNAKE | `GITHUB_TOKEN` |

### 统一错误格式

所有工具执行错误统一使用以下结构：

```json
{
  "error": {
    "code": "API_ERROR",
    "message": "GitHub API 返回 401 —— 请检查 GITHUB_TOKEN",
    "suggestion": "试试 github_list_issues 并传入 owner='octocat'"
  }
}
```

## 设计决策

- **只用 Streamable HTTP** — 不用 stdio。网关需要同时服务多个 AI 客户端，stdio 只能一对一
- **静态预生成模式** — 启动时一次性从 OpenAPI 文档生成全部工具，而非运行时动态生成，发现性更好、延迟更低
- **内存 RAG** — 简单哈希向量存储，面向 Demo 场景。生产环境可替换为 LanceDB 或 Chroma
- **三层 P0 monorepo** — `core`（解析+转换）、`server`（运行时+代理）、`cli`（命令行入口）。RAG 和 Agent 为增强层

## Demo 演示脚本

3 分钟面试演示流程：

```bash
# 1. 用 Petstore API 启动网关
pnpm start -- --spec ./specs/petstore.yaml

# 2. 在 Claude Desktop 中配置连接（mcp.json）：
{
  "mcpServers": {
    "petstore": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}

# 3. 对 Claude 说：
#    "帮我在宠物店添加一只叫 Buddy、状态为 available 的新宠物，
#     然后查出所有状态为 available 的宠物列表。"
#
# Claude 自主完成：
#   - 调用 petstore_add_pet({name: "Buddy", status: "available"})
#   - 调用 petstore_find_pets_by_status({status: "available"})
#   - 汇总结果返回给用户
```

## 面试叙事

> "我输入飞书/Notion/GitHub 的 OpenAPI 文档，平台自动生成 MCP Server。然后让 Claude 通过这个 MCP Server 直接操作这些平台——比如「帮我在 Notion 创建一个数据库，把 GitHub Issue 列表写进去」——Agent 自主编排多步 API 调用完成这个任务。"

### 技术亮点

1. **协议转换链路** — OpenAPI Schema → JSON Schema → MCP inputSchema 的完整映射
2. **Streamable HTTP** — MCP 生态中率先用 Streamable HTTP 替代 stdio，支持远程多客户端
3. **RAG 增强** — Agent 先检索 API 文档再调用，不盲调，提升准确率
4. **Auth 零泄漏** — 密钥只走环境变量，错误日志和返回内容中绝不出现

### 与现有方案对比

| 功能 | 本项目 | openapi-mcp-gateway (Python) | criteo/openapi-to-mcp |
|------|--------|------------------------------|----------------------|
| 传输协议 | **Streamable HTTP** | stdio | stdio |
| RAG 文档检索 | ✅ | ❌ | ❌ |
| Agent 编排 | ✅ | ❌ | ❌ |
| 多 API 聚合 | ✅ | ❌ | ❌ |
| Auth 管理 | ✅ | ❌ | ❌ |
| LLM 增强描述 | 规划中（P1） | ❌ | ✅ |

## 版权说明

本项目为个人求职作品展示，仅作技术演示用途，暂不考虑开源。保留所有权利。
