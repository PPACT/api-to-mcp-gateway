# API-to-MCP Gateway

将任意 OpenAPI/Swagger 文档转换为运行中的 MCP Server，AI Agent 即可直接调用这些 API。

## 快速开始

```
pnpm install
pnpm test
pnpm start -- --spec ./specs/petstore.yaml
```

MCP Server 监听 `http://127.0.0.1:3000/mcp`，可连接 Claude Desktop、Codex 或任意 MCP 客户端。

## 工作原理

```
OpenAPI 文档 --> Parser --> Converter --> ToolRegistry --> MCP Server (JSON-RPC)
                                                              |
                                                   API Proxy --HTTP--> 目标 API
                                                   AuthManager
                                                   RAG Retriever
                                                   Agent Orchestrator
```

1. 解析 — 从文档中提取所有端点和参数
2. 转换 — 将每个 operation 映射为 MCP tool（snake_case 命名，JSON Schema）
3. 服务 — 通过 Streamable HTTP + JSON-RPC 2.0 暴露 tools
4. 代理 — 将 tool 调用转发为真实 HTTP 请求

## 项目结构

```
packages/
  core/       OpenAPI 解析 + tool schema 转换
  server/     MCP 运行时：tools, proxy, auth, JSON-RPC
  cli/        CLI 入口（支持多 spec、远程 URL）
  rag/        向量存储 + 语义搜索
  agent/      编排器：RAG -> LLM -> tool 调用 -> 循环
specs/        示例 OpenAPI 文档（Petstore）
```

## 配置

认证通过环境变量注入（命名规则 `{SOURCE}_TOKEN` 或 `{SOURCE}_API_KEY`）：

```
export GITHUB_TOKEN=ghp_xxx
export NOTION_API_KEY=secret_xxx
pnpm start -- --spec ./github.yaml --spec ./notion.yaml
```

多个 `--spec` 参数可将不同 API 的工具注册到同一个 Server。

## 技术栈

TypeScript 5 (strict)，Node.js 20+，pnpm workspace monorepo。
MCP SDK，@apidevtools/swagger-parser，yaml，Vitest。

## 命令

```
pnpm install    安装依赖
pnpm test       运行全部测试
pnpm build      编译 TypeScript
pnpm start -- --spec <path|url>   启动 MCP Gateway
```
