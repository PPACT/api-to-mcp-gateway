# 文档索引

API-to-MCP Gateway —— 把 OpenAPI 文档变成**安全、可治理、可审计**的 MCP 工具层，让 AI Agent **按权限**调用现有 API。

## 从这里开始

| 文档 | 讲什么 |
|---|---|
| [architecture.md](./architecture.md) | 架构、数据流、包职责、扩展点、已知简化 |
| [usage.md](./usage.md) | 安装、CLI 用法、接入 MCP 客户端、评分 / 增强 / Agent 模式 |
| [security.md](./security.md) | 认证模型、凭证处理、**权限与审计的当前边界** |

## 能力矩阵

> ⚠️ **本表描述代码现状，不是路线图。** 未实现的项如实标注为 ❌。
> ✅ 已实现 ｜ 🟡 部分实现 / 有边界 ｜ ❌ 尚未实现

### 转换与工具层

| 能力 | 状态 | 说明 ｜ 源码锚点 |
|---|---|---|
| OpenAPI 3.x 解析（JSON / YAML） | ✅ | `core/src/parser.ts` |
| **Swagger 2.0 解析** | ❌ | 解析器要求顶层存在 `openapi` 字段，Swagger 2.0 的 `swagger: "2.0"` 会被判为非法文档 |
| operation → MCP tool（snake_case + JSON Schema） | ✅ | `core/src/converter.ts`，工具名 `{source}_{operation_id}` |
| `$ref` / 嵌套对象 / 数组 `items` 解析 | ❌ | 转换器只取 `type` / `description` / `enum` 三个字段 |
| 多 spec 合并到一个 Server | ✅ | CLI 支持重复 `--spec` |
| 远程 spec（URL） | ✅ | 下载到临时目录后解析 |

### 运行时与治理层

| 能力 | 状态 | 说明 ｜ 源码锚点 |
|---|---|---|
| MCP JSON-RPC 2.0（`initialize` / `tools/list` / `tools/call`） | ✅ | `server/src/server.ts`，协议版本 `2024-11-05` |
| Streamable HTTP（SSE 流式 / 会话） | ❌ | 仅实现 `POST /mcp` 单次请求—响应 |
| 请求转发 + 超时（30s） | ✅ | 执行：`server/src/proxy.ts`；超时值 `30000` 定在 `server/src/tools.ts:51` |
| 非 JSON 响应体的透传 | ❌ | 响应强制按 JSON 解析，解析失败时**静默回退为空对象** |
| 参数校验 / 白名单 / 路径转义 | ❌ | `server/src/tools.ts` 直接拼接并转发调用方入参 |
| **按权限调用（per-tool 授权）** | ❌ | 代码中无权限 / 策略 / 角色相关实现 |
| **审计日志（调用留痕）** | ❌ | 代码中无审计相关实现 |
| MCP 端点自身的鉴权 | ❌ | 端点无鉴权，默认仅绑定 `127.0.0.1` |

### 文档质量层

| 能力 | 状态 | 说明 ｜ 源码锚点 |
|---|---|---|
| API 文档质量评分（5 维 / 100 分 / 三档） | ✅ | `core/src/scorer.ts`：描述完整度 · Schema 覆盖度 · 示例丰富度 · 错误码清晰度 · 命名质量 |
| 三档暴露建议 | ✅ | `expose` / `enhance_first` / `do_not_expose` |
| LLM 自动增强描述（summary / description） | ✅ | `core/src/enhancer.ts`，需 `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY` |
| 凭证自动识别 | 🟡 | `server/src/auth.ts` + CLI 的 `autoDetectAuth`：仅 bearer，且**只识别少量硬编码的服务名**；其余服务需另行注册 |

### Agent 与检索层

| 能力 | 状态 | 说明 ｜ 源码锚点 |
|---|---|---|
| 一次性任务编排（最多 10 轮） | ✅ | `agent/src/orchestrator.ts` |
| 语义检索（RAG） | 🟡 | `rag/`：内存向量库 + 余弦检索 |
| 检索质量 | 🟡 | 无 `OPENAI_API_KEY` 时**回退为哈希向量**（`core/src/llm.ts`），仅适合演示，且不打印任何提示 |

## 一句话概括边界

**已能跑通**：读 spec → 转 MCP tool → 起 Server → 转发调用 →（可选）评分、增强、Agent 编排。

**尚未具备**：按权限调用、审计日志、参数校验、Swagger 2.0、`$ref` 解析、Streamable HTTP。
以「安全治理层」为目标时，**上表标 ❌ 的项即为差距**。
