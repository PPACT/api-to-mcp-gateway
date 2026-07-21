# API-to-MCP Gateway — SDLC 流程规范

> 本文档定义本项目的软件开发生命周期流程，基于项目 skills 体系设计。每一个阶段的 rules 对所有 developer（人 + AI agent）具有同等约束力。

---

## 生命周期总览

```
SPEC ──→ INTERFACE ──→ PLAN ──→ IMPLEMENT ──→ REVIEW ──→ SHIP
  │          │           │          │            │          │
  ▼          ▼           ▼          ▼            ▼          ▼
SPEC.md   types.ts    tasks/      TDD +      Five-Axis   Release
           contracts  plan.md     Increments  Review     Script
```

每个阶段有明确的**入口条件**、**产出物**、**验证方式**。前一阶段验证通过才能进入下一阶段。

---

## Phase 1: SPEC — 规格驱动开发

**Skill**: `spec-driven-development`

### 入口条件
- 项目需求已口头对齐
- 无现有 spec 文件，或现有 spec 需重写

### 产出物
- `SPEC.md` — 项目唯一的真相源

### 规范内容（六要素）

| 要素 | 说明 | 本项目的关键约束 |
|------|------|-----------------|
| **Objective** | 做什么、为谁做、成功标准 | 输入 OpenAPI → 输出 MCP Server；AI 成功调用即达标 |
| **Commands** | 完整可执行命令 | `pnpm build`, `pnpm test`, `pnpm dev`, `pnpm lint` |
| **Project Structure** | 目录结构 + 职责说明 | monorepo: core / server / cli |
| **Code Style** | 命名 + 格式 + 真实代码示例 | TypeScript strict, 函数式优先, 蛇形命名 tool name |
| **Testing Strategy** | 框架、层级、覆盖率 | Vitest, 单元(80%) + 集成(15%) + E2E(5%) |
| **Boundaries** | Always / Ask First / Never | 见下方 |

### 三级边界

**Always Do（任何时候必须做）**:
- 先写 spec 再写代码
- `pnpm test` 通过后才能提交
- Zod `.strict()` 校验所有外部输入
- API 代理层的错误返回统一格式 `{ error: { code, message, suggestion } }`

**Ask First（必须征得同意）**:
- 新增 npm 依赖
- 修改 monorepo 包结构
- 变更 MCP SDK 版本
- 改变 transport 模式（stdio ↔ Streamable HTTP）

**Never Do（绝对禁止）**:
- 在代码中硬编码 API Key / Token
- 跳过 spec 直接写代码
- 删除失败的测试（必须修代码让测试过）
- 把 LLM 输出直接当命令执行

### 验证
- [ ] SPEC.md 存在于项目根目录
- [ ] 六要素全部覆盖
- [ ] 边界（Always/Ask First/Never）已定义
- [ ] 成功标准可测试（AI 调用 API 返回正确结果）

---

## Phase 2: INTERFACE — 接口与契约设计

**Skill**: `api-and-interface-design`

### 入口条件
- SPEC.md 已审批通过

### 设计原则

**1. 契约优先（Contract First）**

先定义 interface，再实现。本项目的核心契约：

```typescript
// 契约 1: OpenAPI Operation → MCP Tool 的映射接口
interface IOperationParser {
  parse(source: string): Promise<ApiOperation[]>;
}

// 契约 2: MCP Tool 运行时接口
interface IToolRegistry {
  register(op: ApiOperation, source: ApiSource): void;
  list(): MCPToolDef[];
  execute(name: string, args: Record<string, unknown>): Promise<CallToolResult>;
}

// 契约 3: API 代理接口
interface IApiProxy {
  execute(req: ProxyRequest): Promise<ProxyResult>;
}

// 契约 4: RAG 存储接口（支持 LanceDB / Memory 双实现）
interface IRagStore {
  index(operations: ApiOperation[], specName: string): Promise<void>;
  search(query: string, topK: number): Promise<SearchResult[]>;
}
```

**2. 统一的错误语义**

整个项目只用一种错误格式：

```typescript
// 所有 tool 返回的错误都用这个结构
interface ToolError {
  error: {
    code: string;       // 机器可读: "API_ERROR", "AUTH_ERROR", "RATE_LIMITED"
    message: string;    // 人类可读: "GitHub API returned 401 — check your GITHUB_TOKEN"
    suggestion?: string; // 告诉 AI 下一步该调什么: "Try github_list_issues with owner='octocat'"
  };
}
```

**3. 在边界验证**

- MCP Server 入口：用 Zod `.strict()` 校验所有 tool 参数
- API Proxy 出口：校验第三方 API 响应结构（第三方数据不可信）
- 包间调用：依赖 TypeScript 类型，不重复校验

**4. 增量扩展，不破坏**

- tool inputSchema 新增字段一律用 `.optional()` 
- 已有 tool 不改名、不删参数、不变参数类型
- CLI 新增 flag，旧 flag 保持兼容

**5. 命名一致性**

| 场景 | 约定 | 示例 |
|------|------|------|
| MCP tool 名 | `{source}_{verb}_{noun}` 蛇形 | `github_list_issues`, `notion_create_database` |
| TypeScript 接口 | PascalCase | `ApiOperation`, `MCPToolDef` |
| 文件命名 | kebab-case | `schema-mapper.ts`, `meta-tools.ts` |
| 环境变量 | UPPER_SNAKE | `GITHUB_TOKEN`, `NOTION_API_KEY` |
| Zod schema 变量 | PascalCase + Schema 后缀 | `CreateTaskSchema` |

### 验证
- [ ] 核心契约接口（IParser/IToolRegistry/IApiProxy/IRagStore）已定义为 TypeScript interface
- [ ] 错误格式统一为 `{ error: { code, message, suggestion? } }`
- [ ] 包间 API 有明确的输入/输出类型
- [ ] 命名规范与本文档一致

---

## Phase 3: PLAN — 规划与任务拆分

**Skill**: `planning-and-task-breakdown`

### 入口条件
- SPEC.md 和 interface 契约已就绪

### 规划步骤

**Step 1: 画依赖图**

```
OpenAPI Spec 解析 (core/parser)
    │
    ├── Operation → MCP Tool Schema 映射 (core/converter)
    │       │
    │       ├── MCP Server 运行时 (server/mcp-server)
    │       │       │
    │       │       ├── API 代理执行 (server/proxy)
    │       │       │       │
    │       │       │       └── Auth 注入 (server/auth)
    │       │       │
    │       │       └── CLI 入口 (cli/index)
    │       │
    │       └── Schema 增强器 (core/enhancer)
    │
    └── RAG 文档索引 (rag/indexer)
            │
            └── Agent 编排层 (agent/orchestrator)
```

**Step 2: 垂直切片**

不按"先做所有 core → 再做所有 server → 再做所有 cli"的水平切法，而是按功能路径垂直切：

```
Slice 1: 最小可用链 — Petstore spec → 1 个 MCP tool → MCP Inspector 调用成功
Slice 2: 单 API 完整链 — GitHub spec → 全部 tools → Claude Desktop 调通
Slice 3: Auth 注入链 — GitHub Token 配置 → 认证请求 → 返回真实数据
Slice 4: 多 API 聚合 — GitHub + Notion 双 spec → 各自 tools 共存
Slice 5: RAG 增强链 — 文档索引 → AI 检索后调用
Slice 6: Agent 编排链 — 跨 API 多步任务自主完成
```

**Step 3: 任务规格**

每个任务遵循此模板：

```markdown
## Task [N]: [简短描述标题]

**描述**: 一段话解释这个任务做什么

**验收标准**:
- [ ] 具体的、可测试的条件
- [ ] 具体的、可测试的条件

**验证**:
- [ ] 测试通过: `pnpm test -- --grep "feature-name"`
- [ ] 构建成功: `pnpm build`
- [ ] 手动验证: [描述验证步骤]

**依赖**: [依赖的 Task 编号，或 "无"]

**涉及文件**:
- `packages/core/src/parser.ts`
- `packages/core/src/__tests__/parser.test.ts`

**规模**: [XS: 1 文件 | S: 1-2 文件 | M: 3-5 文件]
```

**Step 4: 检查点**

每 2-3 个任务设一个检查点：

```markdown
## 检查点: Task 1-3 完成后
- [ ] 所有已有测试通过
- [ ] 构建零错误
- [ ] 核心用户流程 end-to-end 可用
- [ ] 与人类确认后再继续
```

### 任务规模约束

| 级别 | 文件数 | 示例 |
|------|--------|------|
| **XS** | 1 | 加一个类型定义 |
| **S** | 1-2 | 实现一个 parser 函数 |
| **M** | 3-5 | 完成一个垂直切片 |
| **L** | 5-8 | 多组件 feature |
| **XL** | 8+ | **不允许 —— 必须拆分** |

### 产出物
- `tasks/plan.md` — 实现方案和依赖图
- `tasks/todo.md` — 可勾选的任务清单

### 验证
- [ ] 每个任务有验收标准
- [ ] 每个任务有验证步骤
- [ ] 没有 XL 级任务
- [ ] 任务按依赖排序
- [ ] 检查点之间存在

---

## Phase 4: IMPLEMENT — 增量实现 + 测试驱动

**Skills**: `incremental-implementation` + `test-driven-development`

### 入口条件
- `tasks/plan.md` 和 `tasks/todo.md` 已审批

### 增量循环

```
┌──────────────────────────────────────┐
│                                      │
│   RED ──→ GREEN ──→ REFACTOR ──→ Commit  │
│    │                            │     │
│    └──── 下一个增量 ◄───────────┘     │
│                                      │
└──────────────────────────────────────┘
```

### TDD 三步

**RED — 先写失败的测试**:
```typescript
// core/src/__tests__/converter.test.ts
it('将 GET /users/{id} 映射为 MCP tool', () => {
  const op: ApiOperation = {
    operationId: 'getUser',
    method: 'GET',
    path: '/users/{id}',
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    // ...
  };
  const tool = convertOperation(op, 'api');
  expect(tool.name).toBe('api_get_user');
  expect(tool.inputSchema.properties).toHaveProperty('id');
});
```

**GREEN — 写最少代码让测试过**:
```typescript
// core/src/converter.ts
export function convertOperation(op: ApiOperation, source: string): MCPToolDef {
  // 最简实现，只要能过测试
  return {
    name: `${source}_${op.operationId.replace(/([A-Z])/g, '_$1').toLowerCase()}`,
    inputSchema: buildInputSchema(op.parameters),
    // ...
  };
}
```

**REFACTOR — 测试绿着的前提下重构**:
- 提取公共逻辑
- 改善命名
- 去重

### 增量规则

**Rule 0: 最简单的东西先上**

在写任何代码前问自己："能工作的最简方案是什么？"

```
SIMPLICITY CHECK:
✗ 搞一个通用 EventBus + 中间件管道，就为了发一个 notification
✓ 一个函数调用

✗ 抽象工厂模式，就为了两个相似组件
✓ 两个独立组件 + 少量共享工具函数
```

三个相似行 > 一个过早抽象。先写朴素正确的版本，测试通过后再考虑优化。

**Rule 0.5: 只碰任务范围内的文件**

禁止事项：
- "顺便清理" 相邻的代码
- "顺带重构" 不在本次任务中的文件
- 删除你不完全理解的注释
- 添加 spec 中没有的 feature

如果发现了值得改进的点，记录但不修改：

```
NOTICED BUT NOT TOUCHING:
- src/utils/format.ts 有个没用到的 import（与本次任务无关）
- auth 中间件的错误信息可以更好（另开任务）
→ 要不要为这些建 task？
```

**Rule 1: 一次只做一件事**

```
✗ 一个 commit 包含：新增 component + 重构已有 component + 改 build config
✓ 三个独立 commit
```

**Rule 2: 每次增量后可编译**

两个增量之间，项目必须能构建、已有测试必须全绿。

**Rule 3: 安全默认值**

```typescript
// Safe: 默认关闭，显式 opt-in
function createToolRegistry(options?: { enhance?: boolean }) {
  const shouldEnhance = options?.enhance ?? false;
  // ...
}
```

### 测试金字塔

```
          ╱╲
         ╱  ╲         E2E (5%) — Claude Desktop 连 Gateway 端到端
        ╱    ╲
       ╱──────╲
      ╱        ╲      Integration (15%) — Parser+Converter 联合, Proxy+Auth 联合
     ╱          ╲
    ╱────────────╲
   ╱              ╲   Unit (80%) — 纯函数逻辑，毫秒级
  ╱                ╲
```

### 本项目关键测试场景

| 层级 | 被测对象 | 关键用例 |
|------|---------|---------|
| Unit | `converter.ts` | operationId 蛇形化、参数映射、$ref 解析 |
| Unit | `proxy.ts` | URL 模板插值、auth header 注入、超时处理 |
| Unit | `auth.ts` | 多 API 不同 auth 共存、env var 解析 |
| Integration | Parser→Converter 链路 | Petstore spec → MCP tool defs |
| Integration | Proxy + Auth | 用 msw mock 第三方 API，验证请求正确 |
| E2E | Gateway 启动 + MCP Client | 启动 server → 连接 → tools/list → tools/call |

### 验证（每个增量后）
- [ ] `pnpm test` 全绿
- [ ] `pnpm build` 成功
- [ ] `pnpm lint` 通过
- [ ] 新功能行为正确
- [ ] Commit message 描述性强

---

## Phase 5: REVIEW — 多维度代码审查

**Skill**: `code-review-and-quality`

### 入口条件
- 功能增量已实现、测试通过、已提交

### 五轴审查

每条 review comment 必须标注严重程度：

| 标签 | 含义 | 作者操作 |
|------|------|---------|
| **Critical:** | 阻塞合并 | 安全漏洞/数据丢失/功能 break |
| (无前缀) | 必须修改 | merge 前必须解决 |
| **Nit:** | 小问题，可选 | 格式化/风格偏好，作者可忽略 |
| **Optional:** | 建议 | 值得考虑但不强制 |

**1. Correctness（正确性）**
- 代码是否匹配 spec/task 要求？
- 边界情况处理了吗（null、空、极大值）？
- 错误路径处理了吗（不只是 happy path）？
- 测试是否真的在测正确的东西？

**2. Readability（可读性）**
- 命名是否清晰、一致？
- 控制流是否直观（避免深层嵌套）？
- 是否有"聪明的"写法应该改成简单的？
- 有没有死代码（无用的变量、兼容 shim、注释掉的代码）？
- **是不是用更少的行就能完成？**（100 行能搞定的东西 1000 行就是失败）

**3. Architecture（架构）**
- 是否遵循已有模式？引入新模式是否合理？
- 模块边界是否清晰？
- 有没有循环依赖？
- **feature 逻辑有没有泄漏到共享/通用模块里？**
- **这次重构是降低了复杂度，还是只是搬了位置？**

**4. Security（安全）**
- 外部输入是否在边界校验？
- 有没有密钥硬编码？
- API 代理层有没有 SSRF 风险？（用户传入 URL 时）
- 第三方 API 响应是否被视为不可信数据？

**5. Performance（性能）**
- 有没有 N+1 查询模式？
- 列表接口是否分页？
- 有没有无界循环或无限数据拉取？

### 死代码清理

每次重构后检查：

```
DEAD CODE IDENTIFIED:
- formatLegacyDate() in src/utils/date.ts — 已被 formatDate() 替代
- OldTaskCard component — 已被 TaskCard 替代
→ 是否安全删除？
```

### 验证
- [ ] 所有 Critical 和 Required 问题已解决
- [ ] 测试全绿
- [ ] `pnpm build` 成功
- [ ] 涉及安全的改动需特别关注

---

## Phase 6: SECURITY — 安全加固

**Skill**: `security-and-hardening`

### 入口条件
- 功能实现完成，review 通过

### 威胁模型（5 分钟 striding）

本项目的攻击面：

| 边界 | 威胁 | 缓解措施 |
|------|------|---------|
| MCP endpoint (POST /mcp) | 未认证的调用者 | 默认 bind `127.0.0.1`，不暴露到公网 |
| API Proxy (fetch 第三方) | SSRF | 只往已知 API base URL 发请求，验证 redirect 目标 |
| OpenAPI Spec 输入 | 恶意 spec 文件 | 校验 JSON/YAML schema 合法性，限制文件大小 |
| Auth 配置 | 密钥泄漏 | 只用 env var，绝不在代码/log/错误信息中出现 |
| Agent 编排 (LLM 输出) | Prompt Injection | LLM 输出不直接执行，tool 参数强制 Zod 校验 |
| RAG 向量存储 | 数据投毒 | 校验索引内容来源（只索引已验证的 spec） |

### 三级边界（与 Phase 1 一致）

**Always**:
- Zod `.strict()` 校验所有外部输入
- Parameterized URL 构建（不用字符串拼接）
- API 代理结果校验后再返回给 AI
- Auth header 只从 env var 读取

**Ask First**:
- 新增外部 API 调用
- 修改 CORS / helmet 配置
- 增加文件上传处理

**Never**:
- 提交 `.env` / 密钥到 git
- `eval()` / `innerHTML` 处理外部数据
- 把 LLM 输出直接当 SQL / shell / 文件路径执行
- 在日志中打印 token / password

### API 代理层安全（本项目特有）

```typescript
// SSRF 防护：代理层只向已注册的 API base URL 发请求
async function assertSafeProxy(url: string, allowedBaseUrls: Set<string>): Promise<URL> {
  const parsed = new URL(url);
  if (![...allowedBaseUrls].some(base => parsed.href.startsWith(base))) {
    throw new SecurityError(`URL ${url} is not in allowed base URLs`);
  }
  if (parsed.protocol !== 'https:') {
    throw new SecurityError('Only HTTPS allowed for API proxy');
  }
  return parsed;
}
```

### AI / LLM 安全（Agent 编排特有）

- **LLM 输出是不可信数据**：Agent orchestrator 收到 tool call 后，参数必须用 Zod 再校验一遍
- **System prompt 不是安全边界**：不要在 prompt 里放密钥
- **Tool 权限最小化**：Agent 只能调用已注册的 MCP tool，不能执行任意代码

### 验证
- [ ] `git diff --cached | grep -i "password\|secret\|api_key\|token"` 空
- [ ] 所有外部输入有 Zod `.strict()` 校验
- [ ] API 代理层限制了目标 URL 范围
- [ ] 测试覆盖了 error path（401/403/429/500）

---

## Phase 7: CONTEXT — 上下文工程

**Skill**: `context-engineering`

### 入口条件
- 项目开始前，持续维护

### 上下文层级

```
┌─────────────────────────────────────┐
│  1. CLAUDE.md                       │ ← 每次 session 自动加载
├─────────────────────────────────────┤
│  2. SPEC.md + SDLC.md               │ ← 按需加载相关章节
├─────────────────────────────────────┤
│  3. 相关源码 + types.ts             │ ← 每个 task 前读取
├─────────────────────────────────────┤
│  4. 测试输出 + 错误日志             │ ← 每次迭代反馈
├─────────────────────────────────────┤
│  5. 对话历史（压缩）                │ ← 跨 session 持久化
└─────────────────────────────────────┘
```

### CLAUDE.md 模板（项目根目录）

```markdown
# API-to-MCP Gateway

## Tech Stack
- TypeScript 5 (strict mode), Node.js 20+
- pnpm workspace monorepo
- MCP SDK v1.29+ (`@modelcontextprotocol/sdk`)
- Express + @modelcontextprotocol/express
- Zod v4, @apidevtools/swagger-parser, undici, LanceDB

## Commands
- 安装: `pnpm install`
- 构建: `pnpm build`
- 测试: `pnpm test`
- Lint: `pnpm lint`
- 开发: `pnpm dev`
- 启动: `pnpm start -- --spec ./specs/github.openapi.json`

## Code Conventions
- 文件名 kebab-case, 接口 PascalCase, tool 名 snake_case
- 每个包独立 tsconfig + tsup.config
- Zod `.strict()` 校验所有外部输入
- 统一错误格式: `{ error: { code, message, suggestion? } }`
- 先写测试（RED → GREEN → REFACTOR）

## Boundaries
- Never: 提交密钥、跳过 spec、删失败测试
- Ask First: 新增依赖、改包结构、改 SDK 版本、改 transport
- Always: 测试通过后提交、先 spec 后代码
```

### 上下文打包策略

**Task 前**（选择性加载）:
```
TASK: 实现 converter.ts 的参数映射
RELEVANT FILES:
- packages/core/src/types.ts (类型定义)
- packages/core/src/converter.ts (要改的文件)
- packages/core/src/__tests__/converter.test.ts (测试)
PATTERN TO FOLLOW:
- 看 parser.ts 里怎么处理 ApiOperation 的
CONSTRAINT:
- inputSchema 必须用 fromJsonSchema()，不要手动拼
```

**混淆时**（立即上报）:
```
CONFUSION:
Spec 说用 Zod v4 的 fromJsonSchema()，但我看到 MCP SDK v1.29 
同时暴露了 fromJsonSchema 和 zodToJsonSchema。
→ 用哪个？我的判断是用 fromJsonSchema，因为 inputSchema 需要 Zod 对象。
```

### 验证
- [ ] CLAUDE.md 在项目根目录存在且更新
- [ ] 每个新 session 开始前读了相关上下文
- [ ] 上下文没有过载（单 task < 2000 行上下文）

---

## Phase 8: DOCUMENT — 文档与决策记录

**Skills**: `documentation-and-adrs`

### 入口条件
- 贯穿整个 SDLC，持续产出

### ADR（架构决策记录）

存放位置: `docs/decisions/`

```markdown
# ADR-001: 选择 Streamable HTTP 为唯一 transport

## Status
Accepted

## Context
需要选择 MCP transport。选项:
- stdio: Claude Desktop 默认，但只能本地单客户端
- SSE (HTTP+SSE): 多客户端，但已被 MCP spec 标记为 deprecated
- Streamable HTTP: 2025 新标准，单 endpoint，支持无状态模式

## Decision
只用 Streamable HTTP。

## Alternatives Considered
- stdio: 拒绝。Gateway 需要同时服务多个 AI 客户端。
- 双 transport: 拒绝。维护两个 transport 增加了不必要的复杂度。

## Consequences
- 需要 Express HTTP server（已选）
- Claude Desktop 需要通过 HTTP 连接（需配置 mcp.json）
- 未来 MCP v2 stateless 模式更容易迁移
```

### 本项目需要写 ADR 的决策

1. **Transport 选型** — 为什么只选 Streamable HTTP
2. **Monorepo 结构** — 为什么 3 个包而不是 6 个
3. **RAG 存储** — 为什么 LanceDB + Memory fallback，不用 Chroma
4. **工具生成模式** — 为什么静态预生成 + 动态 meta-tool 双模式
5. **LLM 增强** — 为什么用 Claude 优化 description，什么时候触发

### README 结构

```markdown
# API-to-MCP Gateway
一句话描述

## Quick Start
1. Clone + pnpm install
2. cp .env.example .env
3. pnpm start -- --spec ./specs/petstore.yaml

## Commands
| 命令 | 说明 |
|------|------|
| `pnpm dev` | 开发模式 |
| `pnpm build` | 构建 |
| `pnpm test` | 运行测试 |

## Architecture
架构图 + 包职责说明 + ADR 链接

## Usage Example
快速使用示例脚本
```

### 注释原则

注释 **why**，不注释 **what**：

```typescript
// BAD: 重复代码
// 把所有 parameters 转成 Zod schema
const schema = buildZodSchema(params);

// GOOD: 解释非显而易见的意图
// fromJsonSchema 内部处理了 nullable + enum + default 的组合，
// 比手写 Zod 转换少 40 行且不漏 edge case
const schema = fromJsonSchema(jsonSchema);
```

### 验证
- [ ] ADR 覆盖所有关键架构决策
- [ ] README 包含 Quick Start + Commands + Architecture
- [ ] 没有注释掉的代码残留
- [ ] CLAUDE.md 内容准确且是最新的

---

## 流程检查清单（每个 feature 完成后）

```markdown
### SPEC
- [ ] SPEC.md 更新（如有变更）
- [ ] 边界（Always/Ask First/Never）未被违反

### INTERFACE
- [ ] 新增接口有 TypeScript 类型定义
- [ ] 错误格式统一
- [ ] 向后兼容（新增字段 optional，旧字段不变）

### PLAN
- [ ] tasks/plan.md 和 tasks/todo.md 更新
- [ ] 没有 XL 级未拆分的任务

### IMPLEMENT
- [ ] RED → GREEN → REFACTOR 循环完整
- [ ] pnpm test 全绿
- [ ] pnpm build 成功
- [ ] 每个 commit 是单一逻辑变更

### REVIEW
- [ ] 五轴审查通过
- [ ] Critical/Required 问题已解决
- [ ] 死代码已清理

### SECURITY
- [ ] git diff 无密钥泄漏
- [ ] 外部输入 Zod .strict() 校验
- [ ] npm audit 无 critical/high

### DOCUMENT
- [ ] 关键决策有 ADR
- [ ] README 未过时
```

---

## 参考

本项目使用的 skills 全集（位于 `D:\Code\Work_Code\Document\AI-Tools\ai-skills\skills\`）：

| Skill | 对应 SDLC 阶段 | 优先级 |
|-------|---------------|--------|
| `spec-driven-development` | Phase 1: SPEC | 强制 |
| `api-and-interface-design` | Phase 2: INTERFACE | 强制 |
| `planning-and-task-breakdown` | Phase 3: PLAN | 强制 |
| `test-driven-development` | Phase 4: IMPLEMENT | 强制 |
| `incremental-implementation` | Phase 4: IMPLEMENT | 强制 |
| `code-review-and-quality` | Phase 5: REVIEW | 强制 |
| `security-and-hardening` | Phase 6: SECURITY | 强制 |
| `context-engineering` | Phase 7: CONTEXT | 持续 |
| `documentation-and-adrs` | Phase 8: DOCUMENT | 持续 |
| `git-workflow-and-versioning` | 贯穿全流程 | 建议 |
| `source-driven-development` | 参考现有实现 | 建议 |
