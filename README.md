<!-- 兼容旧版 GitHub 的「回到顶部」锚点 -->
<a id="readme-top"></a>

<!-- 徽章 -->
[![Node][node-shield]][node-url]
[![TypeScript][typescript-shield]][typescript-url]
[![pnpm][pnpm-shield]][pnpm-url]
[![MCP][mcp-shield]][mcp-url]
[![Issues][issues-shield]][issues-url]
[![License: MIT][license-shield]][license-url]

<!-- 标题 -->
<br />

<div align="center">
  <h3 align="center">API-to-MCP Gateway</h3>

  <p align="center">
    把 OpenAPI 文档变成<b>安全、可治理、可审计</b>的 MCP 工具层，让 AI Agent <b>按权限</b>调用现有 API。
    <br />
    <a href="docs/README.md"><strong>浏览文档 »</strong></a>
    <br />
    <br />
    <a href="https://github.com/PPACT/api-to-mcp-gateway/issues">报告问题</a>
    &middot;
    <a href="https://github.com/PPACT/api-to-mcp-gateway/issues">请求功能</a>
  </p>
</div>

<!-- 目录 -->
<details>
  <summary>目录</summary>
  <ol>
    <li>
      <a href="#关于本项目">关于本项目</a>
      <ul>
        <li><a href="#工作原理">工作原理</a></li>
        <li><a href="#技术栈">技术栈</a></li>
      </ul>
    </li>
    <li>
      <a href="#快速开始">快速开始</a>
      <ul>
        <li><a href="#前置要求">前置要求</a></li>
        <li><a href="#安装">安装</a></li>
      </ul>
    </li>
    <li><a href="#使用">使用</a></li>
    <li><a href="#现状与路线">现状与路线</a></li>
    <li><a href="#配置">配置</a></li>
    <li><a href="#项目结构">项目结构</a></li>
    <li><a href="#贡献">贡献</a></li>
    <li><a href="#许可证">许可证</a></li>
    <li><a href="#致谢">致谢</a></li>
  </ol>
</details>

---

## 关于本项目

把任意 **OpenAPI / Swagger** 文档转换成一个运行中的 **MCP Server** —— AI Agent 即可直接调用这些 API，无需为每个接口手写集成代码。

- **解析**：从 OpenAPI 文档中提取全部 operation（路径、方法、参数、请求体）
- **转换**：每个 operation 映射为一个 MCP tool（`{source}_{snake_case}` 命名，参数转为 JSON Schema）
- **服务**：通过 JSON-RPC 2.0 暴露 `tools/list` 与 `tools/call`
- **代理**：把 tool 调用拼装为真实 HTTP 请求，注入凭证后转发

> ⚠️ **定位是目标，不全是现状。** 上面「安全 / 可治理 / 可审计 / **按权限**」中的**「可审计」「按权限」当前尚未实现**。
> 每一项的真实状态（已实现 ✅ / 部分 🟡 / 未实现 ❌）以 **[能力矩阵](docs/README.md#能力矩阵)** 为唯一事实源 —— 请以它为准。

### 工作原理

```
OpenAPI 文档 ──▶ Parser ──▶ Converter ──▶ ToolRegistry ──▶ MCP Server (JSON-RPC)
                                              │
                                              ▼
                                       API Proxy ──HTTP──▶ 目标 API
                                       AuthManager
                                       RAG Retriever
                                       Agent Orchestrator
```

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

### 技术栈

[![TypeScript][typescript-shield]][typescript-url]
[![Node.js][node-shield]][node-url]
[![pnpm][pnpm-shield]][pnpm-url]

TypeScript 5（strict）· Node.js 20+ · pnpm workspace monorepo。
JSON-RPC 2.0（**自实现**，未依赖 MCP SDK）· `zod` · `yaml` · Vitest。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

---

## 快速开始

### 前置要求

- **Node.js ≥ 20**
- **pnpm 9**

### 安装

```bash
pnpm install
pnpm build        # ⚠️ 必需：`pnpm start` 运行的是编译产物 packages/cli/dist/index.js
```

启动 MCP Server：

```bash
pnpm start -- --spec ./specs/petstore.yaml
```

服务监听 `http://127.0.0.1:3000/mcp`，可连接 Claude Desktop、Codex 或任意 MCP 客户端。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

---

## 使用

```
api2mcp serve  --spec <路径或 URL> [选项]    启动 MCP Server 并代理 API 调用
api2mcp render --spec <路径或 URL> [选项]    输出 MCP tool 定义（给 AI 读的 JSON）
```

```bash
# 多个 API 合到一个 Server（tool 名以 source 前缀区分）
pnpm start -- --spec ./github.yaml --spec ./notion.yaml

# 直接从远程 URL 拉取 spec
pnpm start -- --spec https://example.com/openapi.json

# 不启动服务，只导出 tool 定义
pnpm start -- render --spec ./specs/petstore.yaml --output mcp-tools.json

# 启动前给 API 文档质量打分
pnpm start -- serve --spec ./specs/petstore.yaml --score
```

**完整选项、MCP 客户端接入配置、评分 / 增强 / Agent 模式** → [docs/usage.md](docs/usage.md)

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

---

## 现状与路线

**能力现状见 [能力矩阵](docs/README.md#能力矩阵)** —— 那里逐项标注「已实现 / 部分 / 未实现」并附源码位置。**标 ❌ 的项即为路线图**，本文不重复罗列（避免两处清单漂移）。

架构、扩展点与已知简化 → [docs/architecture.md](docs/architecture.md)　｜　安全模型与**当前边界** → [docs/security.md](docs/security.md)

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

---

## 配置

认证通过**环境变量**注入（命名规则 `{SOURCE}_TOKEN` 或 `{SOURCE}_API_KEY`）—— 凭证**不写进任何文件**：

```bash
export GITHUB_TOKEN=<你的令牌>
export NOTION_API_KEY=<你的密钥>
pnpm start -- --spec ./github.yaml --spec ./notion.yaml
```

LLM 相关能力（质量增强 / Agent 模式 / 语义检索）需要 `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY`。
完整的环境变量清单见 [docs/usage.md](docs/usage.md#环境变量汇总)。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

---

## 项目结构

```
packages/
  core/       OpenAPI 解析 + tool schema 转换 + 文档质量评分 / 增强
  server/     MCP 运行时：tools · proxy · auth · JSON-RPC
  cli/        CLI 入口（多 spec、远程 URL、render）
  rag/        向量存储 + 语义检索
  agent/      编排器：RAG → LLM → tool 调用 → 循环
specs/        示例 OpenAPI 文档（Petstore）
docs/         公开文档（架构 / 使用 / 安全 / 能力矩阵）
```

> ⚠️ `core` 是**根依赖** —— 改动它的公开导出会影响全部下游包。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

---

## 贡献

欢迎提交 issue 与 pull request。

改动请一并满足：

- **新增 / 修改行为带测试**
- **类型闸通过**：`pnpm -r build`
- **测试通过**：`pnpm --filter @api2mcp/core --filter @api2mcp/agent test`

> ⚠️ `vitest` **不做类型检查** —— 「测试绿」不等于「能编译」。两者必须**分别跑**。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

---

## 许可证

基于 **MIT 许可证**分发 —— 详见 [`LICENSE`](LICENSE)。

任何人都可以自由地使用、复制、修改、合并、发布、分发、再许可和/或销售本软件，
唯一要求是**保留版权声明与许可证声明**。本软件按「原样」提供，**不含任何担保**。

> ⚠️ 取舍说明：MIT **不含显式的专利授权条款**（对比 Apache-2.0）。选它换取的是**最短、最低摩擦**。

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

---

## 致谢

- [Model Context Protocol](https://modelcontextprotocol.io) —— MCP 与 JSON-RPC 2.0 协议
- [`zod`](https://zod.dev)、[`yaml`](https://github.com/eemeli/yaml)、[Vitest](https://vitest.dev)
- 本 README 的结构参考 [Best-README-Template](https://github.com/othneildrew/Best-README-Template)

<p align="right">(<a href="#readme-top">回到顶部</a>)</p>

---

<!-- 引用式链接：徽章与目标（集中定义，便于统一修改） -->
[repo-url]: https://github.com/PPACT/api-to-mcp-gateway

[node-shield]: https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=for-the-badge&logo=nodedotjs&logoColor=white
[node-url]: https://nodejs.org
[typescript-shield]: https://img.shields.io/badge/TypeScript-5.5-3178c6?style=for-the-badge&logo=typescript&logoColor=white
[typescript-url]: https://www.typescriptlang.org
[pnpm-shield]: https://img.shields.io/badge/pnpm-9-f69220?style=for-the-badge&logo=pnpm&logoColor=white
[pnpm-url]: https://pnpm.io
[mcp-shield]: https://img.shields.io/badge/MCP-JSON--RPC%202.0-6e56cf?style=for-the-badge
[mcp-url]: https://modelcontextprotocol.io
[issues-shield]: https://img.shields.io/github/issues/PPACT/api-to-mcp-gateway?style=for-the-badge
[issues-url]: https://github.com/PPACT/api-to-mcp-gateway/issues
[license-shield]: https://img.shields.io/badge/license-MIT-blue?style=for-the-badge
[license-url]: LICENSE
