# 架构

## 总览

```
OpenAPI 文档 ──▶ Parser ──▶ Converter ──▶ ToolRegistry ──▶ MCP Server (JSON-RPC)
                                              │
                                              ▼
                                       API Proxy ──HTTP──▶ 目标 API
                                       AuthManager
                                       RAG Retriever
                                       Agent Orchestrator
```

1. **解析** —— 从文档中提取所有 operation（路径、方法、参数、请求体、响应）
2. **转换** —— 每个 operation 映射为一个 MCP tool：名称 `{source}_{snake_case_operation_id}`，参数转为 JSON Schema
3. **服务** —— 通过 JSON-RPC 2.0 暴露 `tools/list` 与 `tools/call`
4. **代理** —— 把 tool 调用拼装为真实 HTTP 请求，注入凭证后转发，结果回传为 tool 结果

## 包职责与依赖拓扑

⚠️ **`core` 是根依赖** —— 改动它的公开导出 / 类型 / 签名，会影响全部下游包。

| 包 | 依赖 | 职责 |
|---|---|---|
| `packages/core` | 无（根） | OpenAPI 解析 · tool schema 转换 · 评分（scorer）· LLM 增强（enhancer）· LLM / embedding 后端工厂 |
| `packages/server` | `core` | MCP 运行时：工具注册表 · HTTP 代理 · 凭证注入 · JSON-RPC 处理 |
| `packages/rag` | `core` | 内存向量库 · 索引 · 语义检索 |
| `packages/agent` | `core` · `rag` | 编排器：检索 → LLM → 工具调用 → 循环 |
| `packages/cli` | 以上全部 | 命令行入口：多 spec / 远程 URL / render / 评分 / 增强 / Agent 模式 |

## 关键接口（`core/src/contracts.ts`）

各层之间通过接口而非具体类交互，便于替换实现：

- `IApiProxy` —— HTTP 转发
- `IToolRegistry` —— 工具注册与执行
- `IOperationParser` —— operation 来源
- `ILLMBackend` —— LLM 调用（Anthropic / OpenAI 两种实现，见 `core/src/llm.ts`）

## 一次 `tools/call` 的完整路径

```
MCP 客户端 ──POST /mcp──▶ server.ts:handleRequest
                            └─▶ ToolRegistry.execute(name, args)
                                  ├─ 查找 tool（不存在 → TOOL_NOT_FOUND）
                                  ├─ interpolatePath()  用参数替换 {path} 占位
                                  ├─ extractQueryParams() 其余参数 → query string
                                  ├─ AuthManager.getHeaders(source) → Authorization
                                  └─▶ ApiProxy.execute() ──fetch──▶ 目标 API
                                        └─ 响应 JSON → 作为 tool 文本结果返回
```

## 数据模型要点

- **source** —— 一个 API 来源（spec 的 `servers[0].url` 作为 baseUrl，`info.title` 归一化为 source 名）
- **tool 名** —— `{source}_{snake_case}`，例如 `petstore_get_pet_by_id`
- **参数去向** —— 路径占位符被替换进 URL；其余参数：`GET` 进 query string，非 `GET` 整体作为 JSON 请求体
- **无状态** —— 每次调用独立，无会话、无跨调用上下文（Agent 模式内部维持自己的消息列表）

## 扩展点

| 想扩展 | 实现接口 | 注册位置 |
|---|---|---|
| 换掉 HTTP 转发层（如加签名、加限流） | `IApiProxy` | 构造 `ToolRegistry` 时注入 |
| 换掉 LLM 供应商 | `ILLMBackend` | `core/src/llm.ts` 的工厂 |
| 换掉向量存储（接持久化 / 外部服务） | `rag/src/store.ts` 的存储接口 | `RAGIndexer` / `RAGRetriever` 构造时注入 |
| 加新的认证方式（如 API Key 头、OAuth） | `AuthManager.register()` | 启动时按 source 注册 |

## 已知简化（不是缺陷清单，是**当前边界**）

> 出自源码，便于判断适用场景；详见 [README 的能力矩阵](./README.md#能力矩阵)。

1. **解析深度有限** —— 不解析 `$ref`，不展开嵌套对象 / 数组；schema 只保留 `type` / `description` / `enum`
2. **`operationId` 缺失即跳过** —— 无 `operationId` 的 operation 会被静默忽略（不报错）
3. **Swagger 2.0 不支持** —— 顶层必须有 `openapi` 字段
4. **传输层是单次 POST** —— 不是 Streamable HTTP：无 SSE、无会话 ID、无 `notifications/*`
5. **响应必须是 JSON** —— 非 JSON 响应会被静默替换为空对象
6. **无参数校验** —— 调用方入参直接拼进 URL / 请求体
7. **Agent 模式是单次任务** —— 跑完即退出，不起 Server，也不持久化任何状态
